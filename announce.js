const Announcement = require('../models/Announcement');

module.exports = {
    name: 'announce',
    description: '發布全站公告。',
    adminOnly: true,
    async execute(socket, args) {
        const payload = args.trim();
        const parts = payload.split('|');
        
        if (parts.length >= 2 && parts[0].trim() && parts.slice(1).join('|').trim()) {
            const title = parts[0].trim();
            const content = parts.slice(1).join('|').trim();
            
            const newAnnounce = await Announcement.create({ title, content });
            
            // 使用 socket.server (等同於 io) 來對所有人廣播
            socket.server.emit('new announcement', newAnnounce);
            socket.emit('chat message', { id: 'System', text: '✅ 公告發布成功！', timestamp: Date.now() });
        } else {
            socket.emit('chat message', { id: 'System', text: '❌ 格式錯誤。用法: /announce <標題> | <內容>', timestamp: Date.now() });
        }
    }
};