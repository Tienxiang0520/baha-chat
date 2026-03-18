const Room = require('../models/Room');

async function getSortedRoomList(io) {
    const dbRooms = await Room.find().sort({ createdAt: -1 }).limit(100);
    return dbRooms.map(room => {
        const roomData = io.sockets.adapter.rooms.get(room.name);
        const userCount = roomData ? roomData.size : 0;
        return {
            name: room.name,
            displayName: room.displayName || room.name,
            createdAt: room.createdAt,
            userCount,
            isLocked: !!room.isLocked,
            creatorId: room.creatorId,
            hasPassword: !!room.password,
            isThread: !!room.isThread,
            threadParentRoom: room.threadParentRoom,
            threadTitle: room.threadTitle
        };
    });
}

module.exports = { getSortedRoomList };
