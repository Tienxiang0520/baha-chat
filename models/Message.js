const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    roomName: String,
    id: String,
    text: String,
    timestamp: { type: Number, default: Date.now },
    useMarkdown: { type: Boolean, default: true }
});

module.exports = mongoose.model('Message', messageSchema);
