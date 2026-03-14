// 初始化 Socket.io 連線
const socket = io();

const lobbyView = document.getElementById('lobby-view');
const chatView = document.getElementById('chat-view');
const roomList = document.getElementById('room-list');
const roomInput = document.getElementById('room-input');
const createRoomBtn = document.getElementById('create-room-btn');
const searchInput = document.getElementById('search-input');
const backBtn = document.getElementById('back-btn');
const roomTitle = document.getElementById('room-title');

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');

let currentRoom = ''; // 紀錄目前所在的房間
let allRooms = []; // 儲存從伺服器收到的所有房間列表

/**
 * 將一則訊息新增到畫面上
 * @param {object} data - 包含 id, text 和 timestamp 的訊息物件
 */
function addMessage(data) {
    const item = document.createElement('li');
    const isMyMessage = socket.id && data.id === socket.id.substring(0, 6);

    if (isMyMessage) {
        item.classList.add('my-message');
    } else {
        // 只為其他人的訊息顯示 ID
        const idSpan = document.createElement('span');
        idSpan.className = 'user-id';
        idSpan.textContent = `[${data.id}] `;
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
    
    messages.scrollTo(0, messages.scrollHeight);
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
    if (interval > 1) return Math.floor(interval) + " 年前";
    interval = seconds / 2592000; // 月
    if (interval > 1) return Math.floor(interval) + " 個月前";
    interval = seconds / 86400; // 天
    if (interval > 1) return Math.floor(interval) + " 天前";
    interval = seconds / 3600; // 小時
    if (interval > 1) return Math.floor(interval) + " 小時前";
    interval = seconds / 60; // 分鐘
    if (interval > 1) return Math.floor(interval) + " 分鐘前";
    return "剛剛";
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
    // 將新訊息新增到畫面上
    addMessage(data);
});
