require('dotenv').config(); // 載入 .env 檔案中的環境變數
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { handleCommand } = require('./command-handler');
const { LOAD_HISTORY_LIMIT } = require('./config');
const { getSortedRoomList } = require('./utils/room-list');
const { registerRoomHandlers } = require('./sockets/room-handlers');
const { registerThreadHandlers } = require('./sockets/thread-handlers');
const { registerChatHandlers } = require('./sockets/chat-handlers');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const VALID_USER_ID = /^[A-Za-z0-9]{8,10}$/;

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
async function connectDB() {
    let mongoURI = process.env.MONGODB_URI;
    
    // 如果沒有設定 MONGODB_URI (代表在本地端)，就啟動虛擬記憶體資料庫
    if (!mongoURI) {
        const mongoServer = await MongoMemoryServer.create();
        mongoURI = mongoServer.getUri();
        console.log('💡 啟動本地虛擬記憶體 MongoDB 模式');
        console.log(`🔗 請打開 MongoDB Compass，貼上以下網址連線查看資料：\n${mongoURI}`);
    }

    mongoose.connect(mongoURI)
        .then(() => console.log('✅ MongoDB 資料庫連線成功'))
        .catch(err => console.error('❌ MongoDB 連線失敗:', err));
}
connectDB();

// 2. 載入資料庫模型 (Models)
const Room = require('./models/Room');
const Announcement = require('./models/Announcement');

// 3. 確保預設的「綜合閒聊」大廳永遠存在
Room.findOne({ name: '綜合閒聊' }).then(room => {
    if (!room) {
        Room.create({ name: '綜合閒聊', createdAt: Date.now() });
    }
});

// 設定靜態檔案資料夾，讓 Express 可以提供 HTML, CSS, JS 檔案
app.use(express.static('public'));

// 輕量級網頁摘要抓取函式 (抓取 Open Graph 標籤)
async function fetchLinkPreview(text) {
    const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
    if (!urlMatch) return null;
    const url = urlMatch[0];

    // 跳過多媒體檔案、YouTube 或 Google Drive 網址 (因為前端已經有專屬播放器或預覽了)
    if (/\.(png|jpe?g|gif|webp|mp4|webm|mov|mp3|wav|m4a|ogg)(\?.*)?$/i.test(url)) return null;
    if (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('drive.google.com')) return null;

    try {
        // 設定 2.5 秒超時，避免因為對方網站太慢導致聊天延遲
        const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
        if (!response.ok) return null;
        const html = await response.text();

        const getMeta = (name) => {
            const match = html.match(new RegExp(`<meta[^>]+(?:property|name)="'?${name}["'][^>]+content=["']([^"']+)["']`, 'i')) || 
                          html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)="'?${name}["']`, 'i'));
            return match ? match[1] : null;
        };

        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        let title = getMeta('title') || (titleMatch ? titleMatch[1] : null);
        let description = getMeta('description') || '';
        let image = getMeta('image') || '';

        if (title) {
            // 處理相對路徑圖片轉絕對路徑
            if (image && !image.startsWith('http')) image = new URL(image, url).href;
            // 簡易 HTML 解碼
            title = title.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
            description = description.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
            return { url, title, description, image };
        }
    } catch (err) { /* 忽略抓取錯誤，直接回傳 null */ }
    return null;
}

// 監聽使用者的 Socket.io 連線
io.on('connection', async (socket) => {
    const requestedId = socket.handshake?.auth?.userId;
    const userId = (typeof requestedId === 'string' && VALID_USER_ID.test(requestedId))
        ? requestedId
        : socket.id.substring(0, 6);
    socket.userId = userId;
    socket.isAdmin = false; // 預設為一般使用者
    socket.adminRooms = new Set();
    socket.mutedRooms = new Map();
    socket.loginAttempts = 0; // 初始化登入嘗試次數
    socket.lockoutUntil = null; // 初始化鎖定時間
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
    socket.emit('room list', await getSortedRoomList(io));
    
    // 傳送歷史公告列表 (最多拿最新 20 筆)
    const announcements = await Announcement.find().sort({ createdAt: -1 }).limit(20);
    socket.emit('announcement list', announcements);

    registerRoomHandlers(socket, io);
    registerThreadHandlers(socket, io);
    registerChatHandlers(socket, io, fetchLinkPreview, handleCommand);

    // 監聽使用者斷線
    socket.on('disconnect', () => {
        console.log(`匿名使用者 ${userId} 已離線`);
        // 使用者斷線後，房間人數會自動更新，我們需要廣播最新的列表
        // 使用 setTimeout 確保 adapter 的房間資訊已更新
        setTimeout(async () => io.emit('room list', await getSortedRoomList(io)), 100);

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
    console.log(`Baha 匿名論壇伺服器已啟動， http://localhost:${PORT}/`);
});
