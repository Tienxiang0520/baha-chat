const Message = require('../models/Message');

module.exports = {
    name: 'quake',
    description: '全螢幕震動特效',
    adminOnly: false,
    async execute(socket, args, data) {
        if (!data.room) return;

        const emitText = args || '✨ 發動了地震特效！';
        const userId = socket.id.substring(0, 6);
        
        const messageData = {
            id: userId,
            text: emitText,
            i18nKey: args ? null : 'effect_quake', // 如果有自訂文字就不翻譯，保留原樣
            timestamp: Date.now(),
            useMarkdown: data.useMarkdown !== false,
            replyTo: data.replyTo,
            effect: 'quake' // 帶上前端需要的特效標籤
        };

        await Message.create({ roomName: data.room, ...messageData });
        socket.server.to(data.room).emit('chat message', messageData);
    }
};