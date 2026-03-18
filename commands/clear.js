const Message = require('../models/Message');

module.exports = {
    name: 'clear',
    description: '清空房間內所有聊天紀錄（需管理權）',
    adminOnly: true,
    async execute(socket, args, data) {
        const roomName = data?.room;
        if (!roomName) {
            socket.emit('chat message', { id: 'System', text: '❌ 請先進入房間再使用 /clear。', timestamp: Date.now() });
            return;
        }

        await Message.deleteMany({ roomName });
        socket.server.to(roomName).emit('room cleared', { room: roomName });
        socket.server.to(roomName).emit('chat message', { id: 'System', text: '🧹 歷史訊息已被清空，歡迎重新開始。', timestamp: Date.now() });
    }
};
