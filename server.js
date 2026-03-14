const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 儲存最近的聊天紀錄，並設定上限為 50 則
const MAX_HISTORY = 50;

// 設定 Email 發送器 (需在 Render 設定環境變數 EMAIL_USER 和 EMAIL_PASS)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});
let hasSentUpgradeEmail = false; // 避免人數在 189~190 之間浮動時狂發 Email

// 1. 連線到 MongoDB (環境變數 MONGODB_URI 是留給 Render 設定用的)
const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/baha';
mongoose.connect(mongoURI)
    .then(() => console.log('✅ MongoDB 資料庫連線成功'))
    .catch(err => console.error('❌ MongoDB 連線失敗:', err));

// 2. 建立資料庫結構 (Schema) 與模型 (Model)
const roomSchema = new mongoose.Schema({
    name: { type: String, unique: true },
    createdAt: { type: Number, default: Date.now }
});
const Room = mongoose.model('Room', roomSchema);

const messageSchema = new mongoose.Schema({
    roomName: String,
    id: String,
    text: String,
    timestamp: { type: Number, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// 3. 確保預設的「綜合閒聊」大廳永遠存在
Room.findOne({ name: '綜合閒聊' }).then(room => {
    if (!room) {
        Room.create({ name: '綜合閒聊', createdAt: Date.now() });
    }
});

// 設定靜態檔案資料夾，讓 Express 可以提供 HTML, CSS, JS 檔案
app.use(express.static('public'));

// 取得並排序房間列表的輔助函式
const getSortedRoomList = async () => {
    // 從資料庫撈取所有房間，並依建立時間反向排序
    const dbRooms = await Room.find().sort({ createdAt: -1 });
    const roomList = dbRooms.map(room => {
        const roomData = io.sockets.adapter.rooms.get(room.name);
        const userCount = roomData ? roomData.size : 0;
        return {
            name: room.name,
            createdAt: room.createdAt,
            userCount
        };
    });
    return roomList;
};

// 監聽使用者的 Socket.io 連線
io.on('connection', async (socket) => {
    // 取 socket.id 的前 6 個字元作為匿名使用者的隨機 ID
    const userId = socket.id.substring(0, 6);
    console.log(`匿名使用者 ${userId} 已連線`);

    // 檢查總線上人數並發送提醒
    const totalUsers = io.engine.clientsCount;
    if (totalUsers >= 190 && !hasSentUpgradeEmail) {
        hasSentUpgradeEmail = true;
        try {
            await transporter.sendMail({
                from: `"Baha 系統通知" <${process.env.EMAIL_USER}>`,
                to: 'pudding050@gmail.com',
                subject: '🚨【Baha】線上人數已達 190 人，請注意伺服器負載！',
                text: `目前網站線上人數已達 ${totalUsers} 人。\n\n這是一個系統自動提醒，建議您登入 Render 檢查伺服器狀態，或考慮升級伺服器方案以應付更高的流量。`
            });
            console.log('✅ 已成功發送人數達標 Email 提醒！');
        } catch (error) {
            console.error('❌ Email 發送失敗:', error);
        }
    }

    // 當新使用者連線時，傳送目前所有可用房間列表
    socket.emit('room list', await getSortedRoomList());

    // 監聽建立新話題房間
    socket.on('create room', async (roomName) => {
        const existingRoom = await Room.findOne({ name: roomName });
        if (!existingRoom) {
            await Room.create({ name: roomName, createdAt: Date.now() });
            // 廣播給所有人更新房間列表
            io.emit('room list', await getSortedRoomList());
        }
    });

    // 監聽加入房間
    socket.on('join room', async (roomName) => {
        // 離開其他的話題房間 (避免收到其他房間的訊息)
        socket.rooms.forEach(room => {
            if (room !== socket.id) socket.leave(room);
        });
        socket.join(roomName);
        // 從資料庫讀取該房間的歷史訊息 (最多撈 50 筆，按時間正序排)
        const messages = await Message.find({ roomName }).sort({ timestamp: 1 }).limit(MAX_HISTORY);
        socket.emit('chat history', messages);
        // 廣播給所有人更新房間列表 (因為人數變動)
        io.emit('room list', await getSortedRoomList());
    });

    // 監聽離開房間 (返回大廳時觸發)
    socket.on('leave room', async (roomName) => {
        socket.leave(roomName);
        // 廣播給所有人更新房間列表
        io.emit('room list', await getSortedRoomList());
    });

    // 監聽來自前端的 'chat message' 事件
    socket.on('chat message', async (data) => {
        const { room, text } = data;
        const messageData = { id: userId, text: text, timestamp: Date.now() };

        const existingRoom = await Room.findOne({ name: room });
        if (existingRoom) {
            // 1. 將新訊息存入資料庫
            await Message.create({ roomName: room, ...messageData });
            
            // 2. 避免無上限增長：如果超過 50 則，刪除最舊的訊息
            const msgCount = await Message.countDocuments({ roomName: room });
            if (msgCount > MAX_HISTORY) {
                const oldestMsg = await Message.findOne({ roomName: room }).sort({ timestamp: 1 });
                if (oldestMsg) await Message.deleteOne({ _id: oldestMsg._id });
            }

            // 只將訊息廣播給在同一個房間的使用者
            io.to(room).emit('chat message', messageData);
        }
    });

    // 監聽使用者斷線
    socket.on('disconnect', () => {
        console.log(`匿名使用者 ${userId} 已離線`);
        // 使用者斷線後，房間人數會自動更新，我們需要廣播最新的列表
        // 使用 setTimeout 確保 adapter 的房間資訊已更新
        setTimeout(async () => io.emit('room list', await getSortedRoomList()), 100);

        // 當人數降回 150 人以下時，重置 Email 發送狀態，以便下次再度達標時能重新提醒
        const currentTotalUsers = io.engine.clientsCount;
        if (currentTotalUsers < 150) {
            hasSentUpgradeEmail = false;
        }
    });
});

// 啟動伺服器，監聽 3000 埠
const PORT = process.env.PORT || 3000;
// 加入 '0.0.0.0' 確保雲端平台可以正確路由流量
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Baha 匿名論壇伺服器已啟動，監聽 Port：${PORT}`);
});
