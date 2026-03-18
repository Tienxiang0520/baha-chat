module.exports = {
    name: 'kick',
    description: '踢出房間中的匿名訪客（需管理權）',
    adminOnly: true,
    async execute(socket, args, data) {
        const room = data?.room;
        const target = args?.trim();
        if (!room) {
            socket.emit('chat message', { id: 'System', text: '❌ 請先進入房間再使用 /kick。', timestamp: Date.now() });
            return;
        }
        if (!target) {
            socket.emit('chat message', { id: 'System', text: '❌ 用法：/kick <使用者 ID>', timestamp: Date.now() });
            return;
        }

        const targetSocket = [...socket.server.sockets.sockets.values()].find(sock => sock.userId === target && sock.rooms.has(room));
        if (!targetSocket) {
            socket.emit('chat message', { id: 'System', text: `❌ 找不到 [${target}] 或該使用者不在本房。`, timestamp: Date.now() });
            return;
        }

        targetSocket.leave(room);
        targetSocket.emit('chat message', { id: 'System', text: `❌ 你已被管理員從 ${room} 踢出。`, timestamp: Date.now() });
        targetSocket.emit('kicked', { room });
        socket.server.to(room).emit('chat message', { id: 'System', text: `⚠️ [${target}] 已被踢出房間。`, timestamp: Date.now() });
    }
};
