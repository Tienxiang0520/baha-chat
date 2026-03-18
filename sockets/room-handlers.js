const bcrypt = require('bcrypt');
const crypto = require('crypto');
const Room = require('../models/Room');
const Message = require('../models/Message');
const { LOAD_HISTORY_LIMIT } = require('../config');
const { getSortedRoomList } = require('../utils/room-list');

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
        const adminToken = `Baha-Admin-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const adminTokenHash = await bcrypt.hash(adminToken, 10);
        await Room.create({
            name: roomName,
            displayName: roomName,
            createdAt: Date.now(),
            isLocked: !!password,
            password: hashedPassword,
            creatorId: socket.userId,
            adminTokenHash
        });
        socket.adminRooms.add(roomName);
        socket.emit('room admin token', { room: roomName, token: adminToken });
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
    messages = messages.reverse().map(msg => {
        const converted = msg.toObject ? msg.toObject() : msg;
        return { ...converted, mid: converted._id?.toString() };
    });
    socket.emit('chat history', messages);
    io.emit('room list', await getSortedRoomList(io));

    socket.emit('join success', {
        name: roomName,
        displayName: targetRoom?.displayName || roomName,
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
