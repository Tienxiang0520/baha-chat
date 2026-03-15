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

// 多國語系翻譯表 (i18n)
const translations = {
    'zh-TW': {
        connecting: '連線中...',
        waking_up: '若伺服器正在從休眠中喚醒，可能需要等待約 30~50 秒，請稍候 ☕',
        lobby_title: 'Baha 話題大廳',
        new_topic_placeholder: '發起新話題...',
        create: '建立',
        search_placeholder: '🔍 搜尋話題...',
        back_to_lobby: '⬅ 返回大廳',
        room_title_default: '話題標題',
        chat_placeholder: '輸入匿名訊息...',
        send: '發送',
        time_years_ago: ' 年前',
        time_months_ago: ' 個月前',
        time_days_ago: ' 天前',
        time_hours_ago: ' 小時前',
        time_minutes_ago: ' 分鐘前',
        time_just_now: '剛剛'
    },
    'zh-CN': {
        connecting: '连接中...',
        waking_up: '若服务器正在从休眠中唤醒，可能需要等待约 30~50 秒，请稍候 ☕',
        lobby_title: 'Baha 话题大厅',
        new_topic_placeholder: '发起新话题...',
        create: '创建',
        search_placeholder: '🔍 搜索话题...',
        back_to_lobby: '⬅ 返回大厅',
        room_title_default: '话题标题',
        chat_placeholder: '输入匿名消息...',
        send: '发送',
        time_years_ago: ' 年前',
        time_months_ago: ' 个月前',
        time_days_ago: ' 天前',
        time_hours_ago: ' 小时前',
        time_minutes_ago: ' 分钟前',
        time_just_now: '刚刚'
    },
    'en': {
        connecting: 'Connecting...',
        waking_up: 'If the server is waking up, it may take 30~50 seconds. Please wait ☕',
        lobby_title: 'Baha Lobby',
        new_topic_placeholder: 'Start a new topic...',
        create: 'Create',
        search_placeholder: '🔍 Search topics...',
        back_to_lobby: '⬅ Back to Lobby',
        room_title_default: 'Topic Title',
        chat_placeholder: 'Enter anonymous message...',
        send: 'Send',
        time_years_ago: ' years ago',
        time_months_ago: ' months ago',
        time_days_ago: ' days ago',
        time_hours_ago: ' hours ago',
        time_minutes_ago: ' mins ago',
        time_just_now: 'Just now'
    },
    'ja': {
        connecting: '接続中...',
        waking_up: 'サーバーが復帰中の場合、30〜50秒かかることがあります。少々お待ちください ☕',
        lobby_title: 'Baha ロビー',
        new_topic_placeholder: '新しいトピックを作成...',
        create: '作成',
        search_placeholder: '🔍 トピックを検索...',
        back_to_lobby: '⬅ ロビーに戻る',
        room_title_default: 'トピックのタイトル',
        chat_placeholder: '匿名のメッセージを入力...',
        send: '送信',
        time_years_ago: ' 年前',
        time_months_ago: ' ヶ月前',
        time_days_ago: ' 日前',
        time_hours_ago: ' 時間前',
        time_minutes_ago: ' 分前',
        time_just_now: 'たった今'
    },
    'ko': {
        connecting: '연결 중...',
        waking_up: '서버가 절전 모드에서 해제되는 중이면 30~50초 정도 걸릴 수 있습니다. 잠시만 기다려주세요 ☕',
        lobby_title: 'Baha 로비',
        new_topic_placeholder: '새 주제 시작...',
        create: '만들기',
        search_placeholder: '🔍 주제 검색...',
        back_to_lobby: '⬅ 로비로 돌아가기',
        room_title_default: '주제 제목',
        chat_placeholder: '익명 메시지 입력...',
        send: '전송',
        time_years_ago: '년 전',
        time_months_ago: '개월 전',
        time_days_ago: '일 전',
        time_hours_ago: '시간 전',
        time_minutes_ago: '분 전',
        time_just_now: '방금 전'
    },
    'vi': {
        connecting: 'Đang kết nối...',
        waking_up: 'Nếu máy chủ đang thức dậy, có thể mất 30~50 giây. Vui lòng đợi ☕',
        lobby_title: 'Sảnh Baha',
        new_topic_placeholder: 'Bắt đầu chủ đề mới...',
        create: 'Tạo',
        search_placeholder: '🔍 Tìm kiếm chủ đề...',
        back_to_lobby: '⬅ Quay lại sảnh',
        room_title_default: 'Tiêu đề chủ đề',
        chat_placeholder: 'Nhập tin nhắn ẩn danh...',
        send: 'Gửi',
        time_years_ago: ' năm trước',
        time_months_ago: ' tháng trước',
        time_days_ago: ' ngày trước',
        time_hours_ago: ' giờ trước',
        time_minutes_ago: ' phút trước',
        time_just_now: 'Vừa xong'
    }
};

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
    textSpan.textContent = data.text;
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
    }
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
