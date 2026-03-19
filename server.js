require('dotenv').config(); // 載入 .env 檔案中的環境變數

// --- 全域錯誤防護 (防止未處理的異步錯誤導致伺服器崩潰) ---
process.on('uncaughtException', (err) => {
    console.error(`🚨 [全域意外異常] ${new Date().toLocaleString()}:`, err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`⚠️ [全域未處理 Rejection] ${new Date().toLocaleString()} 原因:`, reason);
});

// 日誌輔助工具
const log = (...args) => console.log(`[${new Date().toLocaleTimeString()}]`, ...args);
const error = (...args) => console.error(`[${new Date().toLocaleTimeString()}] ❌`, ...args);
const express = require('express');
const http = require('http');
const os = require('os');
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
        log('💡 啟動本地虛擬記憶體 MongoDB 模式');
        log(`🔗 請打開 MongoDB Compass，貼上以下網址連線查看資料：\n${mongoURI}`);
    }

    mongoose.connect(mongoURI)
        .then(() => log('✅ MongoDB 資料庫連線成功'))
        .catch(err => error('❌ MongoDB 連線失敗:', err));
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

async function buildServerStatus(io) {
    const [roomCount, announcementCount] = await Promise.all([
        Room.countDocuments(),
        Announcement.countDocuments()
    ]);

    const memoryUsage = process.memoryUsage();
    return {
        connectedUsers: io.engine.clientsCount,
        roomCount,
        announcementCount,
        uptimeSeconds: Math.floor(process.uptime()),
        loadAverage: os.loadavg(),
        memoryUsage: {
            rss: memoryUsage.rss,
            heapUsed: memoryUsage.heapUsed,
            heapTotal: memoryUsage.heapTotal,
            external: memoryUsage.external
        },
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        hostname: os.hostname(),
        pid: process.pid,
        timestamp: new Date().toISOString()
    };
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
    const currentTotalUsers = io.engine.clientsCount;
    log(`📡 [連線] 匿名使用者 ${userId} (ID: ${socket.id}) 已進入，當前總人數: ${currentTotalUsers}`);

    // 當新使用者連線時，傳送目前所有可用房間列表
    socket.emit('room list', await getSortedRoomList(io));

    // 傳送歷史公告列表 (最多拿最新 20 筆)
    const announcements = await Announcement.find().sort({ createdAt: -1 }).limit(20);
    socket.emit('announcement list', announcements);

    socket.on('request server status', async (callback) => {
        try {
            const status = await buildServerStatus(io);
            if (typeof callback === 'function') {
                callback(status);
            } else {
                socket.emit('server status', status);
            }
        } catch (err) {
            error('取得伺服器狀態失敗:', err);
            if (typeof callback === 'function') {
                callback({ error: '無法取得伺服器狀態' });
            }
        }
    });

    registerRoomHandlers(socket, io);
    registerThreadHandlers(socket, io);
    registerChatHandlers(socket, io, fetchLinkPreview, handleCommand);

    // 監聽使用者斷線
    socket.on('disconnect', (reason) => {
        const currentTotalUsers = io.engine.clientsCount;
        log(`🔌 [斷線] 匿名使用者 ${userId} 已離線，原因: ${reason}，剩餘總人數: ${currentTotalUsers}`);
        // 使用者斷線後，房間人數會自動更新，我們需要廣播最新的列表
        // 使用 setTimeout 確保 adapter 的房間資訊已更新
        setTimeout(async () => io.emit('room list', await getSortedRoomList(io)), 100);

        // 當人數降回 150 人以下時，重置 Email 發送狀態，以便下次再度達標時能重新提醒
        if (currentTotalUsers < 150) {
            hasSentUpgradeEmail = false;
        }
    });
});

// 啟動伺服器，監聽 3000 埠
const PORT = process.env.PORT || 3000;
// 加入 '0.0.0.0' 確保雲端平台可以正確路由流量
server.listen(PORT, '0.0.0.0', () => {
    log(`Baha 匿名論壇伺服器已啟動， http://localhost:${PORT}`);
});
