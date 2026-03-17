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
const roomInput = document.getElementById('room-input');
const createRoomBtn = document.getElementById('create-room-btn');
const searchInput = document.getElementById('search-input');
const backBtn = document.getElementById('back-btn');
const featuresBtn = document.getElementById('features-btn');
const backFromFeaturesBtn = document.getElementById('back-from-features-btn');
const tutorialBtn = document.getElementById('tutorial-btn');
const backFromTutorialBtn = document.getElementById('back-from-tutorial-btn');
const announcementBtn = document.getElementById('announcement-btn');
const backFromAnnouncementBtn = document.getElementById('back-from-announcement-btn');
const featuresDot = document.getElementById('features-dot');
const announcementDot = document.getElementById('announcement-dot');
const sponsorBtn = document.getElementById('sponsor-btn');
const sponsorView = document.getElementById('sponsor-view');
const backFromSponsorBtn = document.getElementById('back-from-sponsor-btn');
const sponsorCopyEmailBtn = document.getElementById('sponsor-copy-email');
const sponsorEmailValue = document.getElementById('sponsor-email-value');
const roomTitle = document.getElementById('room-title');
const danmakuContainer = document.getElementById('danmaku-container');
const contextMenu = document.getElementById('message-context-menu');
const menuCopy = document.getElementById('menu-copy');
const menuReply = document.getElementById('menu-reply');
const replyPreview = document.getElementById('reply-preview');
const replyPreviewUser = document.getElementById('reply-preview-user');
const replyPreviewText = document.getElementById('reply-preview-text');
const cancelReplyBtn = document.getElementById('cancel-reply-btn');
const swUpdateBanner = document.getElementById('sw-update-banner');
const swUpdateButton = document.getElementById('sw-update-btn');
const pollElements = new Map();
const pollVotes = new Map();

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');

let currentRoom = ''; // 紀錄目前所在的房間
let allRooms = []; // 儲存從伺服器收到的所有房間列表
let messageTimestamps = []; // 紀錄訊息抵達的時間以計算頻率
const DANMAKU_THRESHOLD = 10; // 觸發彈幕模式的門檻 (條/秒)
let isMarkdownEnabled = true; // 紀錄是否啟用 Markdown
let replyingTo = null; // 紀錄目前正在回覆的訊息資料

// ===== 畫面切換邏輯 =====
featuresBtn.addEventListener('click', () => {
    lobbyView.classList.add('hidden');
    featuresView.classList.remove('hidden');
    featuresDot.classList.add('hidden'); // 點開功能選單時消除右上角紅點
});

backFromFeaturesBtn.addEventListener('click', () => {
    featuresView.classList.add('hidden');
    lobbyView.classList.remove('hidden');
});

tutorialBtn.addEventListener('click', () => {
    featuresView.classList.add('hidden');
    tutorialView.classList.remove('hidden');
});

backFromTutorialBtn.addEventListener('click', () => {
    tutorialView.classList.add('hidden');
    featuresView.classList.remove('hidden');
});

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

/**
 * 輕量級 Markdown 解析器 (支援 Discord 常用語法)
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

const markdownParser = window.markdownit?.({
    html: false,
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
        let sanitized = DOMPurify.sanitize(rawHtml);

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
    const text = input.value;
    const trimmedText = text.trim();
    
    if (trimmedText.length === 0) return;

    // 檢查是否為 Markdown 切換指令
    if (trimmedText === '/md') {
        isMarkdownEnabled = !isMarkdownEnabled;
        addSystemMessage(isMarkdownEnabled ? t.system_md_on : t.system_md_off);
        input.value = ''; // 清空輸入框
        input.style.height = 'auto'; // 重置輸入框高度
        return; // 中斷執行，不把指令發送給伺服器
    }

    if (text && currentRoom) {
        // 將輸入的訊息發送給伺服器，並附帶目前房間名稱與格式化設定
        socket.emit('chat message', { room: currentRoom, text: text, useMarkdown: isMarkdownEnabled, replyTo: replyingTo });
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

socket.on('poll update', (update) => {
    if (!update) return;
    updatePollUI(update.pollId, update.options);
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

if ('serviceWorker' in navigator) {
    let isReloading = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (isReloading) return;
        isReloading = true;
        window.location.reload();
    });

    const showUpdateBanner = (registration) => {
        if (!swUpdateBanner || !registration?.waiting) return;
        swUpdateBanner.classList.remove('hidden');
        if (swUpdateButton) {
            swUpdateButton.onclick = () => {
                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            };
        }
    };

    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            if (registration.waiting) {
                showUpdateBanner(registration);
            }
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (!newWorker) return;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdateBanner(registration);
                    }
                });
            });
        } catch (error) {
            console.log('ServiceWorker 註冊失敗: ', error);
        }
    });
}
