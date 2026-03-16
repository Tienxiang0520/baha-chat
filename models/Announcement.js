const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
    title: String,
    content: String,
    createdAt: { type: Number, default: Date.now }
});

module.exports = mongoose.model('Announcement', announcementSchema);