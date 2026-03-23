const USER_ID_STORAGE_KEY = 'baha-user-id';

function generateRandomUserId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const length = Math.floor(Math.random() * 3) + 8; // 8 ~ 10
    let id = '';
    for (let i = 0; i < length; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

function getOrCreateUserId() {
    const existing = localStorage.getItem(USER_ID_STORAGE_KEY);
    if (existing && /^[A-Za-z0-9]{8,10}$/.test(existing)) {
        return existing;
    }
    const newId = generateRandomUserId();
    localStorage.setItem(USER_ID_STORAGE_KEY, newId);
    return newId;
}

const localUserId = getOrCreateUserId();
const initialUrlParams = new URLSearchParams(window.location.search);
let pendingRoomFromUrl = initialUrlParams.get('room') || '';
// 初始化 Socket.io 連線
const socket = io({ auth: { userId: localUserId } });

const loadingOverlay = document.getElementById('loading-overlay');
const lobbyView = document.getElementById('lobby-view');
const chatView = document.getElementById('chat-view');
const roomList = document.getElementById('room-list');
const chatRoomList = document.getElementById('chat-room-list');
const roomInput = document.getElementById('room-input');
const createRoomBtn = document.getElementById('create-room-btn');
const searchInput = document.getElementById('search-input');
let boardSearchInputElement = null;
let isSearchSyncing = false;
let boardRoomListElement = null;
let boardRoomListPagerElement = null;
let boardRoomListPagerStatusElement = null;
let boardRoomListPrevButton = null;
let boardRoomListNextButton = null;
let roomListRenderScheduled = false;
const backBtn = document.getElementById('back-btn');
const featuresBtn = document.getElementById('features-btn');
const boardFeaturesBtn = document.getElementById('board-features-btn');
const featuresDot = document.getElementById('features-dot');
const roomTitle = document.getElementById('room-title');
const appVersionBadge = document.getElementById('app-version-badge');
const appVersionText = document.getElementById('app-version-text');
const danmakuContainer = document.getElementById('danmaku-container');
const contextMenu = document.getElementById('message-context-menu');
const menuCopy = document.getElementById('menu-copy');
const menuReply = document.getElementById('menu-reply');
const menuThread = document.getElementById('menu-thread');
const replyPreview = document.getElementById('reply-preview');
const replyPreviewUser = document.getElementById('reply-preview-user');
const replyPreviewText = document.getElementById('reply-preview-text');
const cancelReplyBtn = document.getElementById('cancel-reply-btn');
const typingIndicator = document.getElementById('typing-indicator');
const pollElements = new Map();
const pollVotes = new Map();
const TYPING_INACTIVITY_MS = 2500;
let typingTimer = null;
let isTyping = false;
const typingUsers = new Map();
const typingThrottles = new Map();
const pendingAdminTokens = new Map();
let messageScrollScheduled = false;

const commandSuggestions = document.getElementById('command-suggestions');

const COMMAND_SUGGESTIONS = [
    { name: '/poll', description: '發起社群投票 (格式: /poll 問題 | 選項一 | 選項二 ...)' },
    { name: '/canvas', description: '分享桌機白板連結給大家' },
    { name: '/thread', description: '將訊息延伸成討論串' },
    { name: '/announce', description: '發佈置頂公告，所有人都會看到' },
    { name: '/kick', description: '踢出擾亂訪客 (需要管理權限)' },
    { name: '/ban', description: '封鎖某個匿名 ID 不得再回來' },
    { name: '/mute', description: '禁言特定 ID (可加分鐘數)' },
    { name: '/rename', description: '房主可以重新命名房間標題' },
    { name: '/public', description: '移除房間密碼，開放任意人' },
    { name: '/private', description: '設置密碼保護，只有有密碼者可進入' },
    { name: '/clear', description: '清空聊天室歷史紀錄' },
    { name: '/delete', description: '立刻解散房間並送大家回大廳' },
    { name: '/md', description: '切換 Markdown 格式開 / 關' },
    { name: '/party', description: '全螢幕彩色碎紙花' },
    { name: '/quake', description: '全螢幕震動 (可在設定關閉)' }
];
let currentCommandSuggestions = [];
let currentSuggestionIndex = -1;

const MOTION_STORAGE_KEY = 'baha-reduce-motion';
const NOTIFICATION_STORAGE_KEY = 'baha-desktop-notifications';
let reduceMotionEnabled = localStorage.getItem(MOTION_STORAGE_KEY) === 'true';
let notificationsEnabled = localStorage.getItem(NOTIFICATION_STORAGE_KEY) === 'true';

const desktopBoard = document.getElementById('desktop-board');
const boardSurface = document.querySelector('.board-surface');
const boardCanvas = document.getElementById('board-canvas');
const boardPalette = document.getElementById('board-palette');
const boardOpenPaletteBtn = document.getElementById('board-open-palette-btn');
const boardResetBtn = document.getElementById('board-reset-btn');
const boardPaletteButtons = boardPalette ? boardPalette.querySelectorAll('[data-board-module]') : [];
const boardCustomForm = document.getElementById('board-custom-component-form');

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');

let currentRoom = ''; // 紀錄目前所在的房間
let allRooms = []; // 儲存從伺服器收到的所有房間列表
let messageTimestamps = []; // 紀錄訊息抵達的時間以計算頻率
const DANMAKU_THRESHOLD = 10; // 觸發彈幕模式的門檻 (條/秒)
let isMarkdownEnabled = true; // 紀錄是否啟用 Markdown
let replyingTo = null; // 紀錄目前正在回覆的訊息資料
let selectedMessageMid = null;
let activeThreadParent = null;
let activeThreadTitle = '';

function syncRoomQueryParam(roomName = '') {
    const url = new URL(window.location.href);
    if (roomName) {
        url.searchParams.set('room', roomName);
    } else {
        url.searchParams.delete('room');
    }
    window.history.replaceState(null, '', url.toString());
}

function showFeaturesView() {
    featuresDot?.classList.add('hidden');
    window.location.assign('/react-features/');
}

async function loadAppVersion() {
    if (!appVersionBadge || !appVersionText) return;
    try {
        const response = await fetch('/meta/version', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data?.version) return;
        appVersionText.textContent = `v${data.version}`;
        appVersionBadge.classList.remove('hidden');
    } catch (loadError) {
        console.warn('版本號載入失敗', loadError);
    }
}

// ===== 畫面切換邏輯 =====
featuresBtn.addEventListener('click', () => {
    showFeaturesView();
});

if (boardFeaturesBtn) {
    boardFeaturesBtn.addEventListener('click', () => {
        showFeaturesView();
    });
}

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
    selectedMessageMid = null;
}

// 點擊畫面任意處關閉選單
document.addEventListener('click', (e) => {
    if (e.target.closest('#message-context-menu')) return; // 點擊選單內部不關閉
    closeContextMenu();
});

document.addEventListener('click', (e) => {
    if (!commandSuggestions) return;
    if (e.target.closest('#command-suggestions') || e.target === input) return;
    hideCommandSuggestions();
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

if (menuThread) {
    menuThread.addEventListener('click', () => {
        if (!currentRoom || !selectedMessageMid) return;
        const defaultTitle = selectedMessageText?.slice(0, 60).trim() || t.thread_default_title || '';
        const threadTitle = defaultTitle || 'Thread';
        socket.emit('create thread', { room: currentRoom, messageId: selectedMessageMid, title: threadTitle });
        closeContextMenu();
    });
}

cancelReplyBtn.addEventListener('click', () => {
    replyingTo = null;
    replyPreview.classList.add('hidden');
});

window.ThreadUI?.setBackCallback(() => {
    if (activeThreadParent) {
        socket.emit('join room', { name: activeThreadParent });
        return;
    }
    backBtn.click();
});

function attemptCreateRoom() {
    const rawName = roomInput?.value || '';
    const name = rawName.trim();
    if (!name) return;
    socket.emit('create room', { name });
    roomInput.value = '';
}

createRoomBtn?.addEventListener('click', () => {
    attemptCreateRoom();
});

roomInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        attemptCreateRoom();
    }
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
applyReduceMotionPreference(reduceMotionEnabled);
loadAppVersion();

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

function getRoomDisplayName(name) {
    const room = allRooms.find(r => r.name === name);
    return (room?.displayName || name);
}

function applyThreadHint(element, data) {
    if (!element) return;
    const existing = element.querySelector('.thread-hint');
    if (existing) existing.remove();
    if (!data?.threadOpened) return;
    const hint = document.createElement('div');
    hint.className = 'thread-hint';
    const baseText = data.threadRoom ? `🧵 討論串已開啟（${data.threadRoom}）` : '🧵 討論串已開啟';
    hint.textContent = data.threadTitle ? `${baseText}：${data.threadTitle}` : baseText;
    element.appendChild(hint);
}

function markMessageWithThread(messageId, info) {
    if (!messageId) return;
    const escapedId = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(messageId) : messageId;
    const target = messages.querySelector(`[data-mid="${escapedId}"]`);
    if (!target) return;
    target.dataset.threadRoom = info?.threadRoom || '';
    applyThreadHint(target, { threadOpened: true, threadRoom: info?.threadRoom, threadTitle: info?.threadTitle });
}

function updateTypingIndicator() {
    if (!typingIndicator) return;
    if (typingUsers.size === 0) {
        typingIndicator.classList.add('hidden');
        return;
    }
    const [firstUser] = typingUsers.keys();
    typingIndicator.classList.remove('hidden');
    const template = t.typing_indicator || '{id} is typing...';
    typingIndicator.textContent = template.replace('{id}', `[${firstUser}]`);
}

function queueTypingTimeout(userId) {
    const existing = typingThrottles.get(userId);
    if (existing) {
        clearTimeout(existing);
    }

    const handle = setTimeout(() => {
        typingUsers.delete(userId);
        typingThrottles.delete(userId);
        updateTypingIndicator();
    }, TYPING_INACTIVITY_MS);

    typingThrottles.set(userId, handle);
}

function handleIncomingTyping(userId, typing) {
    if (!userId || userId === localUserId) return;
    if (typing) {
        typingUsers.set(userId, true);
        queueTypingTimeout(userId);
    } else {
        typingUsers.delete(userId);
        const existing = typingThrottles.get(userId);
        if (existing) {
            clearTimeout(existing);
            typingThrottles.delete(userId);
        }
    }
    updateTypingIndicator();
}

function displayAdminToken(room, token) {
    const template = t.room_admin_token_message || '建房者代碼：{token}，請妥善保存。';
    const message = template.replace('{token}', token);
    addSystemMessage(message);
    pendingAdminTokens.delete(room);
    window.AdminKeyBanner?.show(token);
}


function hideCommandSuggestions() {
    if (!commandSuggestions) return;
    commandSuggestions.classList.add('hidden');
    currentCommandSuggestions = [];
    currentSuggestionIndex = -1;
    commandSuggestions.innerHTML = '';
}

function setCommandSuggestionActive(index) {
    if (!commandSuggestions) return;
    const buttons = Array.from(commandSuggestions.querySelectorAll('button'));
    buttons.forEach(btn => btn.classList.remove('command-suggestion-active'));
    if (index >= 0 && index < buttons.length) {
        buttons[index].classList.add('command-suggestion-active');
    }
}

function applyCommandSuggestion(command) {
    hideCommandSuggestions();
    if (!input) return;
    input.value = `${command} `;
    input.focus();
}

function renderCommandSuggestions(value) {
    if (!commandSuggestions) return;
    const trimmed = value || '';
    if (!trimmed.startsWith('/')) {
        hideCommandSuggestions();
        return;
    }
    const query = trimmed.slice(1).toLowerCase();
    const matches = COMMAND_SUGGESTIONS.filter(cmd => cmd.name.startsWith(`/${query}`) || query === '')
        .slice(0, 6);
    currentCommandSuggestions = matches;
    if (matches.length === 0) {
        hideCommandSuggestions();
        return;
    }
    commandSuggestions.innerHTML = matches.map((cmd, index) => `
        <button type="button" data-index="${index}">
            <strong>${cmd.name}</strong>
            <span>${cmd.description}</span>
        </button>
    `).join('');
    commandSuggestions.classList.remove('hidden');
    currentSuggestionIndex = -1;
}

function applyReduceMotionPreference(enabled) {
    reduceMotionEnabled = enabled;
    localStorage.setItem(MOTION_STORAGE_KEY, enabled ? 'true' : 'false');
    document.body.classList.toggle('reduce-motion', enabled);
}
if (commandSuggestions) {
    commandSuggestions.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        const index = Number(button.dataset.index);
        if (!Number.isNaN(index) && currentCommandSuggestions[index]) {
            applyCommandSuggestion(currentCommandSuggestions[index].name);
        }
    });
}

function clearTypingState() {
    typingUsers.clear();
    typingThrottles.forEach(id => clearTimeout(id));
    typingThrottles.clear();
    updateTypingIndicator();
}

function scheduleMessageScroll() {
    if (!messages || messageScrollScheduled) return;
    messageScrollScheduled = true;
    requestAnimationFrame(() => {
        messages.scrollTo(0, messages.scrollHeight);
        messageScrollScheduled = false;
    });
}

/**
 * 增加系統提示訊息到畫面上
 */
function addSystemMessage(text) {
    const item = document.createElement('li');
    item.className = 'system-message';
    item.textContent = text;
    messages.appendChild(item);
    scheduleMessageScroll();
}

function appendLinkPreview(item, linkPreview) {
    if (!item || !linkPreview || !linkPreview.title) return;
    const existingPreview = item.querySelector('.link-preview-card');
    if (existingPreview) existingPreview.remove();

    const previewCard = document.createElement('a');
    previewCard.className = 'link-preview-card';
    previewCard.href = linkPreview.url;
    previewCard.target = '_blank';
    previewCard.rel = 'noopener noreferrer';

    const previewContent = document.createElement('div');
    previewContent.className = 'link-preview-content';
    previewContent.innerHTML = `
        <div class="link-preview-title">${escapeHTML(linkPreview.title)}</div>
        ${linkPreview.description ? `<div class="link-preview-desc">${escapeHTML(linkPreview.description)}</div>` : ''}
    `;
    previewCard.appendChild(previewContent);

    if (linkPreview.image) {
        const previewImg = document.createElement('img');
        previewImg.className = 'link-preview-image';
        previewImg.src = linkPreview.image;
        previewCard.appendChild(previewImg);
    }

    const timeElement = item.querySelector('.message-time');
    if (timeElement) {
        item.insertBefore(previewCard, timeElement);
    } else {
        item.appendChild(previewCard);
    }
}

/**
 * 觸發派對碎紙花特效
 */
function triggerPartyEffect() {
    if (reduceMotionEnabled) return;
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

function maybeShowDesktopNotification(data) {
    if (!notificationsEnabled || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (!data || data.id === localUserId || data.id === 'System') return;
    if (document.visibilityState === 'visible') return;
    const text = (data.text || '').replace(/\n/g, ' ').trim();
    if (!text) return;
    const roomName = getRoomDisplayName(data.room || currentRoom) || 'Baha';
    const notification = new Notification(roomName, {
        body: text,
        icon: '/icon/icon-192.png',
        tag: `baha-room-${data.room || currentRoom}`
    });
    setTimeout(() => notification.close(), 4000);
}

async function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
}

function isDesktopBoardActive() {
    return window.innerWidth >= 1200;
}

function updateDesktopBoardVisibility() {
    if (!desktopBoard) return;
    const shouldShow = isDesktopBoardActive();
    desktopBoard.classList.toggle('hidden', !shouldShow);
}

const BOARD_STORAGE_KEY = 'baha-desktop-board-modules';
const BOARD_MIN_CANVAS_WIDTH = 2600;
const BOARD_MIN_CANVAS_HEIGHT = 1800;
const BOARD_DEFAULT_MODULES = [
    { id: 'board-create-room', type: 'create-room', x: 24, y: 24, width: 280, height: 200, data: { title: '建立房間', subtitle: '快速開啟一個新話題' }, removable: true, resizable: true },
    { id: 'board-search', type: 'search', x: 320, y: 24, width: 280, height: 170, data: { title: '搜尋話題', subtitle: '支援 /hot、/lock 等指令' }, removable: true, resizable: true },
    { id: 'board-rooms', type: 'rooms', x: 616, y: 24, width: 280, height: 240, data: { title: '熱門房間', subtitle: '直接在白板挑選' }, removable: true, resizable: true },
    { id: 'board-actions', type: 'actions', x: 24, y: 260, width: 360, height: 220, data: { title: '建立與搜尋指令', subtitle: '建立房間與搜尋話題' }, removable: true, resizable: true },
    { id: 'board-sponsor', type: 'sponsor', x: 412, y: 260, width: 280, height: 170, data: { title: '支持開發', subtitle: '每份贊助都讓 Baha 更穩定' }, removable: true, resizable: true }
];
const MODULE_MIN_WIDTH = 220;
const MODULE_MIN_HEIGHT = 160;
const BOARD_ACTIONS = [
    { command: '直接輸入房名', description: '快速建立或加入公開話題' },
    { command: '/lock 密碼 房名', description: '建立帶密碼的鎖房話題' },
    { command: '/hot', description: '只看熱門話題' },
    { command: '/lock', description: '搜尋時只看鎖房' },
    { command: '/open', description: '搜尋時只看公開房間' }
];
const BOARD_MODULE_TITLES = {
    'create-room': '建立房間',
    'search': '搜尋話題',
    'rooms': '房間列表',
    'actions': '建立與搜尋指令',
    'sponsor': '支持開發'
};

let boardModules = [];
let boardSaveTimer = null;
let boardMobileCursorY = 16;
let boardRoomListPage = 0;
const BOARD_MOBILE_ROOM_PAGE_SIZE = 5;

function getBoardRoomPageSize() {
    return isDesktopBoardActive() ? Number.POSITIVE_INFINITY : BOARD_MOBILE_ROOM_PAGE_SIZE;
}

function clampBoardRoomPage(totalRooms) {
    if (isDesktopBoardActive()) {
        boardRoomListPage = 0;
        return 0;
    }
    const pageSize = getBoardRoomPageSize();
    const maxPage = Math.max(Math.ceil(totalRooms / pageSize) - 1, 0);
    boardRoomListPage = Math.min(Math.max(boardRoomListPage, 0), maxPage);
    return maxPage;
}

function updateBoardRoomPager(totalRooms) {
    if (!boardRoomListPagerElement) return;
    const pageSize = getBoardRoomPageSize();
    const shouldShowPager = !isDesktopBoardActive() && totalRooms > pageSize;
    boardRoomListPagerElement.classList.toggle('hidden', !shouldShowPager);
    if (!shouldShowPager) {
        boardRoomListPage = 0;
        return;
    }

    const maxPage = Math.max(Math.ceil(totalRooms / pageSize) - 1, 0);
    boardRoomListPage = Math.min(Math.max(boardRoomListPage, 0), maxPage);
    if (boardRoomListPagerStatusElement) {
        boardRoomListPagerStatusElement.textContent = `${boardRoomListPage + 1} / ${maxPage + 1}`;
    }
    if (boardRoomListPrevButton) {
        boardRoomListPrevButton.disabled = boardRoomListPage <= 0;
    }
    if (boardRoomListNextButton) {
        boardRoomListNextButton.disabled = boardRoomListPage >= maxPage;
    }
}

function refreshBoardCanvasSize() {
    if (!boardCanvas) return;
    if (!isDesktopBoardActive()) {
        let requiredWidth = Math.max(window.innerWidth - 24, 360);
        let requiredHeight = 16;
        boardModules.forEach(module => {
            const moduleHeight = module.mobileHeight || module.height || 180;
            requiredHeight += moduleHeight + 16;
        });
        boardCanvas.style.width = `${requiredWidth}px`;
        boardCanvas.style.height = `${requiredHeight + 16}px`;
        return;
    }
    let requiredWidth = BOARD_MIN_CANVAS_WIDTH;
    let requiredHeight = BOARD_MIN_CANVAS_HEIGHT;
    boardModules.forEach(module => {
        const moduleWidth = module.width || 280;
        const moduleHeight = module.height || 180;
        requiredWidth = Math.max(requiredWidth, module.x + moduleWidth + 200);
        requiredHeight = Math.max(requiredHeight, module.y + moduleHeight + 200);
    });
    boardCanvas.style.width = `${requiredWidth}px`;
    boardCanvas.style.height = `${requiredHeight}px`;
}

let boardCanvasResizeScheduled = false;
function scheduleBoardCanvasRefresh() {
    if (boardCanvasResizeScheduled) return;
    boardCanvasResizeScheduled = true;
    requestAnimationFrame(() => {
        refreshBoardCanvasSize();
        boardCanvasResizeScheduled = false;
    });
}

function initBoardPanning() {
    if (!boardSurface) return;
    let isPanning = false;
    let startX = 0;
    let startY = 0;
    let baseScrollLeft = 0;
    let baseScrollTop = 0;

    const endPan = () => {
        if (!isPanning) return;
        isPanning = false;
        boardSurface.classList.remove('board-surface--panning');
    };

    boardSurface.addEventListener('contextmenu', (event) => {
        if (event.target.closest('.board-module')) return;
        event.preventDefault();
    });

    boardSurface.addEventListener('pointerdown', (event) => {
        if (event.button !== 2) return;
        if (event.target.closest('.board-module')) return;
        event.preventDefault();
        isPanning = true;
        startX = event.clientX;
        startY = event.clientY;
        baseScrollLeft = boardSurface.scrollLeft;
        baseScrollTop = boardSurface.scrollTop;
        boardSurface.classList.add('board-surface--panning');
    });

    window.addEventListener('pointermove', (event) => {
        if (!isPanning) return;
        event.preventDefault();
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        boardSurface.scrollLeft = baseScrollLeft - dx;
        boardSurface.scrollTop = baseScrollTop - dy;
        startX = event.clientX;
        startY = event.clientY;
        baseScrollLeft = boardSurface.scrollLeft;
        baseScrollTop = boardSurface.scrollTop;
    });

    window.addEventListener('pointerup', (event) => {
        if (event.button === 2) {
            endPan();
        }
    });

    boardSurface.addEventListener('pointerleave', () => {
        endPan();
    });
}

function loadBoardModules() {
    if (!boardCanvas) return;
    const stored = localStorage.getItem(BOARD_STORAGE_KEY);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
                boardModules = parsed.map(module => ({
                    ...module,
                    data: module.data ? { ...module.data } : {}
                }));
                return;
            }
        } catch (error) {
            console.error('解析桌面白板設定失敗', error);
        }
    }
    boardModules = BOARD_DEFAULT_MODULES.map(module => ({
        ...module,
        data: module.data ? { ...module.data } : {}
    }));
}

function saveBoardModules() {
    if (!boardCanvas) return;
    const persistedModules = boardModules.map(module => {
        const { mobileHeight, mobileWidth, ...persistent } = module;
        return persistent;
    });
    localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(persistedModules));
}

function scheduleBoardSave() {
    if (boardSaveTimer) {
        clearTimeout(boardSaveTimer);
    }
    boardSaveTimer = setTimeout(() => {
        boardSaveTimer = null;
        saveBoardModules();
    }, 120);
}

function resetBoardModules() {
    boardModules = BOARD_DEFAULT_MODULES.map(module => ({
        ...module,
        data: module.data ? { ...module.data } : {}
    }));
    scheduleBoardSave();
    renderBoardModules();
}

function moveBoardModule(moduleId, delta) {
    const currentIndex = boardModules.findIndex(module => module.id === moduleId);
    if (currentIndex < 0) return;
    const nextIndex = currentIndex + delta;
    if (nextIndex < 0 || nextIndex >= boardModules.length) return;
    const [module] = boardModules.splice(currentIndex, 1);
    boardModules.splice(nextIndex, 0, module);
    scheduleBoardSave();
    renderBoardModules();
}

function createBoardModuleElement(module) {
    const wrapper = document.createElement('section');
    wrapper.className = `board-module board-module--${module.type}`;
    wrapper.dataset.moduleId = module.id;
    wrapper.style.left = `${module.x}px`;
    wrapper.style.top = `${module.y}px`;
    if (module.width) wrapper.style.width = `${module.width}px`;
    if (module.height) wrapper.style.height = `${module.height}px`;

    if (!isDesktopBoardActive()) {
        const mobileWidth = Math.max(Math.min(window.innerWidth - 32, 420), 280);
        const mobileHeight = module.type === 'actions'
            ? Math.max(module.height || 180, 460)
            : module.type === 'rooms'
                ? Math.max(module.height || 240, 500)
            : (module.height || 180);
        module.mobileWidth = mobileWidth;
        module.mobileHeight = mobileHeight;
        wrapper.classList.add('board-module--mobile');
        wrapper.style.left = '16px';
        wrapper.style.top = `${boardMobileCursorY}px`;
        wrapper.style.width = `${mobileWidth}px`;
        wrapper.style.height = `${mobileHeight}px`;
        boardMobileCursorY += mobileHeight + 16;
    }

    const handle = document.createElement('header');
    handle.className = 'board-module-handle';
    const title = document.createElement('span');
    title.textContent = module.data?.title || BOARD_MODULE_TITLES[module.type] || '白板模組';
    handle.appendChild(title);

    if (!isDesktopBoardActive()) {
        const mobileActions = document.createElement('div');
        mobileActions.className = 'board-module-mobile-actions';

        const moveUpBtn = document.createElement('button');
        moveUpBtn.type = 'button';
        moveUpBtn.className = 'board-module-move board-module-move-up';
        moveUpBtn.textContent = '↑';
        moveUpBtn.title = '往上移';
        moveUpBtn.setAttribute('aria-label', '往上移');
        moveUpBtn.disabled = boardModules[0]?.id === module.id;
        moveUpBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            moveBoardModule(module.id, -1);
        });

        const moveDownBtn = document.createElement('button');
        moveDownBtn.type = 'button';
        moveDownBtn.className = 'board-module-move board-module-move-down';
        moveDownBtn.textContent = '↓';
        moveDownBtn.title = '往下移';
        moveDownBtn.setAttribute('aria-label', '往下移');
        moveDownBtn.disabled = boardModules[boardModules.length - 1]?.id === module.id;
        moveDownBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            moveBoardModule(module.id, 1);
        });

        mobileActions.appendChild(moveUpBtn);
        mobileActions.appendChild(moveDownBtn);
        handle.appendChild(mobileActions);
    }

    if (module.removable) {
        if (module.type === 'custom') {
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'board-module-edit';
            editBtn.textContent = '✎';
            editBtn.title = '編輯卡片';
            editBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                if (wrapper.classList.contains('is-editing')) return;
                wrapper.classList.add('is-editing');
                
                const originalTitle = module.data?.title || '';
                const originalContent = module.data?.content || '';

                const form = document.createElement('form');
                form.className = 'board-module-form board-module-edit-form';
                
                const titleInput = document.createElement('input');
                titleInput.name = 'title';
                titleInput.value = originalTitle;
                titleInput.placeholder = '卡片標題';
                titleInput.required = true;

                const contentInput = document.createElement('textarea');
                contentInput.name = 'content';
                contentInput.value = originalContent;
                contentInput.rows = 4;
                contentInput.placeholder = '卡片內容 / 支援 Markdown 語法';
                contentInput.required = true;

                const actions = document.createElement('div');
                actions.className = 'side-panel-form-actions';
                actions.style.marginTop = '10px';
                
                const saveBtn = document.createElement('button');
                saveBtn.type = 'submit';
                saveBtn.textContent = '儲存';
                
                const cancelBtn = document.createElement('button');
                cancelBtn.type = 'button';
                cancelBtn.className = 'side-panel-form-cancel';
                cancelBtn.textContent = '取消';

                actions.appendChild(saveBtn);
                actions.appendChild(cancelBtn);

                form.appendChild(titleInput);
                form.appendChild(contentInput);
                form.appendChild(actions);

                const originalBodyHtml = body.innerHTML;
                const originalTitleText = title.textContent;

                title.textContent = '編輯卡片';
                body.innerHTML = '';
                body.appendChild(form);
                
                // 為了讓使用者聚焦
                titleInput.focus();

                cancelBtn.addEventListener('click', () => {
                   wrapper.classList.remove('is-editing');
                   title.textContent = originalTitleText;
                   body.innerHTML = originalBodyHtml;
                });

                form.addEventListener('submit', (e) => {
                   e.preventDefault();
                   module.data.title = titleInput.value.trim();
                   module.data.content = contentInput.value.trim();
                   scheduleBoardSave();
                   renderBoardModules();
                });
            });
            handle.appendChild(editBtn);
        }

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'board-module-remove';
        removeBtn.textContent = '✕';
        removeBtn.setAttribute('aria-label', '移除模組');
        removeBtn.title = '移除模組';
        removeBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            boardModules = boardModules.filter(item => item.id !== module.id);
            setTimeout(() => {
                scheduleBoardSave();
                renderBoardModules();
            }, 0);
        });
        handle.appendChild(removeBtn);
    }

    wrapper.appendChild(handle);
    const body = document.createElement('div');
    body.className = 'board-module-body';

    switch (module.type) {
        case 'create-room': {
            const subtitle = document.createElement('p');
            subtitle.textContent = module.data?.subtitle || '輸入名稱即可建立';
            body.appendChild(subtitle);
            const form = document.createElement('form');
            form.className = 'board-module-form';
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = t.board_create_placeholder || '輸入房間名稱';
            const button = document.createElement('button');
            button.type = 'submit';
            button.textContent = t.board_create_button || '立即建立';
            form.appendChild(input);
            form.appendChild(button);
            form.addEventListener('submit', (event) => {
                event.preventDefault();
                const value = (input.value || '').trim();
                if (!value) return;
                socket.emit('create room', { name: value });
                input.value = '';
            });
            body.appendChild(form);
            break;
        }
        case 'search': {
            const subtitle = document.createElement('p');
            subtitle.textContent = module.data?.subtitle || '支援搜尋指令';
            body.appendChild(subtitle);
            const input = document.createElement('input');
            input.type = 'search';
            input.className = 'board-module-search-input';
            input.placeholder = t.board_search_placeholder || '搜尋話題 /hot /lock';
            input.value = searchInput?.value || '';
            input.addEventListener('input', (event) => {
                handleSearchTermChange(event.target.value, 'board');
            });
            boardSearchInputElement = input;
            body.appendChild(input);
            break;
        }
        case 'rooms': {
            const subtitle = document.createElement('p');
            subtitle.textContent = module.data?.subtitle || '雙欄同步顯示';
            body.appendChild(subtitle);
            const list = document.createElement('ul');
            list.className = 'board-room-list';
            boardRoomListElement = list;
            body.appendChild(list);

            const pager = document.createElement('div');
            pager.className = 'board-room-list-pager';

            const prevButton = document.createElement('button');
            prevButton.type = 'button';
            prevButton.className = 'board-room-list-pager-btn board-room-list-pager-btn--prev';
            prevButton.textContent = '↑';
            prevButton.title = '往前看 5 筆';
            prevButton.setAttribute('aria-label', '往前看 5 筆');
            prevButton.addEventListener('click', () => {
                if (boardRoomListPage <= 0) return;
                boardRoomListPage -= 1;
                renderRoomList();
            });

            const status = document.createElement('span');
            status.className = 'board-room-list-pager-status';

            const nextButton = document.createElement('button');
            nextButton.type = 'button';
            nextButton.className = 'board-room-list-pager-btn board-room-list-pager-btn--next';
            nextButton.textContent = '↓';
            nextButton.title = '往後看 5 筆';
            nextButton.setAttribute('aria-label', '往後看 5 筆');
            nextButton.addEventListener('click', () => {
                boardRoomListPage += 1;
                renderRoomList();
            });

            pager.appendChild(prevButton);
            pager.appendChild(status);
            pager.appendChild(nextButton);
            body.appendChild(pager);

            boardRoomListPagerElement = pager;
            boardRoomListPagerStatusElement = status;
            boardRoomListPrevButton = prevButton;
            boardRoomListNextButton = nextButton;
            break;
        }
        case 'actions': {
            const subtitle = document.createElement('p');
            subtitle.textContent = module.data?.subtitle || '互動 / 維護 指令';
            body.appendChild(subtitle);
            const actionList = document.createElement('div');
            actionList.className = 'board-module-actions';
            BOARD_ACTIONS.forEach(item => {
                const button = document.createElement('button');
                button.type = 'button';
                button.innerHTML = `<strong>${item.command}</strong> <span>${item.description}</span>`;
                button.addEventListener('click', () => {
                    addSystemMessage(`指令提示：輸入 ${item.command}`);
                });
                actionList.appendChild(button);
            });
            body.appendChild(actionList);
            break;
        }
        case 'sponsor': {
            const subtitle = document.createElement('p');
            subtitle.textContent = module.data?.subtitle || '每份贊助都很重要';
            body.appendChild(subtitle);
            const email = document.createElement('div');
            email.className = 'board-module-sponsor';
            email.innerHTML = `<strong>Email</strong><span>pudding050@gmail.com</span>`;
            body.appendChild(email);
            const link = document.createElement('a');
            link.href = 'https://www.paypal.com/ncp/payment/VADFCCNV65CQQ';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = '愛心贊助 NT$30';
            body.appendChild(link);
            break;
        }
        case 'custom':
        default: {
            const content = document.createElement('div');
            const dataContent = module.data?.content || '';
            content.innerHTML = typeof parseMarkdown === 'function' ? parseMarkdown(dataContent) : escapeHTML(dataContent).replace(/\n/g, '<br>');
            body.appendChild(content);
            break;
        }
    }

    wrapper.appendChild(body);
    if (module.resizable !== false) {
        const resizer = document.createElement('span');
        resizer.className = 'board-module-resizer';
        wrapper.appendChild(resizer);
        attachModuleResize(resizer, wrapper, module);
    }
    attachBoardDrag(handle, wrapper, module);
    return wrapper;
}

function attachBoardDrag(handle, moduleEl, module) {
    if (!handle || !moduleEl || !isDesktopBoardActive()) return;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originX = module.x;
    let originY = module.y;

    const onPointerMove = (event) => {
        if (!dragging) return;
        const canvasWidth = boardCanvas?.clientWidth || boardCanvas?.offsetWidth || 0;
        const canvasHeight = boardCanvas?.clientHeight || boardCanvas?.offsetHeight || 0;
        const moduleWidth = moduleEl.offsetWidth;
        const moduleHeight = moduleEl.offsetHeight;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        module.x = Math.max(originX + dx, 0);
        module.y = Math.max(originY + dy, 0);
        moduleEl.style.left = `${module.x}px`;
        moduleEl.style.top = `${module.y}px`;
        scheduleBoardCanvasRefresh();
    };

    const onPointerUp = () => {
        if (!dragging) return;
        dragging = false;
        document.body.style.userSelect = '';
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        scheduleBoardSave();
    };

    handle.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        dragging = true;
        startX = event.clientX;
        startY = event.clientY;
        originX = module.x;
        originY = module.y;
        document.body.style.userSelect = 'none';
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
    });
}

function attachModuleResize(resizer, moduleEl, module) {
    if (!resizer || !moduleEl || !isDesktopBoardActive()) return;
    let resizing = false;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;

    const cancel = () => {
        if (!resizing) return;
        resizing = false;
        moduleEl.classList.remove('board-module--resizing');
    };

    resizer.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        event.preventDefault();
        resizing = true;
        startX = event.clientX;
        startY = event.clientY;
        startWidth = module.width || moduleEl.offsetWidth;
        startHeight = module.height || moduleEl.offsetHeight;
        moduleEl.classList.add('board-module--resizing');
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    });

    const onMove = (event) => {
        if (!resizing) return;
        const deltaX = event.clientX - startX;
        const deltaY = event.clientY - startY;
        const newWidth = Math.max(MODULE_MIN_WIDTH, startWidth + deltaX);
        const newHeight = Math.max(MODULE_MIN_HEIGHT, startHeight + deltaY);
        module.width = newWidth;
        module.height = newHeight;
        moduleEl.style.width = `${newWidth}px`;
        moduleEl.style.height = `${newHeight}px`;
        scheduleBoardCanvasRefresh();
    };

    const onUp = () => {
        cancel();
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        scheduleBoardSave();
    };
}

function renderBoardModules() {
    if (!boardCanvas) return;
    boardCanvas.innerHTML = '';
    boardRoomListElement = null;
    boardRoomListPagerElement = null;
    boardRoomListPagerStatusElement = null;
    boardRoomListPrevButton = null;
    boardRoomListNextButton = null;
    boardSearchInputElement = null;
    boardMobileCursorY = 16;
    boardModules.forEach(module => {
        const moduleEl = createBoardModuleElement(module);
        boardCanvas.appendChild(moduleEl);
    });
    refreshBoardCanvasSize();
    scheduleRoomListRender();
}

function createModuleFromType(type) {
    const index = boardModules.length;
    const offset = 36 + (index % 3) * 20;
    return {
        id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type,
        x: offset + 20,
        y: offset + 20,
        width: 280,
        height: 180,
        data: {
            title: BOARD_MODULE_TITLES[type] || '自訂模組'
        },
        removable: true
    };
}

function toggleBoardPalette(show) {
    if (!boardPalette) return;
    const isHidden = boardPalette.classList.contains('hidden');
    const shouldShow = typeof show === 'boolean' ? show : isHidden;
    boardPalette.classList.toggle('hidden', !shouldShow);
}

function handlePaletteSelection(event) {
    const button = event.currentTarget;
    const type = button?.dataset?.boardModule;
    if (!type) return;
    boardModules.push(createModuleFromType(type));
    scheduleBoardSave();
    renderBoardModules();
    toggleBoardPalette(false);
}

function handleCustomModuleSubmit(event) {
    event.preventDefault();
    const titleInput = event.target.querySelector('input[name="title"]');
    const contentInput = event.target.querySelector('textarea[name="content"]');
    if (!titleInput || !contentInput) return;
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    if (!title || !content) return;
    boardModules.push({
        id: `custom-${Date.now()}`,
        type: 'custom',
        x: 40,
        y: 40,
        width: 320,
        height: 200,
        data: { title, content },
        removable: true
    });
    scheduleBoardSave();
    renderBoardModules();
    event.target.reset();
    toggleBoardPalette(false);
}

function initializeBoard() {
    if (!boardCanvas || !desktopBoard || !boardSurface) return;
    loadBoardModules();
    boardOpenPaletteBtn?.addEventListener('click', () => toggleBoardPalette());
    boardResetBtn?.addEventListener('click', () => resetBoardModules());
    boardPaletteButtons.forEach(button => {
        button.addEventListener('click', handlePaletteSelection);
    });
    boardCustomForm?.addEventListener('submit', handleCustomModuleSubmit);
    renderBoardModules();
    initBoardPanning();
}

/**
 * Markdown parser setup (使用 markdown-it 與 DOMPurify 處理輸出)
 */

const markdownParser = window.markdownit?.({
    html: true,
    linkify: true,
    typographer: true
});

if (markdownParser) {
    markdownParser
        .use(window.markdownitAnchor || (() => {}), {
            permalink: true,
            permalinkBefore: true,
            permalinkSymbol: '¶',
            level: [1, 2, 3]
        })
        .use(window.markdownitEmoji || (() => {}))
        .use(window.markdownitAbbr || (() => {}))
        .use(window.markdownitFootnote || (() => {}))
        .use(window.markdownitTaskLists || (() => {}), { label: true })
        .use(window.markdownitMark || (() => {}))
        .use(window.markdownitIns || (() => {}))
        .use(window.markdownitSub || (() => {}))
        .use(window.markdownitSup || (() => {}))
        .use(window.markdownitMultimdTable || (() => {}), {
            enableMultilineRows: true,
            enableRowspan: true,
            enableColspan: true,
            enableLinebreaks: true,
            enableHtmlCaption: true
        })
        .use(window.markdownitVideo || (() => {}), {
            youtube: { width: 560, height: 315 },
            vimeo: { width: 560, height: 315 },
            vine: { width: 560, height: 315 }
        })
        .use(window.markdownitHighlightjs || (() => {}), { auto: true, code: true });

    if (window.markdownitContainer) {
        ['info', 'warning', 'tip'].forEach(type => {
            markdownParser.use(window.markdownitContainer, type, {
                render(tokens, idx) {
                    if (tokens[idx].nesting === 1) {
                        return `<div class="custom-block ${type}">`;
                    }
                    return '</div>';
                }
            });
        });
    }
}

function parseMarkdown(text) {
    if (!markdownParser || typeof DOMPurify === 'undefined') {
        return escapeHTML(text);
    }

    const lockPlaceholders = [];
    const preparedText = text.replace(/\[lock:(.*?)\]([\s\S]*?)\[\/lock\]/g, (match, password, content) => {
        const encodedContent = encodeURIComponent(content);
        const placeholder = `__LOCKED_${lockPlaceholders.length}__`;
        lockPlaceholders.push({ placeholder, password, encodedContent });
        return placeholder;
    });

    try {
        const rawHtml = markdownParser.render(preparedText);
        let sanitized = DOMPurify.sanitize(rawHtml, {
            ADD_TAGS: ['iframe'],
            ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src', 'width', 'height', 'type', 'id']
        });

        lockPlaceholders.forEach(({ placeholder, password, encodedContent }) => {
            const lockedHtml = `<div class="locked-message-container">
                    <div class="locked-header">${t.locked_message}</div>
                    <div class="locked-body">
                        <input type="password" class="unlock-input" placeholder="${t.enter_password}">
                        <button class="unlock-btn" onclick="unlockMessage(this, '${password}', '${encodedContent}')">${t.unlock}</button>
                    </div>
                </div>`;
            sanitized = sanitized.replace(placeholder, lockedHtml);
        });

        return sanitized;
    } catch (error) {
        console.error('Markdown render failed', error);
        return escapeHTML(text);
    }
}

function sendTypingStatus(flag) {
    if (!currentRoom) return;
    if (flag === isTyping) return;
    isTyping = flag;
    if (!flag && typingTimer) {
        clearTimeout(typingTimer);
        typingTimer = null;
    }
    socket.emit('typing', { room: currentRoom, typing: flag });
}

createRoomBtn.addEventListener('click', () => {
    attemptRoomCreation(roomInput.value, roomInput);
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
    desktopBoard.classList.remove('hidden');
    chatView.classList.add('hidden');
    currentRoom = '';
    messages.innerHTML = ''; // 清空聊天畫面以防下次進入時疊加
    replyingTo = null; // 重置回覆狀態
    replyPreview.classList.add('hidden');
    sendTypingStatus(false);
    clearTypingState();
    activeThreadParent = null;
    activeThreadTitle = '';
    window.ThreadUI?.hide();
    window.AdminKeyBanner?.hide();
    syncRoomQueryParam('');
});

/**
 * 根據搜尋條件渲染房間列表
 */

// 監聽加入房間成功
socket.on('join success', (roomInfo) => {
    const roomName = roomInfo?.name;
    const displayName = roomInfo?.displayName || roomName || '';
    currentRoom = roomName || '';
    pendingRoomFromUrl = '';
    syncRoomQueryParam(currentRoom);
    const isThread = !!roomInfo?.isThread;
    if (isThread) {
        activeThreadParent = roomInfo.parentRoom || activeThreadParent;
        activeThreadTitle = roomInfo.threadTitle || '';
        roomTitle.textContent = `🧵 ${activeThreadTitle || displayName}`;
    } else {
        activeThreadParent = null;
        activeThreadTitle = '';
        roomTitle.textContent = displayName;
    }
    window.ThreadUI?.update(activeThreadParent, getRoomDisplayName(activeThreadParent), activeThreadTitle);
    
    // 切換視圖到聊天室
    lobbyView.classList.add('hidden');
    desktopBoard.classList.add('hidden');
    chatView.classList.remove('hidden');
    if (roomName && pendingAdminTokens.has(roomName)) {
        displayAdminToken(roomName, pendingAdminTokens.get(roomName));
    }
    scheduleRoomListRender();
});

// 監聽加入房間失敗 (密碼錯誤)
socket.on('join error', (errorKey) => {
    pendingRoomFromUrl = '';
    syncRoomQueryParam('');
    alert(t[errorKey] || '加入房間失敗！');
});

// 監聽搜尋框的輸入事件
searchInput.addEventListener('input', (e) => handleSearchTermChange(e.target.value, 'native'));

function handleSearchTermChange(value, origin) {
    if (isSearchSyncing) return;
    isSearchSyncing = true;
    const normalized = value || '';
    if (origin !== 'native') {
        searchInput.value = normalized;
    }
    if (origin !== 'board' && boardSearchInputElement) {
        boardSearchInputElement.value = normalized;
    }
    scheduleRoomListRender();
    isSearchSyncing = false;
}

// 監聽伺服器廣播的房間列表並更新大廳
socket.on('room list', (rooms) => {
    allRooms = rooms; // 更新全域的房間列表
    scheduleRoomListRender(); // 根據列表與現有搜尋條件重新渲染
    window.ThreadUI?.update(activeThreadParent, getRoomDisplayName(activeThreadParent), activeThreadTitle);
});

socket.on('room admin token', (payload) => {
    if (!payload || !payload.token || !payload.room) return;
    try {
        sessionStorage.setItem(`baha-admin-token:${payload.room}`, payload.token);
    } catch (error) {
        console.warn('無法暫存管理金鑰', error);
    }
    pendingAdminTokens.set(payload.room, payload.token);
    if (payload.room === currentRoom) {
        displayAdminToken(payload.room, payload.token);
    }
});

socket.on('room create error', (errorKey) => {
    const message = t[errorKey] || '建立房間失敗，請稍後再試。';
    alert(message);
});

socket.on('thread ready', (payload) => {
    if (!payload || !payload.room) return;
    const parent = payload.parentRoom || currentRoom;
    activeThreadTitle = payload.displayName || '';
    joinThreadRoom(payload.room, parent);
});

socket.on('thread status', (payload) => {
    if (!payload || !payload.parentMessageId) return;
    markMessageWithThread(payload.parentMessageId, {
        threadRoom: payload.threadRoom,
        threadTitle: payload.threadTitle
    });
});

socket.on('room cleared', (payload) => {
    if (!payload || payload.room !== currentRoom) return;
    messages.innerHTML = '';
    replyingTo = null;
    replyPreview.classList.add('hidden');
    addSystemMessage(t.room_cleared || '🧹 房間已被清空。');
});

socket.on('room deleted', (payload) => {
    if (!payload || payload.room !== currentRoom) return;
    addSystemMessage(t.room_deleted || '⚠️ 房間已被刪除，返回大廳。');
    backBtn.click();
});

socket.on('room renamed', (payload) => {
    if (!payload || payload.room !== currentRoom) return;
    const newName = payload.displayName || payload.room;
    roomTitle.textContent = newName;
    addSystemMessage((t.room_renamed || '✏️ 房間已重新命名。').replace('{name}', newName));
});

// 處理表單提交
form.addEventListener('submit', function(e) {
    e.preventDefault(); // 防止頁面重新整理
    const text = input.value;
    if (text.trim().length === 0) {
        sendTypingStatus(false);
        return;
    }
    const trimmedText = text.trim();

    // 檢查是否為 Markdown 切換指令
    if (trimmedText === '/md') {
        isMarkdownEnabled = !isMarkdownEnabled;
        addSystemMessage(isMarkdownEnabled ? t.system_md_on : t.system_md_off);
        input.value = ''; // 清空輸入框
        input.style.height = 'auto'; // 重置輸入框高度
        sendTypingStatus(false);
        return; // 中斷執行，不把指令發送給伺服器
    }

    if (text && currentRoom) {
        // 將輸入的訊息發送給伺服器，並附帶目前房間名稱與格式化設定
        socket.emit('chat message', { room: currentRoom, text: text, useMarkdown: isMarkdownEnabled, replyTo: replyingTo });
        input.value = ''; // 清空輸入框
        input.style.height = 'auto'; // 送出後重置輸入框高度
        replyingTo = null; // 送出後清空回覆狀態
        replyPreview.classList.add('hidden');
        sendTypingStatus(false);
        hideCommandSuggestions();
    }
});

// 讓輸入框自動根據內容調整高度
input.addEventListener('input', function() {
    this.style.height = 'auto'; // 先重置高度以重新計算
    this.style.height = this.scrollHeight + 'px'; // 設定為實際內容高度
    if (!currentRoom) return;
    const trimmed = this.value.trim();
    if (trimmed.length === 0) {
        sendTypingStatus(false);
        clearTimeout(typingTimer);
        return;
    }
    sendTypingStatus(true);
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => sendTypingStatus(false), TYPING_INACTIVITY_MS);
    renderCommandSuggestions(this.value);
});

// 讓使用者在聊天輸入框按 Enter 也能發送訊息
input.addEventListener('keydown', function(e) {
    const isSuggestionOpen = commandSuggestions && !commandSuggestions.classList.contains('hidden');
    if (isSuggestionOpen) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (e.key === 'ArrowDown') {
                currentSuggestionIndex = (currentSuggestionIndex + 1) % currentCommandSuggestions.length;
            } else {
                currentSuggestionIndex = (currentSuggestionIndex - 1 + currentCommandSuggestions.length) % currentCommandSuggestions.length;
            }
            setCommandSuggestionActive(currentSuggestionIndex);
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            if (currentSuggestionIndex >= 0 && currentCommandSuggestions[currentSuggestionIndex]) {
                applyCommandSuggestion(currentCommandSuggestions[currentSuggestionIndex].name);
            }
            return;
        }
        if (e.key === 'Escape') {
            hideCommandSuggestions();
            return;
        }
    }
    // 檢查是否只按下 Enter 鍵 (沒有組合 Shift 等)
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); // 防止 Enter 的預設行為
        form.querySelector('button[type="submit"]').click(); // 觸發發送按鈕的點擊事件
    }
});

input.addEventListener('blur', () => sendTypingStatus(false));

// 監聽來自伺服器的歷史訊息事件 (剛加入房間時觸發)
socket.on('chat history', function(history) {
    messages.innerHTML = ''; // 確保載入前清空畫面
    addMessageBatch(history);
});

// 監聽來自伺服器的訊息
socket.on('chat message', function(data) {
    // 觸發全螢幕特效
    if (data.effect === 'quake' && !reduceMotionEnabled) {
        document.body.classList.add('quake-effect');
        setTimeout(() => document.body.classList.remove('quake-effect'), 800);
    } else if (data.effect === 'party' && !reduceMotionEnabled) {
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
        maybeShowDesktopNotification(data);
    }
});

socket.on('chat message updated', (data) => {
    if (!data || data.room !== currentRoom || !data.mid || !data.linkPreview) return;
    const escapedId = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(data.mid) : data.mid;
    const target = messages.querySelector(`[data-mid="${escapedId}"]`);
    if (!target) return;
    appendLinkPreview(target, data.linkPreview);
});

// 監聽 Socket.io 連線成功事件 (隱藏載入畫面)
socket.on('connect', () => {
    loadingOverlay.classList.add('hidden');
    if (pendingRoomFromUrl && !currentRoom) {
        socket.emit('join room', { name: pendingRoomFromUrl });
    }
    // 若沒有在聊天室內，確保白板顯示在前景
    if (!currentRoom && desktopBoard) {
        desktopBoard.classList.remove('hidden');
    }
});

// 監聽 Socket.io 斷線事件 (顯示載入畫面)
socket.on('disconnect', () => {
    loadingOverlay.classList.remove('hidden');
});

socket.on('poll update', (update) => {
    if (!update) return;
    updatePollUI(update.pollId, update.options);
});

socket.on('kicked', ({room}) => {
    if (room && currentRoom === room) {
        addSystemMessage(`⚠️ 你已被踢出 ${room}`); // option use translations?
        backBtn.click();
    }
});

socket.on('typing status', (data) => {
    if (!data) return;
    handleIncomingTyping(data.userId, data.typing);
});

function updatePollUI(pollId, options) {
    const entry = pollElements.get(pollId);
    if (!entry || !options) return;

    options.forEach((option, index) => {
        const button = entry.buttons[index];
        if (!button) return;
        const label = button.querySelector('.poll-option-count');
        if (label) label.textContent = option.count;
    });
    highlightPollSelection(pollId);
}

function highlightPollSelection(pollId) {
    const selected = pollVotes.get(pollId);
    const entry = pollElements.get(pollId);
    if (!entry) return;
    entry.buttons.forEach((button, index) => {
        button.classList.toggle('selected', index === selected);
    });
}

const SIDE_PANEL_BREAKPOINT = 1024;
const SIDE_PANEL_DEFINITIONS = {
    lobby: {
        storageKey: 'baha-side-panel-lobby',
        defaults: [
            {
                id: 'desktop-guide',
                title: '更適合桌機的大廳',
                content: '拖曳視窗可以讓左側話題列表與右側資料同步顯示，保留 16:9 的閱讀節奏。'
            },
            {
                id: 'desktop-shortcuts',
                title: '快速捷徑',
                content: '直接輸入房名︰建立或加入公開話題\n/lock 密碼 房名︰建立鎖房\n/hot︰只看熱門\n/lock︰只看鎖房\n/open︰只看公開房間'
            },
            {
                id: 'desktop-support',
                title: '💖 支持開發',
                content: '桌機用戶可以直接透過 PayPal 送出 NT$30 的愛心贊助，感謝每一份支持。'
            }
        ]
    },
    chat: {
        storageKey: 'baha-side-panel-chat',
        defaults: [
            {
                id: 'chat-quick',
                title: '頻道速查',
                content: '/poll：建立投票\n/announce：發布公告\n/thread：延伸討論'
            },
            {
                id: 'chat-announcements',
                title: '最新公告',
                content: '系統會同步公告，房主可用 /rename、/clear 立即調整房間狀態。'
            }
        ]
    }
};

const sidePanelState = {};
let panelResizeTimer = null;

function isDesktopPanel() {
    return window.innerWidth >= SIDE_PANEL_BREAKPOINT;
}

function loadSidePanelConfig(panelId) {
    const definition = SIDE_PANEL_DEFINITIONS[panelId];
    if (!definition) return [];
    const stored = localStorage.getItem(definition.storageKey);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) return parsed;
        } catch (error) {
            console.error('解析 side panel 設定失敗', error);
        }
    }
    return definition.defaults.map(card => ({ ...card }));
}

function saveSidePanelConfig(panelId) {
    const definition = SIDE_PANEL_DEFINITIONS[panelId];
    if (!definition) return;
    localStorage.setItem(definition.storageKey, JSON.stringify(sidePanelState[panelId] || []));
}

function renderSidePanel(panelId) {
    const panelEl = document.querySelector(`.side-panel[data-panel-id="${panelId}"]`);
    if (!panelEl) return;
    const listEl = panelEl.querySelector('.side-card-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    sidePanelState[panelId] = sidePanelState[panelId] || [];
    sidePanelState[panelId].forEach(card => {
        listEl.appendChild(createSideCardElement(card, panelId));
    });
    updatePanelInteractions();
}

function createSideCardElement(card, panelId) {
    const article = document.createElement('article');
    article.className = 'side-card draggable-side-card';
    article.dataset.cardId = card.id;
    article.draggable = isDesktopPanel();

    const header = document.createElement('div');
    header.className = 'side-card-header';
    const title = document.createElement('h3');
    title.textContent = card.title;
    header.appendChild(title);

    if (card.custom) {
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'side-card-edit-btn';
        editBtn.title = '編輯卡片';
        editBtn.textContent = '✎';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (article.classList.contains('is-editing')) return;
            article.classList.add('is-editing');
            
            const form = document.createElement('form');
            form.className = 'side-panel-form side-card-edit-form';
            // 覆蓋原本 side-panel-form 預設隱藏或其他樣式
            form.style.display = 'flex';
            
            const titleInput = document.createElement('input');
            titleInput.name = 'title';
            titleInput.value = card.title;
            titleInput.placeholder = '卡片標題';
            titleInput.required = true;

            const contentInput = document.createElement('textarea');
            contentInput.name = 'content';
            contentInput.value = card.content;
            contentInput.rows = 4;
            contentInput.placeholder = '卡片內容 / 支援 Markdown 語法';
            contentInput.required = true;

            const actions = document.createElement('div');
            actions.className = 'side-panel-form-actions';
            
            const saveBtn = document.createElement('button');
            saveBtn.type = 'submit';
            saveBtn.textContent = '儲存';
            
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'side-panel-form-cancel';
            cancelBtn.textContent = '取消';

            actions.appendChild(saveBtn);
            actions.appendChild(cancelBtn);

            form.appendChild(titleInput);
            form.appendChild(contentInput);
            form.appendChild(actions);

            const originalBodyHtml = body.innerHTML;
            const originalTitleText = title.textContent;

            title.textContent = '編輯卡片';
            body.innerHTML = '';
            body.appendChild(form);
            
            titleInput.focus();

            cancelBtn.addEventListener('click', () => {
                article.classList.remove('is-editing');
                title.textContent = originalTitleText;
                body.innerHTML = originalBodyHtml;
            });

            form.addEventListener('submit', (evt) => {
                evt.preventDefault();
                card.title = titleInput.value.trim();
                card.content = contentInput.value.trim();
                saveSidePanelConfig(panelId);
                renderSidePanel(panelId);
            });
        });
        header.appendChild(editBtn);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'side-card-remove-btn';
        removeBtn.title = '移除卡片';
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sidePanelState[panelId] = sidePanelState[panelId].filter(item => item.id !== card.id);
            saveSidePanelConfig(panelId);
            renderSidePanel(panelId);
        });
        header.appendChild(removeBtn);
    }

    article.appendChild(header);

    const body = document.createElement('div');
    body.className = 'side-card-body';
    if (card.html) {
        body.innerHTML = card.content;
    } else {
        body.innerHTML = typeof parseMarkdown === 'function' 
            ? parseMarkdown(card.content) 
            : escapeHTML(card.content).replace(/\n/g, '<br>');
    }
    article.appendChild(body);

    return article;
}

function attachPanelDrag(panelId) {
    const panelEl = document.querySelector(`.side-panel[data-panel-id="${panelId}"]`);
    if (!panelEl) return;
    const listEl = panelEl.querySelector('.side-card-list');
    if (!listEl || listEl.dataset.dragSetup) return;

    listEl.dataset.dragSetup = 'true';
    let draggedCard = null;

    listEl.addEventListener('dragstart', (e) => {
        if (!isDesktopPanel()) {
            e.preventDefault();
            return;
        }
        const target = e.target.closest('.draggable-side-card');
        if (!target) return;
        draggedCard = target;
        target.classList.add('dragging');
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', target.dataset.cardId || '');
        }
    });

    listEl.addEventListener('dragover', (e) => {
        if (!isDesktopPanel() || !draggedCard) return;
        e.preventDefault();
        const target = e.target.closest('.draggable-side-card');
        if (!target || target === draggedCard) return;
        const rect = target.getBoundingClientRect();
        const shouldInsertAfter = (e.clientY - rect.top) > rect.height / 2;
        listEl.insertBefore(draggedCard, shouldInsertAfter ? target.nextSibling : target);
    });

    listEl.addEventListener('drop', (e) => {
        if (!isDesktopPanel()) return;
        e.preventDefault();
        updatePanelOrder(panelId, listEl);
    });

    listEl.addEventListener('dragend', () => {
        if (draggedCard) {
            draggedCard.classList.remove('dragging');
            draggedCard = null;
            updatePanelOrder(panelId, listEl);
        }
    });
}

function updatePanelOrder(panelId, listEl) {
    if (!listEl) return;
    const order = Array.from(listEl.querySelectorAll('.draggable-side-card'))
        .map(el => el.dataset.cardId);
    const map = (sidePanelState[panelId] || []).reduce((acc, card) => {
        acc[card.id] = card;
        return acc;
    }, {});

    sidePanelState[panelId] = order.map(id => map[id]).filter(Boolean);
    saveSidePanelConfig(panelId);
}

function setupSidePanelForm(panelEl) {
    const panelId = panelEl.dataset.panelId;
    const addBtn = panelEl.querySelector('.side-panel-add-btn');
    const form = panelEl.querySelector('.side-panel-form');
    const cancelBtn = form?.querySelector('.side-panel-form-cancel');

    addBtn?.addEventListener('click', () => togglePanelForm(panelId, true));
    cancelBtn?.addEventListener('click', () => togglePanelForm(panelId, false));

    form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const titleInput = form.querySelector('input[name="title"]');
        const contentInput = form.querySelector('textarea[name="content"]');
        if (!titleInput || !contentInput) return;
        const title = titleInput.value.trim();
        const content = contentInput.value.trim();
        if (!title || !content) return;

        const newCard = {
            id: `custom-${Date.now()}`,
            title,
            content,
            custom: true
        };
        sidePanelState[panelId] = sidePanelState[panelId] || [];
        sidePanelState[panelId].push(newCard);
        saveSidePanelConfig(panelId);
        renderSidePanel(panelId);
        togglePanelForm(panelId, false);
    });
}

function togglePanelForm(panelId, show) {
    const panelEl = document.querySelector(`.side-panel[data-panel-id="${panelId}"]`);
    const form = panelEl?.querySelector('.side-panel-form');
    if (!form) return;
    form.classList.toggle('hidden', !show);
    if (show) {
        form.querySelector('input[name="title"]')?.focus();
    } else {
        form.reset();
    }
}

function updatePanelInteractions() {
    const isDesktop = isDesktopPanel();
    document.querySelectorAll('.side-panel').forEach(panelEl => {
        const listEl = panelEl.querySelector('.side-card-list');
        listEl?.querySelectorAll('.draggable-side-card').forEach(card => {
            card.draggable = isDesktop;
        });
        const addBtn = panelEl.querySelector('.side-panel-add-btn');
        addBtn?.classList.toggle('hidden', !isDesktop);
        const form = panelEl.querySelector('.side-panel-form');
        if (form && !isDesktop) {
            form.classList.add('hidden');
        }
    });
}

function initSidePanels() {
    Object.keys(SIDE_PANEL_DEFINITIONS).forEach(panelId => {
        const panelEl = document.querySelector(`.side-panel[data-panel-id="${panelId}"]`);
        if (!panelEl) return;
        sidePanelState[panelId] = loadSidePanelConfig(panelId);
        renderSidePanel(panelId);
        setupSidePanelForm(panelEl);
        attachPanelDrag(panelId);
    });
    updatePanelInteractions();
}

window.addEventListener('resize', () => {
    clearTimeout(panelResizeTimer);
    panelResizeTimer = setTimeout(() => {
        updatePanelInteractions();
        updateDesktopBoardVisibility();
    }, 120);
});

initSidePanels();
updateDesktopBoardVisibility();
initializeBoard();

// Service Worker update logic moved to js/sw-update.js for better separation.
