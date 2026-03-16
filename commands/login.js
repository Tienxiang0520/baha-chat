const bcrypt = require('bcrypt');
const { MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MS } = require('../config');

module.exports = {
    name: 'login',
    description: '以管理員身份登入。',
    adminOnly: false, // 這個指令本身不需要管理員權限
    async execute(socket, args) {
        // 速率限制：檢查是否處於鎖定狀態
        if (socket.lockoutUntil && Date.now() < socket.lockoutUntil) {
            const remainingSeconds = Math.ceil((socket.lockoutUntil - Date.now()) / 1000);
            socket.emit('chat message', { id: 'System', text: `❌ 登入失敗次數過多，請在 ${remainingSeconds} 秒後再試。`, timestamp: Date.now() });
            return;
        }

        const inputPassword = args.trim();
        if (!inputPassword) {
            socket.emit('chat message', { id: 'System', text: '❌ 用法錯誤。請輸入: /login <密碼>', timestamp: Date.now() });
            return;
        }

        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
        if (!adminPasswordHash) {
            socket.emit('chat message', { id: 'System', text: '❌ 伺服器未設定管理員密碼。', timestamp: Date.now() });
            return;
        }

        const isMatch = await bcrypt.compare(inputPassword, adminPasswordHash);
        if (isMatch) {
            socket.isAdmin = true;
            socket.loginAttempts = 0; // 登入成功，重置計數器
            socket.lockoutUntil = null;
            socket.emit('chat message', { id: 'System', text: '👑 歡迎回來，管理員！您現在可以使用 /announce 和 /logout 指令。', timestamp: Date.now() });
        } else {
            socket.loginAttempts++; // 登入失敗，增加計數
            const remainingAttempts = MAX_LOGIN_ATTEMPTS - socket.loginAttempts;
            const lockoutMinutes = Math.ceil(LOCKOUT_DURATION_MS / 60000);
            
            if (remainingAttempts > 0) {
                socket.emit('chat message', { id: 'System', text: `❌ 密碼錯誤！您還有 ${remainingAttempts} 次嘗試機會。`, timestamp: Date.now() });
            } else {
                socket.lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
                socket.emit('chat message', { id: 'System', text: `❌ 密碼錯誤！由於失敗次數過多，帳號已暫時鎖定 ${lockoutMinutes} 分鐘。`, timestamp: Date.now() });
            }
        }
    }
};