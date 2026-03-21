(function () {
    const USER_ID_STORAGE_KEY = 'baha-user-id';
    const ADMIN_TOKEN_STORAGE_PREFIX = 'baha-admin-token:';
    const TYPING_INACTIVITY_MS = 2500;
    const SERVER_ORIGIN = window.BAHA_CHAT_SERVER_ORIGIN || window.location.origin;

    function generateRandomUserId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const length = Math.floor(Math.random() * 3) + 8;
        let id = '';
        for (let index = 0; index < length; index += 1) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return id;
    }

    function getOrCreateUserId() {
        const existing = localStorage.getItem(USER_ID_STORAGE_KEY);
        if (existing && /^[A-Za-z0-9]{8,10}$/.test(existing)) {
            return existing;
        }
        const generated = generateRandomUserId();
        localStorage.setItem(USER_ID_STORAGE_KEY, generated);
        return generated;
    }

    function getBrowserLanguage() {
        const lang = navigator.language || navigator.userLanguage || 'zh-TW';
        if (lang.startsWith('zh-CN') || lang === 'zh-SG') return 'zh-CN';
        if (lang.startsWith('zh')) return 'zh-TW';
        if (lang.startsWith('ja')) return 'ja';
        if (lang.startsWith('ko')) return 'ko';
        if (lang.startsWith('en')) return 'en';
        if (lang.startsWith('vi')) return 'vi';
        return 'zh-TW';
    }

    const socketFactory = typeof window.io === 'function' ? window.io : null;
    if (!socketFactory) {
        console.error('Socket.io client failed to load.');
        return;
    }

    const t = (window.translations && window.translations[getBrowserLanguage()]) || (window.translations && window.translations['zh-TW']) || {};
    const localUserId = getOrCreateUserId();
    const socket = socketFactory(SERVER_ORIGIN, { auth: { userId: localUserId } });

    const backLink = document.getElementById('back-link');
    const roomTitle = document.getElementById('room-title');
    const roomSubtitle = document.getElementById('room-subtitle');
    const connectionDot = document.getElementById('connection-dot');
    const connectionLabel = document.getElementById('connection-label');
    const connectionBanner = document.getElementById('connection-banner');
    const runtimeHint = document.getElementById('runtime-hint');
    const createRoomInput = document.getElementById('create-room-input');
    const createRoomBtn = document.getElementById('create-room-btn');
    const roomSearchInput = document.getElementById('room-search-input');
    const roomList = document.getElementById('room-list');
    const roomEmpty = document.getElementById('room-empty');
    const emptyState = document.getElementById('room-empty-state');
    const threadBanner = document.getElementById('thread-banner');
    const threadParentName = document.getElementById('thread-parent-name');
    const threadBackBtn = document.getElementById('thread-back-btn');
    const adminTokenBanner = document.getElementById('admin-token-banner');
    const adminTokenText = document.getElementById('admin-token-text');
    const adminTokenCopyBtn = document.getElementById('admin-token-copy');
    const adminTokenCloseBtn = document.getElementById('admin-token-close');
    const messages = document.getElementById('messages');
    const typingIndicator = document.getElementById('typing-indicator');
    const replyPreview = document.getElementById('reply-preview');
    const replyPreviewUser = document.getElementById('reply-preview-user');
    const replyPreviewText = document.getElementById('reply-preview-text');
    const cancelReplyBtn = document.getElementById('cancel-reply-btn');
    const composerForm = document.getElementById('chat-form');
    const markdownToggleBtn = document.getElementById('markdown-toggle-btn');
    const markdownStatus = document.getElementById('markdown-status');
    const chatInput = document.getElementById('chat-input');
    const chatStatus = document.getElementById('chat-status');
    const menu = document.getElementById('message-context-menu');
    const menuReply = document.getElementById('menu-reply');
    const menuCopy = document.getElementById('menu-copy');
    const menuThread = document.getElementById('menu-thread');

    let markdownParser = null;
    let currentRoom = '';
    let currentRoomDisplayName = '';
    let activeThreadParent = null;
    let activeThreadTitle = '';
    let allRooms = [];
    let isMarkdownEnabled = true;
    let typingTimer = null;
    let isTyping = false;
    let messageScrollScheduled = false;
    let pendingJoin = null;
    let pendingCreatedRoom = '';
    let replyingTo = null;
    let selectedMessageText = '';
    let selectedMessageId = '';
    let selectedMessageMid = null;
    let selectedMessageElement = null;

    const pollElements = new Map();
    const pollVotes = new Map();
    const typingUsers = new Map();
    const typingThrottles = new Map();

    function applyTranslations() {
        document.querySelectorAll('[data-i18n]').forEach((element) => {
            const key = element.getAttribute('data-i18n');
            if (t[key]) {
                element.textContent = t[key];
            }
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
            const key = element.getAttribute('data-i18n-placeholder');
            if (t[key]) {
                element.placeholder = t[key];
            }
        });
    }

    function updateMarkdownStatus() {
        markdownToggleBtn.textContent = isMarkdownEnabled ? 'Markdown ON' : 'Markdown OFF';
        markdownStatus.textContent = isMarkdownEnabled ? (t.system_md_on || 'Markdown 已開啟') : (t.system_md_off || 'Markdown 已關閉');
    }

    function updateConnectionUI(isConnected) {
        connectionDot.classList.toggle('offline', !isConnected);
        connectionLabel.textContent = isConnected ? '已連線' : '連線中斷';
        connectionBanner.classList.toggle('hidden', isConnected);
    }

    function updateBackLink() {
        backLink.href = SERVER_ORIGIN + '/';
    }

    function setRuntimeHint() {
        if (window.location.protocol === 'file:') {
            runtimeHint.textContent = `目前以本機檔案模式預覽，聊天室會連線到 ${SERVER_ORIGIN}`;
        } else {
            runtimeHint.textContent = `匿名 ID：${localUserId}`;
        }
    }

    function escapeHTML(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function stringToColor(str) {
        let hash = 0;
        for (let index = 0; index < str.length; index += 1) {
            hash = str.charCodeAt(index) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue}, 70%, 42%)`;
    }

    function initializeMarkdown() {
        if (typeof window.markdownit !== 'function') return;
        markdownParser = window.markdownit({
            html: true,
            breaks: true,
            linkify: true,
            typographer: true
        })
            .use(window.markdownitAnchor || (() => {}))
            .use(window.markdownitEmoji?.full || window.markdownitEmoji || (() => {}))
            .use(window.markdownitAbbr || (() => {}))
            .use(window.markdownitFootnote || (() => {}))
            .use(window.markdownitTaskLists || (() => {}), { enabled: true, label: true })
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
            ['info', 'warning', 'tip'].forEach((type) => {
                markdownParser.use(window.markdownitContainer, type, {
                    render(tokens, idx) {
                        return tokens[idx].nesting === 1 ? `<div class="custom-block ${type}">` : '</div>';
                    }
                });
            });
        }
    }

    window.unlockMessage = function unlockMessage(button, correctPassword, encodedContent) {
        const container = button.closest('.locked-message-container');
        const input = container ? container.querySelector('.unlock-input') : null;
        if (!container || !input) return;
        if (input.value === correctPassword) {
            container.innerHTML = `<div class="unlocked-content">🔓 ${decodeURIComponent(encodedContent).replace(/\n/g, '<br>')}</div>`;
            return;
        }
        input.value = '';
        input.placeholder = t.locked_wrong || '密碼錯誤';
    };

    function parseMarkdown(text) {
        if (!markdownParser || typeof DOMPurify === 'undefined') {
            return escapeHTML(text);
        }

        const lockPlaceholders = [];
        const preparedText = String(text ?? '').replace(/\[lock:(.*?)\]([\s\S]*?)\[\/lock\]/g, (match, password, content) => {
            const placeholder = `__LOCKED_${lockPlaceholders.length}__`;
            lockPlaceholders.push({
                placeholder,
                password,
                encodedContent: encodeURIComponent(content)
            });
            return placeholder;
        });

        try {
            let sanitized = DOMPurify.sanitize(markdownParser.render(preparedText), {
                ADD_TAGS: ['iframe'],
                ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src', 'width', 'height', 'type', 'id']
            });
            lockPlaceholders.forEach(({ placeholder, password, encodedContent }) => {
                const lockedHtml = `<div class="locked-message-container">
                    <div class="locked-header">${t.locked_message || '🔒 這是一則加密訊息'}</div>
                    <div class="locked-body">
                        <input type="password" class="unlock-input" placeholder="${t.enter_password || '輸入密碼'}">
                        <button class="unlock-btn" onclick="unlockMessage(this, '${password}', '${encodedContent}')">${t.unlock || '解鎖'}</button>
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

    function scheduleMessageScroll() {
        if (messageScrollScheduled) return;
        messageScrollScheduled = true;
        requestAnimationFrame(() => {
            messages.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' });
            messageScrollScheduled = false;
        });
    }

    function updateEmptyState() {
        const hasRoom = !!currentRoom;
        emptyState.classList.toggle('hidden', hasRoom || messages.children.length > 0);
        chatStatus.textContent = hasRoom ? `目前房間：${currentRoomDisplayName || currentRoom}` : '尚未加入房間';
    }

    function addSystemMessage(text) {
        const item = document.createElement('li');
        item.className = 'system-message';
        item.textContent = text;
        messages.appendChild(item);
        updateEmptyState();
        scheduleMessageScroll();
    }

    function appendLinkPreview(item, linkPreview) {
        if (!item || !linkPreview || !linkPreview.title) return;
        const previewCard = document.createElement('a');
        previewCard.className = 'link-preview-card';
        previewCard.href = linkPreview.url;
        previewCard.target = '_blank';
        previewCard.rel = 'noopener noreferrer';

        const content = document.createElement('div');
        content.className = 'link-preview-content';
        const title = document.createElement('div');
        title.className = 'link-preview-title';
        title.textContent = linkPreview.title;
        const desc = document.createElement('div');
        desc.className = 'link-preview-desc';
        desc.textContent = linkPreview.description || linkPreview.url || '';
        content.appendChild(title);
        content.appendChild(desc);
        previewCard.appendChild(content);

        if (linkPreview.image) {
            const image = document.createElement('img');
            image.className = 'link-preview-image';
            image.src = linkPreview.image;
            image.alt = linkPreview.title;
            previewCard.appendChild(image);
        }

        item.appendChild(previewCard);
    }

    function applyThreadHint(item, data) {
        const existing = item.querySelector('.thread-hint');
        if (existing) existing.remove();
        if (!data?.threadOpened) return;
        const hint = document.createElement('div');
        hint.className = 'thread-hint';
        hint.textContent = data.threadRoom ? `🧵 討論串已開啟：${data.threadRoom}` : '🧵 討論串已開啟';
        item.appendChild(hint);
    }

    function closeContextMenu() {
        menu.classList.add('hidden');
        if (selectedMessageElement) {
            selectedMessageElement.classList.remove('selected-message');
        }
        selectedMessageText = '';
        selectedMessageId = '';
        selectedMessageMid = null;
        selectedMessageElement = null;
    }

    function buildMessageElement(data) {
        const item = document.createElement('li');
        const messageId = data.mid || data._id || '';
        if (messageId) {
            item.dataset.mid = messageId;
        }

        const isMyMessage = data.id === localUserId;
        if (isMyMessage) {
            item.classList.add('my-message');
        }

        if (data.replyTo) {
            const replyDiv = document.createElement('div');
            replyDiv.className = 'replied-message';
            replyDiv.textContent = `${t.replied_message_prefix || '回覆'} [${data.replyTo.id}]: ${data.replyTo.text}`;
            item.appendChild(replyDiv);
        }

        if (!isMyMessage && data.id !== 'System') {
            const idSpan = document.createElement('span');
            idSpan.className = 'user-id';
            idSpan.textContent = `[${data.id}]`;
            idSpan.style.color = stringToColor(data.id);
            item.appendChild(idSpan);
        }

        const textBlock = document.createElement('div');
        let displayText = data.text;
        if (data.i18nKey && t[data.i18nKey]) {
            displayText = t[data.i18nKey];
            if (data.i18nArgs) {
                Object.entries(data.i18nArgs).forEach(([key, value]) => {
                    displayText = displayText.replace(`{${key}}`, value);
                });
            }
            if (data.extraText) {
                displayText += data.extraText;
            }
        }
        textBlock.innerHTML = data.useMarkdown === false ? escapeHTML(displayText) : parseMarkdown(displayText);
        item.appendChild(textBlock);

        if (data.threadOpened || data.threadRoom) {
            applyThreadHint(item, data);
        }

        if (data.threadLink && data.threadLink.room) {
            const threadBtn = document.createElement('button');
            threadBtn.type = 'button';
            threadBtn.className = 'chip-btn thread-link-btn';
            threadBtn.textContent = data.threadLink.displayName || t.thread_button || '🧵 前往討論串';
            threadBtn.addEventListener('click', () => {
                joinRoom(data.threadLink.room, null, {
                    parentRoom: currentRoom,
                    threadTitle: data.threadLink.displayName || ''
                });
            });
            item.appendChild(threadBtn);
        }

        appendLinkPreview(item, data.linkPreview);

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
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'poll-option-btn';
                button.innerHTML = `<span>${escapeHTML(option.text)}</span><span class="poll-option-count">${option.count}</span>`;
                button.addEventListener('click', () => {
                    pollVotes.set(data.poll.id, index);
                    socket.emit('poll vote', { pollId: data.poll.id, optionIndex: index });
                    highlightPollSelection(data.poll.id);
                });
                optionsContainer.appendChild(button);
                return button;
            });

            pollCard.appendChild(optionsContainer);
            item.appendChild(pollCard);
            pollElements.set(data.poll.id, { buttons: optionButtons });
            highlightPollSelection(data.poll.id);
        }

        if (data.timestamp) {
            const timeSpan = document.createElement('span');
            timeSpan.className = 'message-time';
            const date = new Date(data.timestamp);
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            timeSpan.textContent = `${hours}:${minutes}`;
            item.appendChild(timeSpan);
        }

        let pressTimer = null;
        const showMenu = (x, y) => {
            if (data.id === 'System') return;
            closeContextMenu();
            selectedMessageText = data.text || '';
            selectedMessageId = data.id || '';
            selectedMessageMid = data.mid || null;
            selectedMessageElement = item;
            item.classList.add('selected-message');
            menu.classList.remove('hidden');

            const menuWidth = menu.offsetWidth || 180;
            const menuHeight = menu.offsetHeight || 160;
            const left = Math.min(x, window.innerWidth - menuWidth - 12);
            const top = Math.min(y, window.innerHeight - menuHeight - 12);
            menu.style.left = `${Math.max(12, left)}px`;
            menu.style.top = `${Math.max(12, top)}px`;
        };

        item.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            showMenu(event.clientX, event.clientY);
        });

        item.addEventListener('touchstart', (event) => {
            pressTimer = window.setTimeout(() => {
                showMenu(event.touches[0].clientX, event.touches[0].clientY);
            }, 500);
        });
        item.addEventListener('touchend', () => window.clearTimeout(pressTimer));
        item.addEventListener('touchmove', () => window.clearTimeout(pressTimer));

        return item;
    }

    function addMessage(data) {
        messages.appendChild(buildMessageElement(data));
        updateEmptyState();
        scheduleMessageScroll();
    }

    function addMessageBatch(history) {
        const fragment = document.createDocumentFragment();
        history.forEach((entry) => {
            fragment.appendChild(buildMessageElement(entry));
        });
        messages.appendChild(fragment);
        updateEmptyState();
        scheduleMessageScroll();
    }

    function highlightPollSelection(pollId) {
        const selected = pollVotes.get(pollId);
        const entry = pollElements.get(pollId);
        if (!entry) return;
        entry.buttons.forEach((button, index) => {
            button.classList.toggle('selected', index === selected);
        });
    }

    function updatePollUI(pollId, options) {
        const entry = pollElements.get(pollId);
        if (!entry) return;
        options.forEach((option, index) => {
            const button = entry.buttons[index];
            if (!button) return;
            const count = button.querySelector('.poll-option-count');
            if (count) count.textContent = option.count;
        });
        highlightPollSelection(pollId);
    }

    function formatTimeAgo(timestamp) {
        const now = Date.now();
        const seconds = Math.floor((now - new Date(timestamp).getTime()) / 1000);
        if (seconds < 60) return t.time_just_now || '剛剛';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}${t.time_minutes_ago || ' 分鐘前'}`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}${t.time_hours_ago || ' 小時前'}`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days}${t.time_days_ago || ' 天前'}`;
        const months = Math.floor(days / 30);
        if (months < 12) return `${months}${t.time_months_ago || ' 個月前'}`;
        const years = Math.floor(months / 12);
        return `${years}${t.time_years_ago || ' 年前'}`;
    }

    function buildChatRoomUrl(roomName) {
        const url = new URL(window.location.href);
        url.search = '';
        if (roomName) {
            url.searchParams.set('room', roomName);
        }
        return url.toString();
    }

    function persistAdminToken(roomName, token) {
        if (!roomName || !token) return;
        sessionStorage.setItem(`${ADMIN_TOKEN_STORAGE_PREFIX}${roomName}`, token);
    }

    function getPersistedAdminToken(roomName) {
        if (!roomName) return '';
        return sessionStorage.getItem(`${ADMIN_TOKEN_STORAGE_PREFIX}${roomName}`) || '';
    }

    function showAdminToken(token) {
        if (!token) return;
        adminTokenText.textContent = token;
        adminTokenBanner.classList.remove('hidden');
    }

    function hideAdminToken() {
        adminTokenBanner.classList.add('hidden');
        adminTokenText.textContent = '';
    }

    function setRoomHeading(roomName, displayName, isThread) {
        currentRoomDisplayName = displayName || roomName || '';
        roomTitle.textContent = isThread
            ? `🧵 ${activeThreadTitle || currentRoomDisplayName || roomName}`
            : (currentRoomDisplayName || roomName || (t.room_title_default || '話題標題'));
        roomSubtitle.textContent = currentRoom ? `匿名 ID：${localUserId}` : '從左側挑一個房間開始。';
        document.title = currentRoom ? `${roomTitle.textContent} | Baha-chat` : 'Baha-chat 聊天室';
    }

    function updateThreadBanner() {
        if (!activeThreadParent) {
            threadBanner.classList.add('hidden');
            threadParentName.textContent = '';
            return;
        }
        threadBanner.classList.remove('hidden');
        const room = allRooms.find((entry) => entry.name === activeThreadParent);
        threadParentName.textContent = room?.displayName || activeThreadParent;
    }

    function renderRoomList() {
        const query = (roomSearchInput.value || '').trim().toLowerCase();
        let filtered = allRooms.filter((room) => !room.isThread);

        if (query.includes('/hot')) {
            filtered.sort((left, right) => (right.userCount - left.userCount) || (right.createdAt - left.createdAt));
        } else {
            filtered.sort((left, right) => right.createdAt - left.createdAt);
        }

        const normalizedQuery = query.replace('/hot', '').trim();
        if (normalizedQuery) {
            filtered = filtered.filter((room) => {
                const displayName = (room.displayName || room.name || '').toLowerCase();
                return displayName.includes(normalizedQuery) || room.name.toLowerCase().includes(normalizedQuery);
            });
        }

        roomList.innerHTML = '';
        if (filtered.length === 0) {
            roomEmpty.classList.remove('hidden');
            return;
        }

        roomEmpty.classList.add('hidden');
        filtered.forEach((room) => {
            const item = document.createElement('li');
            item.className = 'room-card';
            if (room.name === currentRoom) {
                item.classList.add('active');
            }
            item.innerHTML = `
                <div class="room-card__name">${room.isLocked ? '🔒' : '💬'} ${escapeHTML(room.displayName || room.name)}</div>
                <div class="room-card__meta">
                    <span>👤 ${room.userCount}</span>
                    <span>${formatTimeAgo(room.createdAt)}</span>
                </div>
            `;
            item.addEventListener('click', () => {
                joinRoom(room.name);
            });
            roomList.appendChild(item);
        });
    }

    function updateReplyPreview() {
        if (!replyingTo) {
            replyPreview.classList.add('hidden');
            replyPreviewUser.textContent = '';
            replyPreviewText.textContent = '';
            return;
        }
        replyPreview.classList.remove('hidden');
        replyPreviewUser.textContent = `[${replyingTo.id}]`;
        replyPreviewUser.style.color = stringToColor(replyingTo.id);
        replyPreviewText.textContent = replyingTo.text;
    }

    function clearTypingState() {
        typingUsers.clear();
        typingThrottles.forEach((handle) => clearTimeout(handle));
        typingThrottles.clear();
        typingIndicator.classList.add('hidden');
        typingIndicator.textContent = '';
    }

    function updateTypingIndicator() {
        const firstUser = typingUsers.keys().next().value;
        if (!firstUser) {
            typingIndicator.classList.add('hidden');
            typingIndicator.textContent = '';
            return;
        }
        typingIndicator.classList.remove('hidden');
        const template = t.typing_indicator || '{id} 正在輸入...';
        typingIndicator.textContent = template.replace('{id}', `[${firstUser}]`);
    }

    function queueTypingTimeout(userId) {
        const existing = typingThrottles.get(userId);
        if (existing) clearTimeout(existing);
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

    function sendTypingStatus(flag) {
        if (!currentRoom || flag === isTyping) return;
        isTyping = flag;
        socket.emit('typing', { room: currentRoom, typing: flag });
    }

    function joinRoom(roomName, password = null, options = {}) {
        if (!roomName) return;
        pendingJoin = { roomName, password };
        if (options.parentRoom) {
            activeThreadParent = options.parentRoom;
        }
        if (options.threadTitle) {
            activeThreadTitle = options.threadTitle;
        }
        socket.emit('join room', { name: roomName, password });
    }

    function markMessageWithThread(messageId, info) {
        if (!messageId) return;
        const escapedId = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(messageId) : messageId;
        const target = messages.querySelector(`[data-mid="${escapedId}"]`);
        if (!target) return;
        applyThreadHint(target, {
            threadOpened: true,
            threadRoom: info?.threadRoom,
            threadTitle: info?.threadTitle
        });
    }

    function resetChatSurface() {
        messages.innerHTML = '';
        pollElements.clear();
        pollVotes.clear();
        replyingTo = null;
        updateReplyPreview();
        clearTypingState();
        updateEmptyState();
    }

    function tryJoinRoomFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const roomName = params.get('room');
        if (roomName) {
            joinRoom(roomName);
        }
    }

    roomSearchInput.addEventListener('input', renderRoomList);

    createRoomBtn.addEventListener('click', () => {
        const rawValue = createRoomInput.value || '';
        const trimmed = rawValue.trim();
        if (!trimmed) return;

        let roomName = trimmed;
        let password = null;
        if (trimmed.startsWith('/lock ')) {
            const parts = trimmed.split(' ');
            if (parts.length >= 3) {
                password = parts[1];
                roomName = parts.slice(2).join(' ');
            }
        }

        pendingCreatedRoom = roomName;
        socket.emit('create room', { name: roomName, password });
    });

    createRoomInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            createRoomBtn.click();
        }
    });

    markdownToggleBtn.addEventListener('click', () => {
        isMarkdownEnabled = !isMarkdownEnabled;
        updateMarkdownStatus();
    });

    composerForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const text = chatInput.value;
        if (text.trim().length === 0 || !currentRoom) {
            sendTypingStatus(false);
            return;
        }

        if (text.trim() === '/md') {
            isMarkdownEnabled = !isMarkdownEnabled;
            updateMarkdownStatus();
            chatInput.value = '';
            chatInput.style.height = 'auto';
            sendTypingStatus(false);
            return;
        }

        socket.emit('chat message', {
            room: currentRoom,
            text,
            useMarkdown: isMarkdownEnabled,
            replyTo: replyingTo
        });
        chatInput.value = '';
        chatInput.style.height = 'auto';
        replyingTo = null;
        updateReplyPreview();
        sendTypingStatus(false);
    });

    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = `${Math.min(chatInput.scrollHeight, 220)}px`;
        if (!currentRoom) return;
        if (chatInput.value.trim().length === 0) {
            sendTypingStatus(false);
            if (typingTimer) clearTimeout(typingTimer);
            return;
        }
        sendTypingStatus(true);
        if (typingTimer) clearTimeout(typingTimer);
        typingTimer = setTimeout(() => sendTypingStatus(false), TYPING_INACTIVITY_MS);
    });

    chatInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            composerForm.requestSubmit();
        }
    });

    chatInput.addEventListener('blur', () => sendTypingStatus(false));

    cancelReplyBtn.addEventListener('click', () => {
        replyingTo = null;
        updateReplyPreview();
    });

    threadBackBtn.addEventListener('click', () => {
        if (activeThreadParent) {
            joinRoom(activeThreadParent);
        }
    });

    adminTokenCopyBtn.addEventListener('click', async () => {
        const token = adminTokenText.textContent.trim();
        if (!token) return;
        try {
            await navigator.clipboard.writeText(token);
            addSystemMessage('已複製管理金鑰');
        } catch (error) {
            console.error('copy admin token failed', error);
        }
    });

    adminTokenCloseBtn.addEventListener('click', hideAdminToken);

    menuCopy.addEventListener('click', async () => {
        if (!selectedMessageText) return;
        try {
            await navigator.clipboard.writeText(selectedMessageText);
            addSystemMessage(t.system_copied || '已複製訊息文字');
        } catch (error) {
            console.error('copy message failed', error);
        }
        closeContextMenu();
    });

    menuReply.addEventListener('click', () => {
        if (!selectedMessageText || !selectedMessageId) return;
        replyingTo = { id: selectedMessageId, text: selectedMessageText };
        updateReplyPreview();
        closeContextMenu();
        chatInput.focus();
    });

    menuThread.addEventListener('click', () => {
        if (!currentRoom || !selectedMessageMid) return;
        const defaultTitle = selectedMessageText.slice(0, 60).trim() || t.thread_default_title || '新討論串';
        socket.emit('create thread', { room: currentRoom, messageId: selectedMessageMid, title: defaultTitle });
        closeContextMenu();
    });

    document.addEventListener('click', (event) => {
        if (event.target.closest('#message-context-menu')) return;
        closeContextMenu();
    });

    socket.on('connect', () => {
        updateConnectionUI(true);
        tryJoinRoomFromUrl();
    });

    socket.on('disconnect', () => {
        updateConnectionUI(false);
    });

    socket.on('room list', (rooms) => {
        allRooms = Array.isArray(rooms) ? rooms : [];
        renderRoomList();
        updateThreadBanner();
    });

    socket.on('room admin token', (payload) => {
        if (!payload?.room || !payload?.token) return;
        persistAdminToken(payload.room, payload.token);
        if (payload.room === currentRoom) {
            showAdminToken(payload.token);
        }
        if (pendingCreatedRoom && payload.room === pendingCreatedRoom) {
            createRoomInput.value = '';
            pendingCreatedRoom = '';
            joinRoom(payload.room);
        }
    });

    socket.on('room create error', (errorKey) => {
        pendingCreatedRoom = '';
        alert(t[errorKey] || '建立房間失敗');
    });

    socket.on('join success', (roomInfo) => {
        currentRoom = roomInfo?.name || '';
        const isThread = !!roomInfo?.isThread;
        activeThreadParent = isThread ? (roomInfo.parentRoom || activeThreadParent) : null;
        activeThreadTitle = isThread ? (roomInfo.threadTitle || activeThreadTitle) : '';
        setRoomHeading(currentRoom, roomInfo?.displayName || currentRoom, isThread);
        updateThreadBanner();
        history.replaceState(null, '', buildChatRoomUrl(currentRoom));
        const storedToken = getPersistedAdminToken(currentRoom);
        if (storedToken) {
            showAdminToken(storedToken);
        } else {
            hideAdminToken();
        }
        renderRoomList();
    });

    socket.on('join error', (errorKey) => {
        if (errorKey === 'wrong_password' && pendingJoin?.roomName) {
            const password = prompt(t.prompt_password || '此房間已上鎖，請輸入密碼：');
            if (password) {
                joinRoom(pendingJoin.roomName, password);
            }
            return;
        }
        alert(t[errorKey] || '加入房間失敗');
    });

    socket.on('chat history', (history) => {
        messages.innerHTML = '';
        pollElements.clear();
        pollVotes.clear();
        addMessageBatch(Array.isArray(history) ? history : []);
    });

    socket.on('chat message', (data) => {
        addMessage(data);
    });

    socket.on('chat message updated', (data) => {
        if (!data?.mid || data.room !== currentRoom || !data.linkPreview) return;
        const escapedId = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(data.mid) : data.mid;
        const target = messages.querySelector(`[data-mid="${escapedId}"]`);
        if (!target) return;
        appendLinkPreview(target, data.linkPreview);
    });

    socket.on('thread ready', (payload) => {
        if (!payload?.room) return;
        activeThreadParent = payload.parentRoom || currentRoom;
        activeThreadTitle = payload.displayName || '';
        joinRoom(payload.room);
    });

    socket.on('thread status', (payload) => {
        if (!payload?.parentMessageId) return;
        markMessageWithThread(payload.parentMessageId, payload);
    });

    socket.on('typing status', (data) => {
        if (!data) return;
        handleIncomingTyping(data.userId, data.typing);
    });

    socket.on('poll update', (update) => {
        if (!update) return;
        updatePollUI(update.pollId, update.options || []);
    });

    socket.on('room cleared', (payload) => {
        if (!payload?.room || payload.room !== currentRoom) return;
        messages.innerHTML = '';
        addSystemMessage(t.room_cleared || '本房聊天紀錄已清空。');
    });

    socket.on('room deleted', (payload) => {
        if (!payload?.room || payload.room !== currentRoom) return;
        currentRoom = '';
        activeThreadParent = null;
        activeThreadTitle = '';
        setRoomHeading('', '', false);
        resetChatSurface();
        updateThreadBanner();
        history.replaceState(null, '', buildChatRoomUrl(''));
        addSystemMessage(t.room_deleted || '房間已被刪除。');
        renderRoomList();
    });

    socket.on('room renamed', (payload) => {
        if (!payload?.room || payload.room !== currentRoom) return;
        setRoomHeading(currentRoom, payload.displayName || payload.room, false);
        addSystemMessage((t.room_renamed || '房間名稱已更新為 {name}。').replace('{name}', payload.displayName || payload.room));
    });

    socket.on('kicked', ({ room }) => {
        if (!room || room !== currentRoom) return;
        addSystemMessage(`⚠️ 你已被踢出 ${room}`);
        currentRoom = '';
        activeThreadParent = null;
        activeThreadTitle = '';
        setRoomHeading('', '', false);
        resetChatSurface();
        updateThreadBanner();
        history.replaceState(null, '', buildChatRoomUrl(''));
        renderRoomList();
    });

    initializeMarkdown();
    applyTranslations();
    updateMarkdownStatus();
    updateConnectionUI(socket.connected);
    updateBackLink();
    setRuntimeHint();
    setRoomHeading('', '', false);
    updateReplyPreview();
    updateThreadBanner();
    updateEmptyState();
}());
