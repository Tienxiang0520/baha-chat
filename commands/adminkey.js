const bcrypt = require('bcrypt');
const crypto = require('crypto');
const Room = require('../models/Room');

module.exports = {
    name: 'adminkey',
    description: '重新產生或查詢房主的管理金鑰',
    adminOnly: false,
    async execute(socket, args, data) {
        const roomName = data?.room;
        if (!roomName) {
            socket.emit('chat message', { id: 'System', text: '❌ 進入房間後才能查詢金鑰。', timestamp: Date.now() });
            return;
        }

        const room = await Room.findOne({ name: roomName });
        if (!room) {
            socket.emit('chat message', { id: 'System', text: '❌ 找不到這個房間，請重新加入。', timestamp: Date.now() });
            return;
        }

        if (room.creatorId !== socket.userId) {
            socket.emit('chat message', { id: 'System', text: '❌ 只有該房間建立者才有權查詢金鑰。', timestamp: Date.now() });
            return;
        }

        const newToken = `Baha-Admin-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        room.adminTokenHash = await bcrypt.hash(newToken, 10);
        await room.save();

        socket.adminRooms = socket.adminRooms || new Set();
        socket.adminRooms.add(roomName);

        socket.emit('room admin token', { room: roomName, token: newToken });
        socket.emit('chat message', { id: 'System', text: '🔑 已重新產生管理金鑰並送出，請妥善保存。', timestamp: Date.now() });
    }
};
