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
const fs = require('fs');
const path = require('path');
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
const EMAIL_ALERT_ENABLED = Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);

function readEnvNumber(name, fallback) {
    const rawValue = process.env[name];
    if (rawValue === undefined) return fallback;
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : fallback;
}

const SERVER_PRESSURE_THRESHOLDS = {
    rssRatioAlert: readEnvNumber('SERVER_ALERT_RSS_RATIO', 0.8),
    rssRatioRecover: readEnvNumber('SERVER_ALERT_RSS_RECOVER_RATIO', 0.68),
    heapRatioAlert: readEnvNumber('SERVER_ALERT_HEAP_RATIO', 0.92),
    heapRatioRecover: readEnvNumber('SERVER_ALERT_HEAP_RECOVER_RATIO', 0.82),
    loadRatioAlert: readEnvNumber('SERVER_ALERT_LOAD_RATIO', 1.25),
    loadRatioRecover: readEnvNumber('SERVER_ALERT_LOAD_RECOVER_RATIO', 0.85),
    minimumHeapBytes: readEnvNumber('SERVER_ALERT_MIN_HEAP_BYTES', 256 * 1024 * 1024),
    consecutiveBreaches: readEnvNumber('SERVER_ALERT_CONSECUTIVE', 2),
    checkIntervalMs: readEnvNumber('SERVER_ALERT_INTERVAL_MS', 60 * 1000)
};

// 設定 Email 發送器 (需在 Render 設定環境變數 EMAIL_USER 和 EMAIL_PASS)
const transporter = EMAIL_ALERT_ENABLED ? nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
}) : null;

const serverPressureState = {
    alertActive: false,
    consecutiveBreaches: 0,
    lastAlertAt: 0
};

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
const AnonymousProfile = require('./models/AnonymousProfile');
const { version: appVersion } = require('./package.json');

// 3. 確保預設的「綜合閒聊」大廳永遠存在
Room.findOne({ name: '綜合閒聊' }).then(room => {
    if (!room) {
        Room.create({ name: '綜合閒聊', createdAt: Date.now() });
    }
});

const reactChatDistPath = path.join(__dirname, 'frontend', 'chat-app', 'dist');
const reactBoardDistPath = path.join(__dirname, 'frontend', 'board-app', 'dist');
const reactFeatureDistPath = path.join(__dirname, 'frontend', 'feature-app', 'dist');

function normalizeDisplayName(value) {
    return String(value || '').trim().slice(0, 24);
}

app.get('/', (req, res, next) => {
    if (fs.existsSync(reactBoardDistPath)) {
        res.redirect(302, '/react-board/');
        return;
    }
    next();
});

app.get('/index.html', (req, res, next) => {
    if (fs.existsSync(reactBoardDistPath)) {
        res.redirect(302, '/react-board/');
        return;
    }
    next();
});

app.use(express.static('public'));

if (fs.existsSync(reactChatDistPath)) {
    app.use('/react-chat', express.static(reactChatDistPath));
    app.get(/^\/react-chat(?:\/.*)?$/, (req, res) => {
        res.sendFile(path.join(reactChatDistPath, 'index.html'));
    });
}

if (fs.existsSync(reactBoardDistPath)) {
    app.use('/react-board', express.static(reactBoardDistPath));
    app.get(/^\/react-board(?:\/.*)?$/, (req, res) => {
        res.sendFile(path.join(reactBoardDistPath, 'index.html'));
    });
}

if (fs.existsSync(reactFeatureDistPath)) {
    app.use('/react-features', express.static(reactFeatureDistPath));
    app.get(/^\/react-features(?:\/.*)?$/, (req, res) => {
        res.sendFile(path.join(reactFeatureDistPath, 'index.html'));
    });
}

app.get('/chat/chat-room.html', (req, res) => {
    const room = typeof req.query.room === 'string' ? req.query.room : '';
    const target = room ? `/react-chat/?room=${encodeURIComponent(room)}` : '/react-chat/';
    res.redirect(302, target);
});

app.get('/meta/version', (req, res) => {
    res.json({
        name: 'baha',
        version: appVersion,
        timestamp: Date.now()
    });
});

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

function collectServerPressure(io) {
    const memoryUsage = process.memoryUsage();
    const totalMemory = os.totalmem() || 1;
    const cpuCount = Math.max(os.cpus()?.length || 1, 1);
    const loadAverage = os.loadavg();
    const activeRoomCount = Array.from(io.sockets.adapter.rooms.keys())
        .filter((roomName) => !io.sockets.sockets.has(roomName))
        .length;
    const rssRatio = memoryUsage.rss / totalMemory;
    const heapRatio = memoryUsage.heapTotal > 0 ? memoryUsage.heapUsed / memoryUsage.heapTotal : 0;
    const loadRatio = loadAverage[0] / cpuCount;

    const breachReasons = [];
    const recoverReasons = [];

    if (rssRatio >= SERVER_PRESSURE_THRESHOLDS.rssRatioAlert) breachReasons.push('rss');
    if (rssRatio < SERVER_PRESSURE_THRESHOLDS.rssRatioRecover) recoverReasons.push('rss');

    const heapEligible = memoryUsage.heapUsed >= SERVER_PRESSURE_THRESHOLDS.minimumHeapBytes;
    if (heapEligible && heapRatio >= SERVER_PRESSURE_THRESHOLDS.heapRatioAlert) breachReasons.push('heap');
    if (!heapEligible || heapRatio < SERVER_PRESSURE_THRESHOLDS.heapRatioRecover) recoverReasons.push('heap');

    if (loadRatio >= SERVER_PRESSURE_THRESHOLDS.loadRatioAlert) breachReasons.push('load');
    if (loadRatio < SERVER_PRESSURE_THRESHOLDS.loadRatioRecover) recoverReasons.push('load');

    return {
        connectedUsers: io.engine.clientsCount,
        roomCount: activeRoomCount,
        loadAverage,
        cpuCount,
        loadRatio,
        memoryUsage,
        totalMemory,
        rssRatio,
        heapRatio,
        breachReasons,
        recoverReasons,
        heapEligible,
        timestamp: new Date().toISOString()
    };
}

function bytesToMb(bytes) {
    return Math.round(bytes / 1024 / 1024);
}

function formatPercent(value) {
    return `${(value * 100).toFixed(1)}%`;
}

async function sendServerPressureAlert(snapshot, triggerSource) {
    if (!EMAIL_ALERT_ENABLED || !transporter) return;

    const subject = `Baha Render 負載警報：伺服器快撐不住了 (${snapshot.connectedUsers} 人在線)`;
    const reasonLines = [];

    if (snapshot.breachReasons.includes('rss')) {
        reasonLines.push(`RSS 記憶體使用率過高：${formatPercent(snapshot.rssRatio)} / 觸發門檻 ${formatPercent(SERVER_PRESSURE_THRESHOLDS.rssRatioAlert)}`);
    }
    if (snapshot.breachReasons.includes('heap')) {
        reasonLines.push(`Node heap 使用率過高：${formatPercent(snapshot.heapRatio)} / 觸發門檻 ${formatPercent(SERVER_PRESSURE_THRESHOLDS.heapRatioAlert)}`);
    }
    if (snapshot.breachReasons.includes('load')) {
        reasonLines.push(`CPU load 過高：${snapshot.loadRatio.toFixed(2)} / 觸發門檻 ${SERVER_PRESSURE_THRESHOLDS.loadRatioAlert.toFixed(2)}`);
    }

    await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        subject,
        text: [
            'Baha 偵測到伺服器可能快撐不住了。',
            '',
            `觸發來源：${triggerSource}`,
            `時間：${snapshot.timestamp}`,
            `在線人數：${snapshot.connectedUsers}`,
            `房間數：${snapshot.roomCount}`,
            `RSS：${bytesToMb(snapshot.memoryUsage.rss)} MB / ${bytesToMb(snapshot.totalMemory)} MB (${formatPercent(snapshot.rssRatio)})`,
            `Heap：${bytesToMb(snapshot.memoryUsage.heapUsed)} MB / ${bytesToMb(snapshot.memoryUsage.heapTotal)} MB (${formatPercent(snapshot.heapRatio)})`,
            `Load avg (1m)：${snapshot.loadAverage[0].toFixed(2)}，CPU 核心數：${snapshot.cpuCount}，load ratio：${snapshot.loadRatio.toFixed(2)}`,
            '',
            '觸發原因：',
            ...reasonLines.map((line) => `- ${line}`),
            '',
            '建議盡快查看 Render 後台的 CPU / 記憶體圖表與最近部署紀錄。'
        ].join('\n')
    });
}

async function checkServerPressure(io, triggerSource) {
    const snapshot = collectServerPressure(io);
    const hasPressure = snapshot.breachReasons.length > 0;

    if (hasPressure) {
        serverPressureState.consecutiveBreaches += 1;
    } else {
        serverPressureState.consecutiveBreaches = 0;
    }

    const shouldAlert = hasPressure
        && !serverPressureState.alertActive
        && serverPressureState.consecutiveBreaches >= SERVER_PRESSURE_THRESHOLDS.consecutiveBreaches;

    if (shouldAlert) {
        try {
            await sendServerPressureAlert(snapshot, triggerSource);
            serverPressureState.alertActive = true;
            serverPressureState.lastAlertAt = Date.now();
            log(`📨 已寄出伺服器負載警報 Email，原因：${snapshot.breachReasons.join(', ')}`);
        } catch (mailError) {
            error('寄送伺服器負載警報失敗:', mailError);
        }
    }

    const isRecovered = snapshot.recoverReasons.length === 3;
    if (serverPressureState.alertActive && isRecovered) {
        serverPressureState.alertActive = false;
        serverPressureState.consecutiveBreaches = 0;
        log('🟢 伺服器負載已恢復正常，已重置 Email 警報狀態');
    }

    return {
        ...snapshot,
        alertActive: serverPressureState.alertActive,
        consecutiveBreaches: serverPressureState.consecutiveBreaches,
        lastAlertAt: serverPressureState.lastAlertAt
    };
}

async function buildServerStatus(io) {
    const [roomCount, announcementCount] = await Promise.all([
        Room.countDocuments(),
        Announcement.countDocuments()
    ]);

    const pressure = collectServerPressure(io);
    return {
        connectedUsers: io.engine.clientsCount,
        roomCount,
        announcementCount,
        uptimeSeconds: Math.floor(process.uptime()),
        loadAverage: pressure.loadAverage,
        memoryUsage: {
            rss: pressure.memoryUsage.rss,
            heapUsed: pressure.memoryUsage.heapUsed,
            heapTotal: pressure.memoryUsage.heapTotal,
            external: pressure.memoryUsage.external
        },
        pressure: {
            rssRatio: pressure.rssRatio,
            heapRatio: pressure.heapRatio,
            loadRatio: pressure.loadRatio,
            alertActive: serverPressureState.alertActive,
            reasons: pressure.breachReasons
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
    socket.mutedRooms = new Map();
    socket.displayName = '';

    try {
        const profile = await AnonymousProfile.findOne({ userId });
        socket.displayName = normalizeDisplayName(profile?.displayName);
    } catch (profileError) {
        error('載入匿名身份資料失敗:', profileError);
    }

    const currentTotalUsers = io.engine.clientsCount;
    log(`📡 [連線] 匿名使用者 ${userId} (ID: ${socket.id}) 已進入，當前總人數: ${currentTotalUsers}`);
    void checkServerPressure(io, 'connection');

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

    socket.on('request anonymous profile', async (callback) => {
        const payload = {
            userId: socket.userId,
            displayName: socket.displayName || ''
        };

        if (typeof callback === 'function') {
            callback(payload);
        } else {
            socket.emit('anonymous profile', payload);
        }
    });

    socket.on('set anonymous display name', async (data, callback) => {
        const displayName = normalizeDisplayName(data?.displayName);

        try {
            await AnonymousProfile.findOneAndUpdate(
                { userId: socket.userId },
                {
                    $set: {
                        displayName,
                        updatedAt: Date.now()
                    }
                },
                {
                    upsert: true,
                    new: true,
                    setDefaultsOnInsert: true
                }
            );

            socket.displayName = displayName;
            const payload = {
                ok: true,
                userId: socket.userId,
                displayName
            };

            if (typeof callback === 'function') {
                callback(payload);
            } else {
                socket.emit('anonymous profile updated', payload);
            }
        } catch (profileSaveError) {
            error('儲存匿名名稱失敗:', profileSaveError);
            if (typeof callback === 'function') {
                callback({ ok: false, error: 'save_failed' });
            } else {
                socket.emit('anonymous profile updated', {
                    ok: false,
                    error: 'save_failed'
                });
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
        void checkServerPressure(io, 'disconnect');
    });
});

// 啟動伺服器，監聽 3000 埠
const PORT = process.env.PORT || 3000;
// 加入 '0.0.0.0' 確保雲端平台可以正確路由流量
server.listen(PORT, '0.0.0.0', () => {
    log(`Baha 匿名論壇伺服器已啟動， http://localhost:${PORT}`);
});

const serverPressureMonitor = setInterval(() => {
    void checkServerPressure(io, 'interval');
}, SERVER_PRESSURE_THRESHOLDS.checkIntervalMs);

serverPressureMonitor.unref?.();
