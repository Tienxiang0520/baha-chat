const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    name: { type: String, unique: true },
    displayName: { type: String, default: function() { return this.name; } }, // 顯示名稱可透過 /rename 更新
    createdAt: { type: Number, default: Date.now },
    isLocked: { type: Boolean, default: false },
    password: { type: String, default: null },
    creatorId: { type: String, default: null },
    adminTokenHash: { type: String, default: null },
    bannedIds: { type: [String], default: [] }
});

module.exports = mongoose.model('Room', roomSchema);
