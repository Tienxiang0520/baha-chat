const Room = require('../models/Room');
const { getSortedRoomList } = require('../utils/room-list');

module.exports = {
    name: 'public',
    description: '將房間切換為公開狀態（需管理權）',
    adminOnly: true,
    async execute(socket, args, data) {
        const roomName = data?.room;
        if (!roomName) {
            socket.emit('chat message', { id: 'System', text: '❌ 請先進入房間再使用 /public。', timestamp: Date.now() });
            return;
        }

        const room = await Room.findOne({ name: roomName });
        if (!room) {
            socket.emit('chat message', { id: 'System', text: '❌ 找不到該房間。', timestamp: Date.now() });
            return;
        }

        if (!room.isLocked) {
            socket.emit('chat message', { id: 'System', text: '❌ 房間已經是公開的。', timestamp: Date.now() });
            return;
        }

        room.isLocked = false;
        room.password = null;
        await room.save();

        const payload = { id: 'System', text: '🟢 房間已切換為公開，任何人都可直接進入。', timestamp: Date.now() };
        socket.server.to(roomName).emit('chat message', payload);
        socket.server.emit('room list', await getSortedRoomList(socket.server));
    }
};
