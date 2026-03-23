const mongoose = require('mongoose');

const pollOptionSchema = new mongoose.Schema({
    text: String,
    count: { type: Number, default: 0 }
}, { _id: false });

const pollSchema = new mongoose.Schema({
    id: String,
    question: String,
    options: [pollOptionSchema]
}, { _id: false });

const messageSchema = new mongoose.Schema({
    roomName: String,
    id: String,
    displayName: String,
    text: String,
    timestamp: { type: Number, default: Date.now },
    useMarkdown: { type: Boolean, default: true },
    replyTo: {
        id: String,
        displayName: String,
        text: String
    },
    threadOpened: { type: Boolean, default: false },
    threadRoom: String,
    effect: String,
    poll: {
        type: pollSchema,
        default: undefined
    },
    linkPreview: {
        url: String,
        title: String,
        description: String,
        image: String
    }
});

module.exports = mongoose.model('Message', messageSchema);
