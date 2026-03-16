module.exports = {
    name: 'logout',
    description: '登出管理員身份。',
    adminOnly: true, // 只有管理員能執行此指令
    async execute(socket, args) {
        socket.isAdmin = false;
        socket.emit('chat message', { id: 'System', text: '👋 您已登出管理員身份。', timestamp: Date.now() });
    }
};