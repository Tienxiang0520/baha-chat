const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    name: { type: String, unique: true },
    createdAt: { type: Number, default: Date.now }
});

module.exports = mongoose.model('Room', roomSchema);
