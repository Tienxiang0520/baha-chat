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
const contextMenu = document.getElementById('message-context-menu');
const menuCopy = document.getElementById('menu-copy');
const menuReply = document.getElementById('menu-reply');
const replyPreview = document.getElementById('reply-preview');
const replyPreviewUser = document.getElementById('reply-preview-user');
const replyPreviewText = document.getElementById('reply-preview-text');
const cancelReplyBtn = document.getElementById('cancel-reply-btn');

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');

let currentRoom = ''; // 紀錄目前所在的房間
let allRooms = []; // 儲存從伺服器收到的所有房間列表
let messageTimestamps = []; // 紀錄訊息抵達的時間以計算頻率
const DANMAKU_THRESHOLD = 10; // 觸發彈幕模式的門檻 (條/秒)
let isMarkdownEnabled = true; // 紀錄是否啟用 Markdown
let replyingTo = null; // 紀錄目前正在回覆的訊息資料

// ===== 互動選單相關狀態與事件 =====
let selectedMessageText = '';
let selectedMessageId = '';
let selectedMessageElement = null;

function closeContextMenu() {
    contextMenu.classList.add('hidden');
    if (selectedMessageElement) {
        selectedMessageElement.classList.remove('selected-message');
        selectedMessageElement = null;
    }
}

// 點擊畫面任意處關閉選單
document.addEventListener('click', (e) => {
    if (e.target.closest('#message-context-menu')) return; // 點擊選單內部不關閉
    closeContextMenu();
});

// 執行複製文字
menuCopy.addEventListener('click', () => {
    if (selectedMessageText) {
        navigator.clipboard.writeText(selectedMessageText).then(() => {
            addSystemMessage(t.system_copied);
        }).catch(err => {
            console.error('複製失敗', err);
        });
    }
    closeContextMenu();
});

// 執行回覆
menuReply.addEventListener('click', () => {
    if (selectedMessageText && selectedMessageId) {
        replyingTo = { id: selectedMessageId, text: selectedMessageText };
        replyPreviewUser.textContent = `[${selectedMessageId}]`;
        replyPreviewUser.style.color = stringToColor(selectedMessageId);
        replyPreviewText.textContent = selectedMessageText;
        replyPreview.classList.remove('hidden');
        input.focus(); // 自動聚焦到輸入框方便直接打字
    }
    closeContextMenu();
});

cancelReplyBtn.addEventListener('click', () => {
    replyingTo = null;
    replyPreview.classList.add('hidden');
});
// ===============================

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
 * 增加系統提示訊息到畫面上
 */
function addSystemMessage(text) {
    const item = document.createElement('li');
    item.className = 'system-message';
    item.textContent = text;
    messages.appendChild(item);
    messages.scrollTo(0, messages.scrollHeight);
}

/**
 * 觸發派對碎紙花特效
 */
function triggerPartyEffect() {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
    for (let i = 0; i < 60; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
        confetti.style.animationDelay = (Math.random() * 0.5) + 's';
        document.body.appendChild(confetti);
        setTimeout(() => confetti.remove(), 4000);
    }
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

    // 3. 處理自動連結與多媒體預覽 (Auto-linking & Multimedia Preview)
    parsed = parsed.replace(/(https?:\/\/[^\s]+)/g, (match, url) => {
        // 判斷是否為 YouTube 網址，擷取 11 碼的影片 ID
        const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
        if (ytMatch && ytMatch[1]) {
            const videoId = ytMatch[1];
            return `<iframe class="chat-youtube-preview" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        }

        // 判斷是否為 Google Drive 網址，轉換為直接下載連結
        const gdriveMatch = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/i);
        if (gdriveMatch && gdriveMatch[1]) {
            const fileId = gdriveMatch[1];
            const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
            return `<a href="${downloadUrl}" target="_blank" rel="noopener noreferrer" class="chat-drive-link">${t.drive_download}</a>`;
        }

        // 判斷網址是否為常見的圖片格式結尾 (支援網址後方帶有參數 ?xxx)
        if (/\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(url)) {
            return `<a href="${url}" target="_blank" rel="noopener noreferrer"><img src="${url}" class="chat-image-preview" alt="圖片預覽" loading="lazy" /></a>`;
        }

        // 判斷網址是否為常見的影片格式
        if (/\.(mp4|webm|mov)(\?.*)?$/i.test(url)) {
            return `<video controls class="chat-video-preview" src="${url}" preload="metadata" playsinline></video>`;
        }

        // 判斷網址是否為常見的音檔格式
        if (/\.(mp3|wav|m4a|ogg)(\?.*)?$/i.test(url)) {
            return `<audio controls class="chat-audio-preview" src="${url}" preload="metadata"></audio>`;
        }

        // 一般網址
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-link">${url}</a>`;
    });

    // 4. 處理其他格式
    parsed = parsed.replace(/\|\|(.*?)\|\|/g, '<span class="spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>'); // 防雷線
    parsed = parsed.replace(/\*\*([^*_]+)\*\*/g, '<strong>$1</strong>'); // 粗體
    parsed = parsed.replace(/\*([^*_]+)\*/g, '<em>$1</em>'); // 斜體
    parsed = parsed.replace(/__([^_]+)__/g, '<u>$1</u>'); // 底線
    parsed = parsed.replace(/~~([^~]+)~~/g, '<del>$1</del>'); // 刪除線
    // 因為前面已經執行了 escapeHTML，所以 > 會變成 &gt;
    parsed = parsed.replace(/^&gt;\s?(.*)$/gm, '<blockquote>$1</blockquote>'); // 引用

    // 5. 把 Code Blocks 放回去
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
    }

    // 1. 如果有回覆資料，先渲染回覆引言區塊
    if (data.replyTo) {
        const replyDiv = document.createElement('div');
        replyDiv.className = 'replied-message';
        replyDiv.textContent = `${t.replied_message_prefix} [${data.replyTo.id}]: ${data.replyTo.text}`;
        item.appendChild(replyDiv);
    }

    // 2. 如果不是自己的訊息，顯示發送者 ID
    if (!isMyMessage) {
        const idSpan = document.createElement('span');
        idSpan.className = 'user-id';
        idSpan.textContent = `[${data.id}] `;
        idSpan.style.color = stringToColor(data.id); // 依照 ID 設定動態專屬顏色
        item.appendChild(idSpan);
    }

    // 3. 訊息本文
    const textSpan = document.createElement('span');
    // 根據該則訊息發送時的設定來決定是否渲染 (相容舊訊息，預設為 true)
    const applyMarkdown = data.useMarkdown !== false;
    textSpan.innerHTML = applyMarkdown ? parseMarkdown(data.text) : escapeHTML(data.text);
    item.appendChild(textSpan);

    // 5. 如果有網址摘要，渲染視覺化卡片
    if (data.linkPreview && data.linkPreview.title) {
        const previewCard = document.createElement('a');
        previewCard.className = 'link-preview-card';
        previewCard.href = data.linkPreview.url;
        previewCard.target = '_blank';
        previewCard.rel = 'noopener noreferrer';

        const previewContent = document.createElement('div');
        previewContent.className = 'link-preview-content';
        previewContent.innerHTML = `
            <div class="link-preview-title">${escapeHTML(data.linkPreview.title)}</div>
            ${data.linkPreview.description ? `<div class="link-preview-desc">${escapeHTML(data.linkPreview.description)}</div>` : ''}
        `;
        previewCard.appendChild(previewContent);

        if (data.linkPreview.image) {
            const previewImg = document.createElement('img');
            previewImg.className = 'link-preview-image';
            previewImg.src = data.linkPreview.image;
            previewCard.appendChild(previewImg);
        }
        item.appendChild(previewCard);
    }

    // 4. 如果訊息有時間戳記，則格式化並顯示
    if (data.timestamp) {
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        const date = new Date(data.timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        timeSpan.textContent = ` ${hours}:${minutes}`;
        item.appendChild(timeSpan);
    }

    // ===== 綁定右鍵與長按事件 =====
    let pressTimer;
    const showMenu = (x, y) => {
        closeContextMenu(); // 顯示前先重置舊的
        selectedMessageText = data.text; // 儲存原始文字 (包含 Markdown 標記)
        selectedMessageId = data.id; // 儲存 ID 供回覆功能使用
        selectedMessageElement = item;
        item.classList.add('selected-message');

        contextMenu.classList.remove('hidden');
        // 防止選單超出畫面邊緣
        const menuWidth = contextMenu.offsetWidth;
        const menuHeight = contextMenu.offsetHeight;
        const menuX = (x + menuWidth > window.innerWidth) ? window.innerWidth - menuWidth - 10 : x;
        const menuY = (y + menuHeight > window.innerHeight) ? window.innerHeight - menuHeight - 10 : y;

        contextMenu.style.left = `${menuX}px`;
        contextMenu.style.top = `${menuY}px`;
    };

    // 電腦版：右鍵點擊
    item.addEventListener('contextmenu', (e) => {
        e.preventDefault(); // 阻止瀏覽器預設右鍵選單
        showMenu(e.clientX, e.clientY);
    });

    // 手機版：長按 (超過 500 毫秒觸發)
    item.addEventListener('touchstart', (e) => {
        pressTimer = setTimeout(() => {
            showMenu(e.touches[0].clientX, e.touches[0].clientY);
        }, 500);
    });
    item.addEventListener('touchend', () => clearTimeout(pressTimer));
    item.addEventListener('touchmove', () => clearTimeout(pressTimer));

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
    const inputValue = roomInput.value.trim();
    if (inputValue) {
        let roomName = inputValue;
        let password = null;
        
        // 檢查是否使用 /lock 指令建立密碼房
        if (inputValue.startsWith('/lock ')) {
            const parts = inputValue.split(' ');
            if (parts.length >= 3) {
                password = parts[1];
                roomName = parts.slice(2).join(' '); // 剩下的字串都是房間名稱
            }
        }

        socket.emit('create room', { name: roomName, password: password });
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
    replyingTo = null; // 重置回覆狀態
    replyPreview.classList.add('hidden');
});

/**
 * 根據搜尋條件渲染房間列表
 */
function renderRoomList() {
    let searchTerm = searchInput.value.toLowerCase().trim();
    roomList.innerHTML = '';

    // 1. 偵測特殊搜尋指令
    let sortByHot = false;
    let filterLocked = null; // null: 不過濾, true: 只要密碼房, false: 只要公開房

    if (searchTerm.includes('/hot')) {
        sortByHot = true;
        searchTerm = searchTerm.replace('/hot', '').trim();
    }
    if (searchTerm.includes('/lock')) {
        filterLocked = true;
        searchTerm = searchTerm.replace('/lock', '').trim();
    } else if (searchTerm.includes('/open')) {
        filterLocked = false;
        searchTerm = searchTerm.replace('/open', '').trim();
    }

    // 2. 文字過濾
    let filteredRooms = allRooms.filter(room => room.name.toLowerCase().includes(searchTerm));

    // 3. 狀態過濾 (上鎖/公開)
    if (filterLocked !== null) {
        // 加上 !! 確保以前建立的舊房間 (isLocked 為 undefined) 也能被當作公開房
        filteredRooms = filteredRooms.filter(room => !!room.isLocked === filterLocked);
    }

    // 4. 排序 (預設最新，若有 /hot 則按人數最多)
    if (sortByHot) {
        filteredRooms.sort((a, b) => {
            if (b.userCount !== a.userCount) {
                return b.userCount - a.userCount;
            }
            return b.createdAt - a.createdAt; // 人數相同時，新房間排前面
        });
    } else {
        filteredRooms.sort((a, b) => b.createdAt - a.createdAt);
    }

    filteredRooms.forEach(room => {
        const li = document.createElement('li');

        const nameSpan = document.createElement('span');
        nameSpan.className = 'room-name-text';
        nameSpan.textContent = `${room.isLocked ? '🔒' : '💬'} ${room.name}`;

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
            let password = null;
            if (room.isLocked) {
                password = prompt(t.prompt_password);
                if (password === null) return; // 使用者按了取消
            }
            socket.emit('join room', { name: room.name, password: password });
        });
        roomList.appendChild(li);
    });
}

// 監聽加入房間成功
socket.on('join success', (roomName) => {
    currentRoom = roomName;
    roomTitle.textContent = roomName;
    
    // 切換視圖到聊天室
    lobbyView.classList.add('hidden');
    chatView.classList.remove('hidden');
});

// 監聽加入房間失敗 (密碼錯誤)
socket.on('join error', (errorKey) => {
    alert(t[errorKey] || '加入房間失敗！');
});

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
    const text = input.value.trim();
    
    // 檢查是否為 Markdown 切換指令
    if (text === '/md') {
        isMarkdownEnabled = !isMarkdownEnabled;
        addSystemMessage(isMarkdownEnabled ? t.system_md_on : t.system_md_off);
        input.value = ''; // 清空輸入框
        input.style.height = 'auto'; // 重置輸入框高度
        return; // 中斷執行，不把指令發送給伺服器
    }

    // 檢查互動特效指令
    let effect = null;
    let emitText = text;
    if (text.startsWith('/quake')) {
        effect = 'quake';
        emitText = text.replace(/^\/quake\s*/, '') || t.effect_quake;
    } else if (text.startsWith('/party')) {
        effect = 'party';
        emitText = text.replace(/^\/party\s*/, '') || t.effect_party;
    } else if (text.startsWith('/canvas')) {
        // tldraw 已不支援隨機網址開房，改用同樣強大的 Excalidraw
        // Excalidraw 房間網址格式: https://excalidraw.com/#room=[20碼ID],[22碼Base64URL金鑰]
        const generateRandomString = (length) => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
            let result = '';
            for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
            return result;
        };
        emitText = `${t.canvas_prompt}https://excalidraw.com/#room=${generateRandomString(20)},${generateRandomString(22)}`;
    } else if (text.startsWith('/roll')) {
        const num = Math.floor(Math.random() * 100) + 1; // 產生 1~100 的隨機數字
        const rollText = (t.roll_result || '🎲 擲出了 {num} 點！').replace('{num}', num);
        const extraText = text.replace(/^\/roll\s*/, '');
        emitText = extraText ? `${rollText} (${extraText})` : rollText;
    }

    if (emitText && currentRoom) {
        // 將輸入的訊息發送給伺服器，並附帶目前房間名稱與格式化設定
        socket.emit('chat message', { room: currentRoom, text: emitText, useMarkdown: isMarkdownEnabled, replyTo: replyingTo, effect: effect });
        input.value = ''; // 清空輸入框
        input.style.height = 'auto'; // 送出後重置輸入框高度
        replyingTo = null; // 送出後清空回覆狀態
        replyPreview.classList.add('hidden');
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
    // 觸發全螢幕特效
    if (data.effect === 'quake') {
        document.body.classList.add('quake-effect');
        setTimeout(() => document.body.classList.remove('quake-effect'), 800);
    } else if (data.effect === 'party') {
        triggerPartyEffect();
    }

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
