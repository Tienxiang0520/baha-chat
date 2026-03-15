const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    roomName: String,
    id: String,
    text: String,
    timestamp: { type: Number, default: Date.now }
});

module.exports = mongoose.model('Message', messageSchema);