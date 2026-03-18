const Room = require('../models/Room');
const { getSortedRoomList } = require('../utils/room-list');

module.exports = {
    name: 'rename',
    description: '更改房間顯示名稱（需管理權）',
    adminOnly: true,
    async execute(socket, args, data) {
        const roomName = data?.room;
        if (!roomName) {
            socket.emit('chat message', { id: 'System', text: '❌ 請先進入房間再使用 /rename。', timestamp: Date.now() });
            return;
        }

        const newDisplayName = args.trim();
        if (!newDisplayName) {
            socket.emit('chat message', { id: 'System', text: '❌ 用法：/rename <新名稱>', timestamp: Date.now() });
            return;
        }

        const room = await Room.findOne({ name: roomName });
        if (!room) {
            socket.emit('chat message', { id: 'System', text: '❌ 找不到該房間。', timestamp: Date.now() });
            return;
        }

        if ((room.displayName || room.name) === newDisplayName) {
            socket.emit('chat message', { id: 'System', text: '❌ 房間名稱沒有變更。', timestamp: Date.now() });
            return;
        }

        room.displayName = newDisplayName;
        await room.save();

        const payload = { id: 'System', text: `✏️ 房間名稱已更新為 ${newDisplayName}。`, timestamp: Date.now() };
        socket.server.to(roomName).emit('chat message', payload);
        socket.server.emit('room list', await getSortedRoomList(socket.server));
        socket.server.to(roomName).emit('room renamed', { room: roomName, displayName: newDisplayName });
    }
};
