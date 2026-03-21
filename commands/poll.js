const { createPoll } = require('../polls');
const Message = require('../models/Message');

module.exports = {
    name: 'poll',
    description: '發起房間投票',
    adminOnly: false,
    async execute(socket, args, data) {
        const room = data?.room;
        if (!room) {
            socket.emit('chat message', { id: 'System', text: '❌ 請先進入房間後再建立投票。', timestamp: Date.now() });
            return;
        }

        const parts = args.split('|').map(part => part.trim()).filter(Boolean);
        if (parts.length < 3) {
            socket.emit('chat message', { id: 'System', text: '❌ 用法錯誤：/poll 問題 | 選項一 | 選項二 [...更多選項]', timestamp: Date.now() });
            return;
        }

        const question = parts[0];
        const options = parts.slice(1);

        const poll = createPoll({
            question,
            options,
            room,
            createdBy: socket.userId
        });

        const messageData = {
            id: 'System',
            text: `📊 投票：${question}`,
            timestamp: Date.now(),
            useMarkdown: false,
            poll: {
                id: poll.id,
                question: poll.question,
                options: poll.options.map(option => ({ text: option.text, count: option.count }))
            }
        };

        try {
            const messageRecord = await Message.create({
                roomName: room,
                ...messageData
            });

            socket.server.to(room).emit('chat message', {
                ...messageData,
                mid: messageRecord._id.toString()
            });
        } catch (error) {
            console.error('儲存投票訊息失敗:', error);
            socket.emit('chat message', {
                id: 'System',
                text: '❌ 投票建立成功，但儲存歷史紀錄失敗。',
                timestamp: Date.now()
            });
            socket.server.to(room).emit('chat message', messageData);
        }
    }
};
