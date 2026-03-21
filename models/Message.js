const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    roomName: String,
    id: String,
    text: String,
    timestamp: { type: Number, default: Date.now },
    useMarkdown: { type: Boolean, default: true },
    replyTo: { 
        id: String,
        text: String
    },
    threadOpened: { type: Boolean, default: false },
    threadRoom: String,
    effect: String,
    poll: {
        id: String,
        question: String,
        options: [{
            text: String,
            count: { type: Number, default: 0 }
        }]
    },
    linkPreview: {
        url: String,
        title: String,
        description: String,
        image: String
    }
});

module.exports = mongoose.model('Message', messageSchema);
