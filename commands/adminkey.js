module.exports = {
    name: 'adminkey',
    description: '已停用：房主身份現在直接綁定匿名金鑰',
    adminOnly: false,
    async execute(socket) {
        socket.emit('chat message', {
            id: 'System',
            text: 'ℹ️ 房主權限現在直接綁定你的匿名金鑰，不再需要 /adminkey。',
            timestamp: Date.now()
        });
    }
};
