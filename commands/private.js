const bcrypt = require('bcrypt');
const Room = require('../models/Room');
const { getSortedRoomList } = require('../utils/room-list');

module.exports = {
    name: 'private',
    description: '為房間設定密碼鎖（需管理權）',
    adminOnly: true,
    async execute(socket, args, data) {
        const roomName = data?.room;
        const password = args.trim();

        if (!roomName) {
            socket.emit('chat message', { id: 'System', text: '❌ 請先進入房間再使用 /private。', timestamp: Date.now() });
            return;
        }

        if (!password) {
            socket.emit('chat message', { id: 'System', text: '❌ 用法：/private <密碼>', timestamp: Date.now() });
            return;
        }

        const room = await Room.findOne({ name: roomName });
        if (!room) {
            socket.emit('chat message', { id: 'System', text: '❌ 找不到該房間。', timestamp: Date.now() });
            return;
        }

        room.isLocked = true;
        room.password = await bcrypt.hash(password, 10);
        await room.save();

        const payload = { id: 'System', text: '🔒 房間已更新為密碼保護，請妥善分享密碼。', timestamp: Date.now() };
        socket.server.to(roomName).emit('chat message', payload);
        socket.server.emit('room list', await getSortedRoomList(socket.server));
    }
};
