const fs = require('fs');
const path = require('path');
const Room = require('./models/Room');

// 使用 Map 來儲存指令，方便快速查找
const commands = new Map();
const commandsPath = path.join(__dirname, 'commands');

// 確保 commands 資料夾存在，若無則自動建立避免報錯
if (!fs.existsSync(commandsPath)) {
    fs.mkdirSync(commandsPath);
    console.log('📂 已自動建立 commands 資料夾，請記得將指令檔案放入此資料夾中！');
}

// 讀取 'commands' 資料夾下的所有 .js 檔案
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

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
 * @param {object|string} data - 原始訊息資料物件或文字
 * @returns {Promise<boolean>} - 回傳是否為一個已處理的指令
 */
async function handleCommand(socket, data) {
    const text = typeof data === 'string' ? data : data.text;

    if (!text.startsWith('/')) return false;

    const args = text.slice(1).split(/ +/);
    const commandName = args.shift().toLowerCase();
    const command = commands.get(commandName);

    if (!command) return false;

    const roomName = data?.room;
    if (command.adminOnly) {
        if (!roomName) {
            socket.emit('chat message', { id: 'System', text: '❌ 這個指令只能在房間內由房主使用。', timestamp: Date.now() });
            return true;
        }

        const room = await Room.findOne({ name: roomName }).select('creatorId');
        if (!room || room.creatorId !== socket.userId) {
            socket.emit('chat message', {
                id: 'System',
                text: '❌ 只有這個房間的建立者才能使用此管理指令。',
                timestamp: Date.now()
            });
            return true;
        }
    }

    try {
        // 將 data 作為第三個參數傳給 execute，讓指令能取得房間資訊
        await command.execute(socket, args.join(' '), data);
    } catch (error) {
        console.error(`執行指令 "${commandName}" 時發生錯誤:`, error);
        socket.emit('chat message', { id: 'System', text: `❌ 執行指令時發生內部錯誤。`, timestamp: Date.now() });
    }

    return true;
}

module.exports = { handleCommand };
