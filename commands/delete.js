const Room = require('../models/Room');
const Message = require('../models/Message');
const { getSortedRoomList } = require('../utils/room-list');

module.exports = {
    name: 'delete',
    description: '刪除房間並清空所有資料（需管理權）',
    adminOnly: true,
    async execute(socket, args, data) {
        const roomName = data?.room;
        if (!roomName) {
            socket.emit('chat message', { id: 'System', text: '❌ 請先進入房間再使用 /delete。', timestamp: Date.now() });
            return;
        }

        if (roomName === '綜合閒聊') {
            socket.emit('chat message', { id: 'System', text: '❌ 綜合閒聊無法被刪除。', timestamp: Date.now() });
            return;
        }

        const room = await Room.findOne({ name: roomName });
        if (!room) {
            socket.emit('chat message', { id: 'System', text: '❌ 找不到該房間。', timestamp: Date.now() });
            return;
        }

        await Promise.all([
            Message.deleteMany({ roomName }),
            Room.deleteOne({ name: roomName })
        ]);

        const roomSockets = socket.server.sockets.adapter.rooms.get(roomName);
        if (roomSockets) {
            for (const socketId of roomSockets) {
                const target = socket.server.sockets.sockets.get(socketId);
                if (target) {
                    target.leave(roomName);
                    target.emit('room deleted', { room: roomName });
                }
            }
        }

        socket.server.emit('room list', await getSortedRoomList(socket.server));
    }
};
