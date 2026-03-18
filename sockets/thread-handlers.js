const Room = require('../models/Room');
const Message = require('../models/Message');

async function createThread(socket, io, data) {
    const roomName = data?.room;
    const messageId = data?.messageId;
    const title = (typeof data?.title === 'string' ? data.title.trim() : '').substring(0, 60);
    if (!roomName || !messageId) return;
    if (!socket.rooms.has(roomName)) return;
    const parentMessage = await Message.findById(messageId);
    if (!parentMessage) {
        socket.emit('chat message', { id: 'System', text: '❌ 找不到該訊息，無法建立討論串。', timestamp: Date.now() });
        return;
    }

    let threadRoom = await Room.findOne({ threadParentRoom: roomName, threadParentMessageId: messageId });
    if (!threadRoom) {
        const snippet = (parentMessage.text || '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Thread';
        const displayName = title || `Thread：${snippet}`;
        const threadName = `thread-${roomName}-${messageId}`;
        try {
            threadRoom = await Room.create({
                name: threadName,
                displayName,
                createdAt: Date.now(),
                isThread: true,
                threadParentRoom: roomName,
                threadParentMessageId: messageId,
                threadTitle: displayName
            });
        } catch (error) {
            console.error('建立討論串失敗：', error);
            threadRoom = await Room.findOne({ threadParentRoom: roomName, threadParentMessageId: messageId });
            if (!threadRoom) {
                const fallback = await Room.findOne({ name: threadName });
                if (fallback && fallback.isThread) {
                    threadRoom = fallback;
                }
            }
        }
    }

    if (!threadRoom) {
        socket.emit('chat message', { id: 'System', text: '❌ 無法建立討論串，請稍後再試。', timestamp: Date.now() });
        return;
    }

    if (parentMessage) {
        parentMessage.threadOpened = true;
        parentMessage.threadRoom = threadRoom.name;
        try {
            await parentMessage.save();
        } catch (error) {
            console.error('更新訊息討論串資料失敗：', error);
        }
    }

    io.to(roomName).emit('thread status', {
        parentMessageId: messageId,
        threadRoom: threadRoom.name,
        threadTitle: threadRoom.displayName
    });

    io.to(roomName).emit('chat message', {
        id: 'System',
        text: `🧵 討論串已建立：${threadRoom.displayName}`,
        timestamp: Date.now(),
        threadLink: { room: threadRoom.name, displayName: threadRoom.displayName }
    });

    socket.emit('thread ready', {
        room: threadRoom.name,
        displayName: threadRoom.displayName,
        parentRoom: roomName
    });
}

function registerThreadHandlers(socket, io) {
    socket.on('create thread', data => createThread(socket, io, data));
}

module.exports = { registerThreadHandlers };
