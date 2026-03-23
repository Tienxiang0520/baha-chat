const Message = require('../models/Message');
const Room = require('../models/Room');
const { getPoll, votePoll } = require('../polls');

function registerChatHandlers(socket, io, fetchLinkPreview, handleCommand) {
    socket.on('chat message', async (data) => {
        const { room, text, useMarkdown, replyTo, effect } = data;
        if (room && !socket.rooms.has(room)) return;

        if (room) {
            const muteUntil = socket.mutedRooms.get(room);
            if (muteUntil && muteUntil > Date.now()) {
                socket.emit('chat message', { id: 'System', text: '❌ 你已被該房間管理員禁言，無法發送訊息。', timestamp: Date.now() });
                return;
            }
            if (muteUntil) {
                socket.mutedRooms.delete(room);
            }
        }

        const wasCommand = await handleCommand(socket, data);
        if (wasCommand) {
            return;
        }

        const timestamp = Date.now();
        const displayName = socket.displayName || '';
        const normalizedReplyTo = replyTo ? {
            id: replyTo.id,
            displayName: typeof replyTo.displayName === 'string' ? replyTo.displayName : '',
            text: replyTo.text
        } : undefined;
        const messageData = {
            id: socket.userId,
            displayName,
            text,
            timestamp,
            useMarkdown,
            replyTo: normalizedReplyTo,
            effect,
            linkPreview: null
        };

        const existingRoom = await Room.findOne({ name: room });
        if (existingRoom) {
            try {
                const messageRecord = await Message.create({ roomName: room, ...messageData });
                const outgoing = { ...messageData, mid: messageRecord._id.toString() };
                io.to(room).emit('chat message', outgoing);

                if (typeof fetchLinkPreview === 'function' && text) {
                    setImmediate(async () => {
                        try {
                            const preview = await fetchLinkPreview(text);
                            if (!preview) return;
                            await Message.updateOne(
                                { _id: messageRecord._id },
                                { $set: { linkPreview: preview } }
                            );
                            io.to(room).emit('chat message updated', {
                                room,
                                mid: messageRecord._id.toString(),
                                linkPreview: preview
                            });
                        } catch (previewError) {
                            console.error('背景連結預覽更新失敗:', previewError);
                        }
                    });
                }
            } catch (err) {
                console.error('儲存訊息發生錯誤:', err);
                socket.emit('chat message', { id: 'System', text: '❌ 系統錯誤，訊息傳送失敗。', timestamp: Date.now() });
            }
        }
    });

    socket.on('typing', (data) => {
        const { room, typing } = data || {};
        if (!room) return;
        if (!socket.rooms.has(room)) return;
        socket.to(room).emit('typing status', {
            userId: socket.userId,
            displayName: socket.displayName || '',
            typing: !!typing
        });
    });

    socket.on('poll vote', (data) => {
        const { pollId, optionIndex } = data || {};
        if (!pollId || typeof optionIndex !== 'number') return;
        const poll = getPoll(pollId);
        if (!poll || !poll.room || !socket.rooms.has(poll.room)) return;

        const updatedPoll = votePoll(pollId, socket.userId, optionIndex);
        if (!updatedPoll) return;

        Message.updateOne(
            { 'poll.id': updatedPoll.id },
            {
                $set: {
                    'poll.options': updatedPoll.options.map(option => ({
                        text: option.text,
                        count: option.count
                    }))
                }
            }
        ).catch((error) => {
            console.error('更新投票歷史紀錄失敗:', error);
        });

        socket.server.to(poll.room).emit('poll update', {
            pollId: updatedPoll.id,
            options: updatedPoll.options.map(option => ({ text: option.text, count: option.count }))
        });
    });

}

module.exports = { registerChatHandlers };
