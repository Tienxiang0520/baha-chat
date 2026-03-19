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
// 初始化 Socket.io 連線
const socket = io({ auth: { userId: localUserId } });

const loadingOverlay = document.getElementById('loading-overlay');
const lobbyView = document.getElementById('lobby-view');
const chatView = document.getElementById('chat-view');
const featuresView = document.getElementById('features-view');
const tutorialView = document.getElementById('tutorial-view');
const announcementView = document.getElementById('announcement-view');
const announcementList = document.getElementById('announcement-list');
const roomList = document.getElementById('room-list');
const chatRoomList = document.getElementById('chat-room-list');
const roomInput = document.getElementById('room-input');
const createRoomBtn = document.getElementById('create-room-btn');
const searchInput = document.getElementById('search-input');
let boardSearchInputElement = null;
let isSearchSyncing = false;
let boardRoomListElement = null;
const backBtn = document.getElementById('back-btn');
const featuresBtn = document.getElementById('features-btn');
const backFromFeaturesBtn = document.getElementById('back-from-features-btn');
const boardFeaturesBtn = document.getElementById('board-features-btn');
const tutorialBtn = document.getElementById('tutorial-btn');
const backFromTutorialBtn = document.getElementById('back-from-tutorial-btn');
const embedTutorialBtn = document.getElementById('embed-tutorial-btn');
const backFromEmbedTutorialBtn = document.getElementById('back-from-embed-tutorial-btn');
const embedTutorialView = document.getElementById('embed-tutorial-view');
const announcementBtn = document.getElementById('announcement-btn');
const backFromAnnouncementBtn = document.getElementById('back-from-announcement-btn');
const featuresDot = document.getElementById('features-dot');
const announcementDot = document.getElementById('announcement-dot');
const sponsorBtn = document.getElementById('sponsor-btn');
const reduceMotionBtn = document.getElementById('reduce-motion-btn');
const desktopNotificationsBtn = document.getElementById('desktop-notifications-btn');
const sponsorView = document.getElementById('sponsor-view');
const backFromSponsorBtn = document.getElementById('back-from-sponsor-btn');
const sponsorCopyEmailBtn = document.getElementById('sponsor-copy-email');
const sponsorEmailValue = document.getElementById('sponsor-email-value');
const roomTitle = document.getElementById('room-title');
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

// ===== 畫面切換邏輯 =====
featuresBtn.addEventListener('click', () => {
    lobbyView.classList.add('hidden');
    featuresView.classList.remove('hidden');
    featuresDot.classList.add('hidden'); // 點開功能選單時消除右上角紅點
});

if (boardFeaturesBtn) {
    boardFeaturesBtn.addEventListener('click', () => {
        lobbyView.classList.add('hidden');
        featuresView.classList.remove('hidden');
        featuresDot.classList.add('hidden');
    });
}

if (reduceMotionBtn) {
    reduceMotionBtn.addEventListener('click', () => {
        applyReduceMotionPreference(!reduceMotionEnabled);
    });
}

if (desktopNotificationsBtn) {
    desktopNotificationsBtn.addEventListener('click', () => {
        if (notificationsEnabled) {
            notificationsEnabled = false;
            localStorage.setItem(NOTIFICATION_STORAGE_KEY, 'false');
            updateNotificationsButton();
        } else {
            requestDesktopNotifications();
        }
    });
}

backFromFeaturesBtn.addEventListener('click', () => {
    featuresView.classList.add('hidden');
});

tutorialBtn.addEventListener('click', () => {
    featuresView.classList.add('hidden');
    tutorialView.classList.remove('hidden');
});

backFromTutorialBtn.addEventListener('click', () => {
    tutorialView.classList.add('hidden');
    featuresView.classList.remove('hidden');
});

if (embedTutorialBtn && backFromEmbedTutorialBtn && embedTutorialView) {
    embedTutorialBtn.addEventListener('click', () => {
        featuresView.classList.add('hidden');
        embedTutorialView.classList.remove('hidden');
    });

    backFromEmbedTutorialBtn.addEventListener('click', () => {
        embedTutorialView.classList.add('hidden');
        featuresView.classList.remove('hidden');
    });
}

announcementBtn.addEventListener('click', () => {
    featuresView.classList.add('hidden');
    announcementView.classList.remove('hidden');
    announcementDot.classList.add('hidden'); // 點開公告列表時消除紅點
});

sponsorBtn.addEventListener('click', () => {
    featuresView.classList.add('hidden');
    sponsorView.classList.remove('hidden');
    featuresDot.classList.add('hidden');
});

backFromSponsorBtn.addEventListener('click', () => {
    sponsorView.classList.add('hidden');
    featuresView.classList.remove('hidden');
});

backFromAnnouncementBtn.addEventListener('click', () => {
    announcementView.classList.add('hidden');
    featuresView.classList.remove('hidden');
});

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

if (sponsorCopyEmailBtn) {
    sponsorCopyEmailBtn.addEventListener('click', async () => {
        const email = sponsorEmailValue?.textContent?.trim();
        if (!email) return;

        try {
            await copyToClipboard(email);
            addSystemMessage(t.sponsor_copied || 'Sponsor email copied');
        } catch (error) {
            console.error('贊助信箱複製失敗', error);
        }
    });
}

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
updateNotificationsButton();

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
    if (reduceMotionBtn) {
        reduceMotionBtn.textContent = enabled ? '減少動態效果 (已啟用)' : '減少動態效果';
    }
}

function maybeShowReduceMotionHint() {
    if (!reduceMotionBtn) return;
    reduceMotionBtn.textContent = reduceMotionEnabled ? '減少動態效果 (已啟用)' : '減少動態效果';
}

function updateNotificationsButton() {
    if (!desktopNotificationsBtn) return;
    const prefix = notificationsEnabled ? '桌面通知 (已開啟)' : '桌面通知 (關閉中)';
    desktopNotificationsBtn.textContent = prefix;
}

function requestDesktopNotifications() {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
            notificationsEnabled = true;
            localStorage.setItem(NOTIFICATION_STORAGE_KEY, 'true');
        } else {
            notificationsEnabled = false;
            localStorage.setItem(NOTIFICATION_STORAGE_KEY, 'false');
        }
        updateNotificationsButton();
    });
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
    { id: 'board-actions', type: 'actions', x: 24, y: 260, width: 360, height: 190, data: { title: '快速指令', subtitle: '常用管理與互動指令' }, removable: true, resizable: true },
    { id: 'board-sponsor', type: 'sponsor', x: 412, y: 260, width: 280, height: 170, data: { title: '支持開發', subtitle: '每份贊助都讓 Baha 更穩定' }, removable: true, resizable: true }
];
const MODULE_MIN_WIDTH = 220;
const MODULE_MIN_HEIGHT = 160;
const BOARD_ACTIONS = [
    { command: '/poll', description: '發起話題投票' },
    { command: '/canvas', description: '分享白板連結' },
    { command: '/thread', description: '延伸為討論串' },
    { command: '/announce', description: '發布系統公告' },
    { command: '/kick', description: '踢出惡意使用者' }
];
const BOARD_MODULE_TITLES = {
    'create-room': '建立房間',
    'search': '搜尋話題',
    'rooms': '房間列表',
    'actions': '快速指令',
    'sponsor': '支持開發'
};

let boardModules = [];

function refreshBoardCanvasSize() {
    if (!boardCanvas) return;
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
    localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(boardModules));
}

function resetBoardModules() {
    boardModules = BOARD_DEFAULT_MODULES.map(module => ({
        ...module,
        data: module.data ? { ...module.data } : {}
    }));
    saveBoardModules();
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

    const handle = document.createElement('header');
    handle.className = 'board-module-handle';
    const title = document.createElement('span');
    title.textContent = module.data?.title || BOARD_MODULE_TITLES[module.type] || '白板模組';
    handle.appendChild(title);

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
                   saveBoardModules();
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
                saveBoardModules();
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
    if (!handle || !moduleEl) return;
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
        saveBoardModules();
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
    if (!resizer || !moduleEl) return;
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
        saveBoardModules();
    };
}

function renderBoardModules() {
    if (!boardCanvas) return;
    boardCanvas.innerHTML = '';
    boardRoomListElement = null;
    boardSearchInputElement = null;
    boardModules.forEach(module => {
        const moduleEl = createBoardModuleElement(module);
        boardCanvas.appendChild(moduleEl);
    });
    refreshBoardCanvasSize();
    renderRoomList();
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
    saveBoardModules();
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
    saveBoardModules();
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

function joinThreadRoom(roomName, parentRoomName = null) {
    if (!roomName) return;
    if (parentRoomName) {
        activeThreadParent = parentRoomName;
    } else if (!activeThreadParent) {
        activeThreadParent = currentRoom;
    }
    socket.emit('join room', { name: roomName });
}

/**
 * 解鎖加密訊息的邏輯
 */
window.unlockMessage = function(btnElement, correctPassword, encodedContent) {
    const container = btnElement.closest('.locked-message-container');
    const input = container.querySelector('.unlock-input');
    
    if (input.value === correctPassword) {
        // 密碼正確，顯示原本的內容 (這裡我們讓解鎖後的內容也能套用一般的 Markdown，但不包含多媒體和代碼塊避免解析衝突)
        const decodedContent = decodeURIComponent(encodedContent);
        container.innerHTML = `<div class="unlocked-content">🔓 ${decodedContent.replace(/\n/g, '<br>')}</div>`;
    } else {
        input.value = '';
        input.placeholder = t.locked_wrong;
    }
};

/**
 * 將一則訊息新增到畫面上
 * @param {object} data - 包含 id, text 和 timestamp 的訊息物件
 * @param {boolean} skipScroll - 是否跳過捲動 (彈幕模式時使用)
 */
function addMessage(data, skipScroll = false) {
    const item = document.createElement('li');
    const messageId = data.mid || data._id || '';
    if (messageId) {
        item.dataset.mid = messageId;
    }
    const isMyMessage = data.id === localUserId;

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
    
    // 支援多國語系翻譯鍵值
    let displayText = data.text;
    if (data.i18nKey && t[data.i18nKey]) {
        displayText = t[data.i18nKey];
        if (data.i18nArgs) {
            for (const [key, value] of Object.entries(data.i18nArgs)) {
                displayText = displayText.replace(`{${key}}`, value);
            }
        }
        if (data.extraText) {
            displayText += data.extraText;
        }
    }

    textSpan.innerHTML = applyMarkdown ? parseMarkdown(displayText) : escapeHTML(displayText);
    item.appendChild(textSpan);

    if (data.threadLink && data.threadLink.room) {
        const threadBtn = document.createElement('button');
        threadBtn.className = 'thread-link-btn';
        threadBtn.textContent = t.thread_button || '🧵 討論串';
        threadBtn.addEventListener('click', () => {
            joinThreadRoom(data.threadLink.room, currentRoom);
        });
        item.appendChild(threadBtn);
    }

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

    if (data.poll) {
        const pollCard = document.createElement('div');
        pollCard.className = 'poll-card';

        const title = document.createElement('div');
        title.className = 'poll-card__question';
        title.textContent = data.poll.question;
        pollCard.appendChild(title);

        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'poll-card__options';

        const optionButtons = data.poll.options.map((option, index) => {
            const btn = document.createElement('button');
            btn.className = 'poll-option-btn';
            btn.innerHTML = `<span>${escapeHTML(option.text)}</span><span class="poll-option-count">${option.count}</span>`;
            btn.addEventListener('click', () => {
                pollVotes.set(data.poll.id, index);
                socket.emit('poll vote', { pollId: data.poll.id, optionIndex: index });
                highlightPollSelection(data.poll.id);
            });
            optionsContainer.appendChild(btn);
            return btn;
        });

        pollCard.appendChild(optionsContainer);
        item.appendChild(pollCard);
        pollElements.set(data.poll.id, { buttons: optionButtons });
        highlightPollSelection(data.poll.id);
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
        selectedMessageMid = data.mid || null;
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
function attemptRoomCreation(rawValue, sourceInput) {
    const trimmed = rawValue?.trim() || '';
    if (trimmed.length === 0) {
        return false;
    }
    let roomName = trimmed;
    let password = null;

    // 檢查是否使用 /lock 指令建立密碼房
    if (trimmed.startsWith('/lock ')) {
        const parts = trimmed.split(' ');
        if (parts.length >= 3) {
            password = parts[1];
            roomName = parts.slice(2).join(' ');
        }
    }

    socket.emit('create room', { name: roomName, password: password });
    if (sourceInput) {
        sourceInput.value = '';
    }
    return true;
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
});

/**
 * 根據搜尋條件渲染房間列表
 */
function createRoomListItem(room) {
    const li = document.createElement('li');
    const displayName = room.displayName || room.name;
    const nameSpan = document.createElement('span');
    nameSpan.className = 'room-name-text';
    nameSpan.textContent = `${room.isLocked ? '🔒' : '💬'} ${displayName}`;

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
    if (room.name === currentRoom) {
        li.classList.add('active');
    }

    li.addEventListener('click', () => {
        let password = null;
        if (room.isLocked) {
            password = prompt(t.prompt_password);
            if (password === null) return;
        }
        socket.emit('join room', { name: room.name, password: password });
    });
    return li;
}

function renderRoomList() {
    let searchTerm = searchInput.value.toLowerCase().trim();
    const targetLists = [roomList];
    if (chatRoomList) {
        targetLists.push(chatRoomList);
    }
    if (boardRoomListElement) {
        targetLists.push(boardRoomListElement);
    }
    targetLists.forEach(list => list.innerHTML = '');

    let sortByHot = false;
    let filterLocked = null;

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

    let filteredRooms = allRooms.filter(room => {
        const displayName = (room.displayName || room.name).toLowerCase();
        const rawName = room.name.toLowerCase();
        return displayName.includes(searchTerm) || rawName.includes(searchTerm);
    });

    filteredRooms = filteredRooms.filter(room => !room.isThread);

    if (filterLocked !== null) {
        filteredRooms = filteredRooms.filter(room => !!room.isLocked === filterLocked);
    }

    if (sortByHot) {
        filteredRooms.sort((a, b) => {
            if (b.userCount !== a.userCount) {
                return b.userCount - a.userCount;
            }
            return b.createdAt - a.createdAt;
        });
    } else {
        filteredRooms.sort((a, b) => b.createdAt - a.createdAt);
    }

    filteredRooms.forEach(room => {
        targetLists.forEach(list => list.appendChild(createRoomListItem(room)));
    });
}

// ===== 系統公告渲染與事件 =====
function createAnnouncementElement(data) {
    const item = document.createElement('div');
    item.className = 'announcement-item';
    const dateStr = new Date(data.createdAt).toLocaleDateString();
    item.innerHTML = `
        <div class="announcement-date">${dateStr}</div>
        <h3 class="announcement-title">${escapeHTML(data.title)}</h3>
        <p class="announcement-text">${escapeHTML(data.content).replace(/\n/g, '<br>')}</p>
    `;
    return item;
}

socket.on('announcement list', (list) => {
    announcementList.innerHTML = '';
    list.forEach(data => announcementList.appendChild(createAnnouncementElement(data)));
});

socket.on('new announcement', (data) => {
    announcementList.insertBefore(createAnnouncementElement(data), announcementList.firstChild);
    // 如果目前不在公告畫面，顯示小紅點提示
    if (announcementView.classList.contains('hidden')) {
        featuresDot.classList.remove('hidden');
        announcementDot.classList.remove('hidden');
    }
});

// 監聽加入房間成功
socket.on('join success', (roomInfo) => {
    const roomName = roomInfo?.name;
    const displayName = roomInfo?.displayName || roomName || '';
    currentRoom = roomName || '';
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
    renderRoomList();
});

// 監聽加入房間失敗 (密碼錯誤)
socket.on('join error', (errorKey) => {
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
    renderRoomList();
    isSearchSyncing = false;
}

// 監聽伺服器廣播的房間列表並更新大廳
socket.on('room list', (rooms) => {
    allRooms = rooms; // 更新全域的房間列表
    renderRoomList(); // 根據列表與現有搜尋條件重新渲染
    window.ThreadUI?.update(activeThreadParent, getRoomDisplayName(activeThreadParent), activeThreadTitle);
});

socket.on('room admin token', (payload) => {
    if (!payload || !payload.token || !payload.room) return;
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
    // 載入所有歷史訊息
    history.forEach(data => {
        addMessage(data);
    });
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

// 監聽 Socket.io 連線成功事件 (隱藏載入畫面)
socket.on('connect', () => {
    loadingOverlay.classList.add('hidden');
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
                content: '/rooms︰顯示所有開放話題\n/hot︰只看熱門\n/announce︰查看公告'
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
