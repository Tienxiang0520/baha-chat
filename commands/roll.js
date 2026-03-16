const Message = require('../models/Message');

module.exports = {
    name: 'roll',
    description: '擲骰子 (1~100)',
    adminOnly: false,
    async execute(socket, args, data) {
        if (!data.room) return;

        // 伺服器端產生隨機數字，杜絕前端作弊
        const num = Math.floor(Math.random() * 100) + 1;
        const rollText = `🎲 擲出了 ${num} 點！`;
        const emitText = args ? `${rollText} (${args})` : rollText;

        const userId = socket.id.substring(0, 6);
        const messageData = {
            id: userId,
            text: emitText,
            i18nKey: 'roll_result', // 指定翻譯鍵值
            i18nArgs: { num: num }, // 帶入隨機數字變數
            extraText: args ? ` (${args})` : null, // 附加自訂文字
            timestamp: Date.now(),
            useMarkdown: data.useMarkdown !== false,
            replyTo: data.replyTo
        };

        // 儲存到資料庫並廣播給房間內所有人
        await Message.create({ roomName: data.room, ...messageData });
        socket.server.to(data.room).emit('chat message', messageData);
    }
};