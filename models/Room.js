const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    name: { type: String, unique: true },
    createdAt: { type: Number, default: Date.now },
    isLocked: { type: Boolean, default: false },
    password: { type: String, default: null }
    creatorId: { type: String, default: null },
    adminTokenHash: { type: String, default: null }
});

module.exports = mongoose.model('Room', roomSchema);
