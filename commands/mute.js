module.exports = {
    name: 'mute',
    description: '禁止該使用者在本房間發言（需管理權）',
    adminOnly: true,
    async execute(socket, args, data) {
        const room = data?.room;
        if (!room) {
            socket.emit('chat message', { id: 'System', text: '❌ 請先進入房間再使用 /mute。', timestamp: Date.now() });
            return;
        }

        const parts = args.split(/\s+/).filter(Boolean);
        const target = parts[0];
        const durationMinutes = Math.max(1, Math.min(60, parseInt(parts[1], 10) || 5));

        if (!target) {
            socket.emit('chat message', { id: 'System', text: '❌ 用法：/mute <使用者 ID> [分鐘]', timestamp: Date.now() });
            return;
        }

        const targetSocket = [...socket.server.sockets.sockets.values()].find(sock => sock.userId === target && sock.rooms.has(room));
        if (!targetSocket) {
            socket.emit('chat message', { id: 'System', text: `❌ 找不到 [${target}] 或該使用者不在本房。`, timestamp: Date.now() });
            return;
        }

        const muteUntil = Date.now() + durationMinutes * 60 * 1000;
        targetSocket.mutedRooms.set(room, muteUntil);
        targetSocket.emit('chat message', { id: 'System', text: `⚠️ 你已被管理員在 ${room} 禁言 ${durationMinutes} 分鐘。`, timestamp: Date.now() });
        socket.server.to(room).emit('chat message', { id: 'System', text: `🧵 [${target}] 已被禁言 ${durationMinutes} 分鐘。`, timestamp: Date.now() });
    }
};
