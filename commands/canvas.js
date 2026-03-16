const Message = require('../models/Message');

module.exports = {
    name: 'canvas',
    description: '建立共用畫布',
    adminOnly: false,
    async execute(socket, args, data) {
        if (!data.room) return;

        const generateRandomString = (length) => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
            let result = '';
            for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
            return result;
        };
        
        const url = `https://excalidraw.com/#room=${generateRandomString(20)},${generateRandomString(22)}`;
        const emitText = `🖍️ 一起畫畫吧：\n${url}`;
        const userId = socket.id.substring(0, 6);
        
        const messageData = {
            id: userId,
            text: emitText,
            i18nKey: 'canvas_prompt', // 畫布提示文字
            extraText: `\n${url}`, // 將產生的網址自動換行接在後面
            timestamp: Date.now(),
            useMarkdown: data.useMarkdown !== false,
            replyTo: data.replyTo
        };
        await Message.create({ roomName: data.room, ...messageData });
        socket.server.to(data.room).emit('chat message', messageData);
    }
};