// 初始化 Socket.io 連線
const socket = io();

const loadingOverlay = document.getElementById('loading-overlay');
const lobbyView = document.getElementById('lobby-view');
const chatView = document.getElementById('chat-view');
const roomList = document.getElementById('room-list');
const roomInput = document.getElementById('room-input');
const createRoomBtn = document.getElementById('create-room-btn');
const searchInput = document.getElementById('search-input');
const backBtn = document.getElementById('back-btn');
const roomTitle = document.getElementById('room-title');
const danmakuContainer = document.getElementById('danmaku-container');

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');

let currentRoom = ''; // 紀錄目前所在的房間
let allRooms = []; // 儲存從伺服器收到的所有房間列表
let messageTimestamps = []; // 紀錄訊息抵達的時間以計算頻率
const DANMAKU_THRESHOLD = 10; // 觸發彈幕模式的門檻 (條/秒)

// 自動偵測瀏覽器語言
function getBrowserLanguage() {
    const lang = navigator.language || navigator.userLanguage;
    if (lang.startsWith('zh-CN') || lang === 'zh-SG') return 'zh-CN';
    if (lang.startsWith('zh')) return 'zh-TW';
    if (lang.startsWith('ja')) return 'ja';
    if (lang.startsWith('ko')) return 'ko';
    if (lang.startsWith('en')) return 'en';
    if (lang.startsWith('vi')) return 'vi';
    return 'zh-TW'; // 預設使用繁體中文
}

const currentLang = getBrowserLanguage();
const t = translations[currentLang] || translations['zh-TW'];

// 替換畫面上所有標記有 data-i18n 的文字
function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) el.textContent = t[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (t[key]) el.placeholder = t[key];
    });
    document.title = t.lobby_title;
}
applyTranslations();

/**
 * 根據字串(ID)計算出專屬的 HSL 顏色
 * @param {string} str 
 * @returns {string} hsl 顏色代碼
 */
function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360; // 將數字轉換為 0~359 的色相角度
    return `hsl(${hue}, 70%, 45%)`; // 飽和度 70%, 亮度 45% 確保字體在淺色背景上夠清晰
}

/**
 * 防止 XSS 攻擊的字串跳脫函式
 */
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

/**
 * 輕量級 Markdown 解析器 (支援 Discord 常用語法)
 */
function parseMarkdown(text) {
    let parsed = escapeHTML(text); // 1. 先跳脫 HTML 標籤，確保安全

    // 2. 提取 Code Blocks (```) 與 Inline Code (`)，避免裡面的內容被後面的正則格式化
    const codeBlocks = [];
    parsed = parsed.replace(/```([\s\S]*?)```/g, (match, p1) => {
        codeBlocks.push(`<pre><code>${p1}</code></pre>`);
        return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });
    parsed = parsed.replace(/`([^`\n]+)`/g, (match, p1) => {
        codeBlocks.push(`<code>${p1}</code>`);
        return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });

    // 3. 處理其他格式
    parsed = parsed.replace(/\|\|(.*?)\|\|/g, '<span class="spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>'); // 防雷線
    parsed = parsed.replace(/\*\*([^*_]+)\*\*/g, '<strong>$1</strong>'); // 粗體
    parsed = parsed.replace(/\*([^*_]+)\*/g, '<em>$1</em>'); // 斜體
    parsed = parsed.replace(/~~([^~]+)~~/g, '<del>$1</del>'); // 刪除線
    // 因為前面已經執行了 escapeHTML，所以 > 會變成 &gt;
    parsed = parsed.replace(/^&gt;\s?(.*)$/gm, '<blockquote>$1</blockquote>'); // 引用

    // 4. 把 Code Blocks 放回去
    codeBlocks.forEach((block, i) => {
        parsed = parsed.replace(`__CODE_BLOCK_${i}__`, block);
    });

    return parsed;
}

/**
 * 將一則訊息新增到畫面上
 * @param {object} data - 包含 id, text 和 timestamp 的訊息物件
 * @param {boolean} skipScroll - 是否跳過捲動 (彈幕模式時使用)
 */
function addMessage(data, skipScroll = false) {
    const item = document.createElement('li');
    const isMyMessage = socket.id && data.id === socket.id.substring(0, 6);

    if (isMyMessage) {
        item.classList.add('my-message');
    } else {
        // 只為其他人的訊息顯示 ID
        const idSpan = document.createElement('span');
        idSpan.className = 'user-id';
        idSpan.textContent = `[${data.id}] `;
        idSpan.style.color = stringToColor(data.id); // 依照 ID 設定動態專屬顏色
        item.appendChild(idSpan);
    }

    const textSpan = document.createElement('span');
    textSpan.innerHTML = parseMarkdown(data.text); // 使用 HTML 渲染 Markdown，並防護 XSS
    item.appendChild(textSpan);

    // 如果訊息有時間戳記，則格式化並顯示
    if (data.timestamp) {
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        const date = new Date(data.timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        timeSpan.textContent = ` ${hours}:${minutes}`;
        item.appendChild(timeSpan);
    }

    messages.appendChild(item);
    
    if (!skipScroll) {
        messages.scrollTo(0, messages.scrollHeight);
    }
}

/**
 * 建立並播放一條彈幕
 */
function createDanmaku(data) {
    const span = document.createElement('span');
    span.className = 'danmaku-msg';
    span.textContent = data.text;
    
    // 隨機垂直位置 (10% ~ 80%)，避免彈幕重疊
    const top = Math.floor(Math.random() * 70) + 10;
    span.style.top = `${top}%`;
    span.style.color = stringToColor(data.id);

    danmakuContainer.appendChild(span);
    setTimeout(() => span.remove(), 4000); // 4 秒動畫結束後清除元素
}

/**
 * 將 timestamp 轉換為相對時間描述 (例如 "5 分鐘前")
 * @param {number} timestamp - Date.now() 格式的時間戳
 * @returns {string}
 */
function formatTimeAgo(timestamp) {
    const now = new Date();
    const seconds = Math.floor((now - new Date(timestamp)) / 1000);

    let interval = seconds / 31536000; // 年
    if (interval > 1) return Math.floor(interval) + t.time_years_ago;
    interval = seconds / 2592000; // 月
    if (interval > 1) return Math.floor(interval) + t.time_months_ago;
    interval = seconds / 86400; // 天
    if (interval > 1) return Math.floor(interval) + t.time_days_ago;
    interval = seconds / 3600; // 小時
    if (interval > 1) return Math.floor(interval) + t.time_hours_ago;
    interval = seconds / 60; // 分鐘
    if (interval > 1) return Math.floor(interval) + t.time_minutes_ago;
    return t.time_just_now;
}

// 建立新話題房間
createRoomBtn.addEventListener('click', () => {
    const roomName = roomInput.value.trim();
    if (roomName) {
        socket.emit('create room', roomName);
        roomInput.value = '';
    }
});

// 讓使用者在建立話題輸入框按 Enter 也能建立
roomInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); // 防止 Enter 的預設行為 (例如提交表單)
        createRoomBtn.click(); // 觸發建立按鈕的點擊事件
    }
});

// 返回大廳按鈕
backBtn.addEventListener('click', () => {
    if (currentRoom) {
        socket.emit('leave room', currentRoom);
    }
    lobbyView.classList.remove('hidden');
    chatView.classList.add('hidden');
    currentRoom = '';
    messages.innerHTML = ''; // 清空聊天畫面以防下次進入時疊加
});

/**
 * 根據搜尋條件渲染房間列表
 */
function renderRoomList() {
    const searchTerm = searchInput.value.toLowerCase();
    roomList.innerHTML = '';

    const filteredRooms = allRooms.filter(room => room.name.toLowerCase().includes(searchTerm));

    filteredRooms.forEach(room => {
        const li = document.createElement('li');

        const nameSpan = document.createElement('span');
        nameSpan.className = 'room-name-text';
        nameSpan.textContent = `💬 ${room.name}`;

        const infoSpan = document.createElement('span');
        infoSpan.className = 'room-info';

        const userCountSpan = document.createElement('span');
        userCountSpan.className = 'room-user-count';
        userCountSpan.textContent = `👤 ${room.userCount}`;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'room-timestamp';
        timeSpan.textContent = formatTimeAgo(room.createdAt);

        li.appendChild(nameSpan);

        infoSpan.appendChild(userCountSpan);
        infoSpan.appendChild(timeSpan);
        li.appendChild(infoSpan);

        li.addEventListener('click', () => {
            currentRoom = room.name;
            roomTitle.textContent = room.name;
            socket.emit('join room', room.name);

            // 切換視圖到聊天室
            lobbyView.classList.add('hidden');
            chatView.classList.remove('hidden');
        });
        roomList.appendChild(li);
    });
}

// 監聽搜尋框的輸入事件
searchInput.addEventListener('input', renderRoomList);

// 監聽伺服器廣播的房間列表並更新大廳
socket.on('room list', (rooms) => {
    allRooms = rooms; // 更新全域的房間列表
    renderRoomList(); // 根據列表與現有搜尋條件重新渲染
});

// 處理表單提交
form.addEventListener('submit', function(e) {
    e.preventDefault(); // 防止頁面重新整理
    if (input.value.trim() && currentRoom) {
        // 將輸入的訊息發送給伺服器，並附帶目前房間名稱
        socket.emit('chat message', { room: currentRoom, text: input.value.trim() });
        input.value = ''; // 清空輸入框
        input.style.height = 'auto'; // 送出後重置輸入框高度
    }
});

// 讓輸入框自動根據內容調整高度
input.addEventListener('input', function() {
    this.style.height = 'auto'; // 先重置高度以重新計算
    this.style.height = this.scrollHeight + 'px'; // 設定為實際內容高度
});

// 讓使用者在聊天輸入框按 Enter 也能發送訊息
input.addEventListener('keydown', function(e) {
    // 檢查是否只按下 Enter 鍵 (沒有組合 Shift 等)
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); // 防止 Enter 的預設行為
        form.querySelector('button[type="submit"]').click(); // 觸發發送按鈕的點擊事件
    }
});

// 監聽來自伺服器的歷史訊息事件 (剛加入房間時觸發)
socket.on('chat history', function(history) {
    messages.innerHTML = ''; // 確保載入前清空畫面
    // 載入所有歷史訊息
    history.forEach(data => {
        addMessage(data);
    });
});

// 監聽來自伺服器的訊息
socket.on('chat message', function(data) {
    const now = Date.now();
    messageTimestamps.push(now);
    
    // 濾除超過 1 秒前的時間戳記，只保留最近 1 秒內的
    messageTimestamps = messageTimestamps.filter(t => now - t <= 1000);

    // 如果頻率超過門檻，則啟動彈幕模式
    if (messageTimestamps.length > DANMAKU_THRESHOLD) {
        createDanmaku(data);
        // 依然把訊息加入列表，但停止畫面自動往下捲動，避免傳統列表畫面閃爍過快
        addMessage(data, true); 
    } else {
        // 頻率正常時，使用傳統模式顯示並自動捲動
        addMessage(data, false);
    }
});

// 監聽 Socket.io 連線成功事件 (隱藏載入畫面)
socket.on('connect', () => {
    loadingOverlay.classList.add('hidden');
});

// 監聽 Socket.io 斷線事件 (顯示載入畫面)
socket.on('disconnect', () => {
    loadingOverlay.classList.remove('hidden');
});
