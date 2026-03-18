const bcrypt = require('bcrypt');
const Room = require('../models/Room');

module.exports = {
    name: 'auth',
    description: '使用房間管理金鑰取得臨時管理權',
    adminOnly: false,
    async execute(socket, args, data) {
        const roomName = data?.room;
        if (!roomName) {
            socket.emit('chat message', { id: 'System', text: '❌ 請先進入房間後再使用 /auth 指令。', timestamp: Date.now() });
            return;
        }

        const inputToken = args.trim();
        if (!inputToken) {
            socket.emit('chat message', { id: 'System', text: '❌ 請提供管理金鑰：/auth <金鑰>', timestamp: Date.now() });
            return;
        }

        const room = await Room.findOne({ name: roomName });
        if (!room || !room.adminTokenHash) {
            socket.emit('chat message', { id: 'System', text: '❌ 該房間尚未啟用管理金鑰。', timestamp: Date.now() });
            return;
        }

        const isMatch = await bcrypt.compare(inputToken, room.adminTokenHash);
        if (!isMatch) {
            socket.emit('chat message', { id: 'System', text: '❌ 管理金鑰錯誤。', timestamp: Date.now() });
            return;
        }

        socket.adminRooms = socket.adminRooms || new Set();
        socket.adminRooms.add(roomName);
        socket.emit('chat message', { id: 'System', text: '👑 您已取得該房間的管理權限，請合理使用。', timestamp: Date.now() });
    }
};
