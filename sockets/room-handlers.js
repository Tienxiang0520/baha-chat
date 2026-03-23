const bcrypt = require('bcrypt');
const Room = require('../models/Room');
const Message = require('../models/Message');
const { LOAD_HISTORY_LIMIT } = require('../config');
const { getSortedRoomList } = require('../utils/room-list');

function normalizeMessageForClient(message) {
    const converted = message.toObject ? message.toObject() : { ...message };
    const normalized = { ...converted, mid: converted._id?.toString() };

    const hasValidPoll = normalized.poll
        && typeof normalized.poll.id === 'string'
        && normalized.poll.id.trim().length > 0
        && typeof normalized.poll.question === 'string'
        && normalized.poll.question.trim().length > 0
        && Array.isArray(normalized.poll.options)
        && normalized.poll.options.length > 0;

    if (!hasValidPoll) {
        delete normalized.poll;
    }

    return normalized;
}

async function createRoom(socket, io, data) {
    const roomName = typeof data === 'string' ? data : data.name;
    const password = typeof data === 'object' ? data.password : null;

    const existingRoom = await Room.findOne({ name: roomName });
    if (existingRoom) {
        socket.emit('room create error', 'room_name_taken');
        return;
    }

    try {
        let hashedPassword = null;
        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);
        }
        await Room.create({
            name: roomName,
            displayName: roomName,
            createdAt: Date.now(),
            isLocked: !!password,
            password: hashedPassword,
            creatorId: socket.userId
        });
        socket.emit('room created', { room: roomName, displayName: roomName, isOwner: true });
        io.emit('room list', await getSortedRoomList(io));
    } catch (createError) {
        console.error('建立房間失敗：', createError);
        socket.emit('room create error', 'room_create_failed');
    }
}

async function joinRoom(socket, io, data) {
    const roomName = typeof data === 'string' ? data : data.name;
    const password = typeof data === 'object' ? data.password : null;

    const targetRoom = await Room.findOne({ name: roomName });
    if (!targetRoom) {
        socket.emit('join error', 'room_not_found');
        return;
    }
    if (targetRoom.isLocked) {
        const isMatch = await bcrypt.compare(password || '', targetRoom.password);
        if (!isMatch) {
            socket.emit('join error', 'wrong_password');
            return;
        }
    }

    if (targetRoom && targetRoom.bannedIds.includes(socket.userId)) {
        socket.emit('join error', 'room_banned');
        return;
    }

    const roomsToKeep = new Set([socket.id, roomName]);
    if (targetRoom?.isThread && targetRoom.threadParentRoom) {
        roomsToKeep.add(targetRoom.threadParentRoom);
    }
    socket.rooms.forEach(room => {
        if (!roomsToKeep.has(room)) socket.leave(room);
    });

    socket.join(roomName);

    let messages = await Message.find({ roomName }).sort({ timestamp: -1 }).limit(LOAD_HISTORY_LIMIT);
    messages = messages.reverse().map(normalizeMessageForClient);
    socket.emit('chat history', messages);
    io.emit('room list', await getSortedRoomList(io));

    socket.emit('join success', {
        name: roomName,
        displayName: targetRoom?.displayName || roomName,
        isOwner: targetRoom?.creatorId === socket.userId,
        isThread: !!targetRoom?.isThread,
        parentRoom: targetRoom?.threadParentRoom || null,
        parentMessageId: targetRoom?.threadParentMessageId || null,
        threadTitle: targetRoom?.threadTitle || null
    });
}

function registerRoomHandlers(socket, io) {
    socket.on('create room', data => createRoom(socket, io, data));
    socket.on('join room', data => joinRoom(socket, io, data));
    socket.on('leave room', async (roomName) => {
        socket.leave(roomName);
        io.emit('room list', await getSortedRoomList(io));
    });
}

module.exports = { registerRoomHandlers, createRoom, joinRoom };
