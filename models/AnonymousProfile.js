const mongoose = require('mongoose');

const anonymousProfileSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    displayName: {
        type: String,
        default: '',
        trim: true,
        maxlength: 24
    },
    updatedAt: {
        type: Number,
        default: Date.now
    }
});

module.exports = mongoose.model('AnonymousProfile', anonymousProfileSchema);
