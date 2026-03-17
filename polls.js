const crypto = require('crypto');

const polls = new Map();

function createPoll({ question, options, room, createdBy }) {
    const id = crypto.randomBytes(5).toString('hex');
    const poll = {
        id,
        question,
        options: options.map(text => ({ text, count: 0 })),
        room,
        votes: new Map(),
        createdBy
    };
    polls.set(id, poll);
    return poll;
}

function getPoll(pollId) {
    return polls.get(pollId);
}

function votePoll(pollId, voterId, optionIndex) {
    const poll = polls.get(pollId);
    if (!poll || optionIndex < 0 || optionIndex >= poll.options.length) {
        return null;
    }

    const previous = poll.votes.get(voterId);
    if (previous !== undefined) {
        poll.options[previous].count--;
    }
    poll.options[optionIndex].count++;
    poll.votes.set(voterId, optionIndex);

    return poll;
}

module.exports = { createPoll, getPoll, votePoll };
