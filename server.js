const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 儲存最近的聊天紀錄，並設定上限為 50 則
const MAX_HISTORY = 50;
// 將原本的單一陣列改成物件，用來儲存不同房間的歷史紀錄
const rooms = {
    '綜合閒聊': { messages: [], createdAt: Date.now() }
}; // 預設提供一個大廳

// 設定靜態檔案資料夾，讓 Express 可以提供 HTML, CSS, JS 檔案
app.use(express.static('public'));

// 取得並排序房間列表的輔助函式
const getSortedRoomList = () => {
    const roomList = Object.keys(rooms).map(name => {
        const roomData = io.sockets.adapter.rooms.get(name);
        const userCount = roomData ? roomData.size : 0;
        return {
            name,
            createdAt: rooms[name].createdAt,
            userCount
        };
    });
    roomList.sort((a, b) => b.createdAt - a.createdAt); // 最新的在前面
    return roomList;
};

// 監聽使用者的 Socket.io 連線
io.on('connection', (socket) => {
    // 取 socket.id 的前 6 個字元作為匿名使用者的隨機 ID
    const userId = socket.id.substring(0, 6);
    console.log(`匿名使用者 ${userId} 已連線`);

    // 當新使用者連線時，傳送目前所有可用房間列表
    socket.emit('room list', getSortedRoomList());

    // 監聽建立新話題房間
    socket.on('create room', (roomName) => {
        if (!rooms[roomName]) {
            rooms[roomName] = { messages: [], createdAt: Date.now() };
            // 廣播給所有人更新房間列表
            io.emit('room list', getSortedRoomList());
        }
    });

    // 監聽加入房間
    socket.on('join room', (roomName) => {
        // 離開其他的話題房間 (避免收到其他房間的訊息)
        socket.rooms.forEach(room => {
            if (room !== socket.id) socket.leave(room);
        });
        socket.join(roomName);
        // 傳送該房間的歷史訊息
        socket.emit('chat history', rooms[roomName] ? rooms[roomName].messages : []);
        // 廣播給所有人更新房間列表 (因為人數變動)
        io.emit('room list', getSortedRoomList());
    });

    // 監聽離開房間 (返回大廳時觸發)
    socket.on('leave room', (roomName) => {
        socket.leave(roomName);
        // 廣播給所有人更新房間列表
        io.emit('room list', getSortedRoomList());
    });

    // 監聽來自前端的 'chat message' 事件
    socket.on('chat message', (data) => {
        const { room, text } = data;
        const messageData = { id: userId, text: text, timestamp: Date.now() };

        if (rooms[room] && rooms[room].messages) {
            // 將新訊息存入該房間的歷史紀錄
            rooms[room].messages.push(messageData);
            if (rooms[room].messages.length > MAX_HISTORY) {
                rooms[room].messages.shift();
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
        setTimeout(() => io.emit('room list', getSortedRoomList()), 100);
    });
});

// 啟動伺服器，監聽 3000 埠
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Baha 匿名論壇伺服器已啟動： http://localhost:${PORT}`);
});
