const Room = require('../models/Room');

module.exports = {
    name: 'ban',
    description: '封鎖特定匿名 ID（需管理權）',
    adminOnly: true,
    async execute(socket, args, data) {
        const roomName = data?.room;
        const targetId = args.trim();

        if (!roomName) {
            socket.emit('chat message', { id: 'System', text: '❌ 請先進入房間再使用 /ban。', timestamp: Date.now() });
            return;
        }

        if (!targetId) {
            socket.emit('chat message', { id: 'System', text: '❌ 用法：/ban <使用者 ID>', timestamp: Date.now() });
            return;
        }

        const room = await Room.findOne({ name: roomName });
        if (!room) {
            socket.emit('chat message', { id: 'System', text: '❌ 找不到該房間。', timestamp: Date.now() });
            return;
        }

        if (!room.bannedIds.includes(targetId)) {
            room.bannedIds.push(targetId);
            await room.save();
        }

        const targetSocket = [...socket.server.sockets.sockets.values()].find(sock => sock.userId === targetId && sock.rooms.has(roomName));
        if (targetSocket) {
            targetSocket.leave(roomName);
            targetSocket.emit('chat message', { id: 'System', text: '❌ 你已被本房管理員封鎖，無法再進入。', timestamp: Date.now() });
            targetSocket.emit('room deleted', { room: roomName });
        }

        socket.server.to(roomName).emit('chat message', { id: 'System', text: `🔒 [${targetId}] 已被封鎖。`, timestamp: Date.now() });
    }
};
