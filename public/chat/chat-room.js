function joinThreadRoom(roomName, parentRoomName = null) {
    if (!roomName) return;
    if (parentRoomName) {
        activeThreadParent = parentRoomName;
    } else if (!activeThreadParent) {
        activeThreadParent = currentRoom;
    }
    socket.emit('join room', { name: roomName });
}

function buildStandaloneChatRoomUrl(roomName) {
    const baseOrigin = window.location.origin || 'http://localhost:3000';
    const url = new URL('/react-chat/', baseOrigin);
    if (roomName) {
        url.searchParams.set('room', roomName);
    }
    return url.toString();
}

window.unlockMessage = function(btnElement, correctPassword, encodedContent) {
    const container = btnElement.closest('.locked-message-container');
    const input = container.querySelector('.unlock-input');
    
    if (input.value === correctPassword) {
        const decodedContent = decodeURIComponent(encodedContent);
        container.innerHTML = `<div class="unlocked-content">🔓 ${decodedContent.replace(/\n/g, '<br>')}</div>`;
    } else {
        input.value = '';
        input.placeholder = t.locked_wrong;
    }
};

function buildMessageElement(data) {
    const item = document.createElement('li');
    const messageId = data.mid || data._id || '';
    if (messageId) {
        item.dataset.mid = messageId;
    }
    const isMyMessage = data.id === localUserId;

    if (isMyMessage) {
        item.classList.add('my-message');
        item.style.alignSelf = 'flex-end';
        item.style.marginLeft = 'auto';
        item.style.marginRight = '0';
    } else {
        item.style.alignSelf = 'flex-start';
        item.style.marginLeft = '0';
        item.style.marginRight = 'auto';
    }

    if (data.replyTo) {
        const replyDiv = document.createElement('div');
        replyDiv.className = 'replied-message';
        replyDiv.textContent = `${t.replied_message_prefix} [${data.replyTo.id}]: ${data.replyTo.text}`;
        item.appendChild(replyDiv);
    }

    if (!isMyMessage) {
        const idSpan = document.createElement('span');
        idSpan.className = 'user-id';
        idSpan.textContent = `[${data.id}] `;
        idSpan.style.color = stringToColor(data.id);
        item.appendChild(idSpan);
    }

    const textSpan = document.createElement('span');
    const applyMarkdown = data.useMarkdown !== false;
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

    if (data.timestamp) {
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        const date = new Date(data.timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        timeSpan.textContent = ` ${hours}:${minutes}`;
        item.appendChild(timeSpan);
    }

    let pressTimer;
    const showMenu = (x, y) => {
        closeContextMenu();
        selectedMessageText = data.text;
        selectedMessageId = data.id;
        selectedMessageMid = data.mid || null;
        selectedMessageElement = item;
        item.classList.add('selected-message');

        contextMenu.classList.remove('hidden');
        const menuWidth = contextMenu.offsetWidth;
        const menuHeight = contextMenu.offsetHeight;
        const menuX = (x + menuWidth > window.innerWidth) ? window.innerWidth - menuWidth - 10 : x;
        const menuY = (y + menuHeight > window.innerHeight) ? window.innerHeight - menuHeight - 10 : y;

        contextMenu.style.left = `${menuX}px`;
        contextMenu.style.top = `${menuY}px`;
    };

    item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showMenu(e.clientX, e.clientY);
    });

    item.addEventListener('touchstart', (e) => {
        pressTimer = setTimeout(() => {
            showMenu(e.touches[0].clientX, e.touches[0].clientY);
        }, 500);
    });
    item.addEventListener('touchend', () => clearTimeout(pressTimer));
    item.addEventListener('touchmove', () => clearTimeout(pressTimer));

    return item;
}

function addMessage(data, skipScroll = false) {
    const item = buildMessageElement(data);
    messages.appendChild(item);
    if (!skipScroll) {
        scheduleMessageScroll();
    }
}

function addMessageBatch(history) {
    if (!Array.isArray(history) || history.length === 0) return;
    const fragment = document.createDocumentFragment();
    history.forEach(data => {
        fragment.appendChild(buildMessageElement(data));
    });
    messages.appendChild(fragment);
    scheduleMessageScroll();
}

function createDanmaku(data) {
    const span = document.createElement('span');
    span.className = 'danmaku-msg';
    span.textContent = data.text;

    const top = Math.floor(Math.random() * 70) + 10;
    span.style.top = `${top}%`;
    span.style.color = stringToColor(data.id);

    danmakuContainer.appendChild(span);
    setTimeout(() => span.remove(), 4000);
}

function formatTimeAgo(timestamp) {
    const now = new Date();
    const seconds = Math.floor((now - new Date(timestamp)) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + t.time_years_ago;
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + t.time_months_ago;
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + t.time_days_ago;
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + t.time_hours_ago;
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + t.time_minutes_ago;
    return t.time_just_now;
}

function attemptRoomCreation(rawValue, sourceInput) {
    const trimmed = rawValue?.trim() || '';
    if (trimmed.length === 0) {
        return false;
    }
    let roomName = trimmed;
    let password = null;

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
        window.location.href = buildStandaloneChatRoomUrl(room.name);
    });
    return li;
}

function renderRoomList() {
    let searchTerm = searchInput.value.toLowerCase().trim();
    const primaryLists = [roomList];
    if (chatRoomList) {
        primaryLists.push(chatRoomList);
    }
    primaryLists.forEach(list => list.innerHTML = '');
    if (boardRoomListElement) {
        boardRoomListElement.innerHTML = '';
    }

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
        primaryLists.forEach(list => list.appendChild(createRoomListItem(room)));
    });

    const boardPageSize = getBoardRoomPageSize();
    if (boardRoomListElement) {
        const maxPage = clampBoardRoomPage(filteredRooms.length);
        const shouldPaginate = !isDesktopBoardActive() && filteredRooms.length > boardPageSize;
        const startIndex = shouldPaginate ? boardRoomListPage * boardPageSize : 0;
        const roomsForBoard = shouldPaginate
            ? filteredRooms.slice(startIndex, startIndex + boardPageSize)
            : filteredRooms;
        roomsForBoard.forEach(room => {
            boardRoomListElement.appendChild(createRoomListItem(room));
        });
        updateBoardRoomPager(filteredRooms.length);
        if (!shouldPaginate && maxPage > 0) {
            boardRoomListPage = 0;
        }
    } else if (boardRoomListPagerElement) {
        updateBoardRoomPager(filteredRooms.length);
    }
}

function scheduleRoomListRender() {
    if (roomListRenderScheduled) return;
    roomListRenderScheduled = true;
    requestAnimationFrame(() => {
        renderRoomList();
        roomListRenderScheduled = false;
    });
}
