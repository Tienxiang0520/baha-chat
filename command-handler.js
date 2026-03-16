const fs = require('fs');
const path = require('path');

// 使用 Map 來儲存指令，方便快速查找
const commands = new Map();
// 讀取 'commands' 資料夾下的所有 .js 檔案
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    try {
        const command = require(path.join(__dirname, 'commands', file));
        // 檢查指令檔是否符合基本格式
        if (command.name && command.execute) {
            commands.set(command.name, command);
        } else {
            console.warn(`⚠️ 指令檔案 ${file} 格式不符 (缺少 name 或 execute 屬性)，已略過載入。`);
        }
    } catch (error) {
        console.error(`❌ 載入指令檔案 ${file} 時發生錯誤:`, error);
    }
}

console.log(`✅ 已成功載入 ${commands.size} 個指令。`);

/**
 * 處理傳入的訊息文字，判斷是否為指令並執行
 * @param {import('socket.io').Socket} socket - 使用者的 socket 物件
 * @param {string} text - 原始訊息文字
 * @returns {Promise<boolean>} - 回傳是否為一個已處理的指令
 */
async function handleCommand(socket, text) {
    if (!text.startsWith('/')) return false;

    const args = text.slice(1).split(/ +/);
    const commandName = args.shift().toLowerCase();
    const command = commands.get(commandName);

    if (!command) return false;

    if (command.adminOnly && !socket.isAdmin) {
        socket.emit('chat message', { id: 'System', text: '❌ 您沒有管理員權限！請先登入。', timestamp: Date.now() });
        return true;
    }

    try {
        await command.execute(socket, args.join(' '));
    } catch (error) {
        console.error(`執行指令 "${commandName}" 時發生錯誤:`, error);
        socket.emit('chat message', { id: 'System', text: `❌ 執行指令時發生內部錯誤。`, timestamp: Date.now() });
    }

    return true;
}

module.exports = { handleCommand };