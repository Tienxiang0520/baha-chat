import { useRef } from 'react';
import { renderMessageHtml } from '../lib/markdown';
import { stringToColor } from '../lib/userId';

function LinkPreview({ preview }) {
  if (!preview?.title) return null;

  return (
    <a
      className="link-preview"
      href={preview.url}
      target="_blank"
      rel="noreferrer noopener"
    >
      <div className="link-preview__content">
        <strong>{preview.title}</strong>
        <span>{preview.description || preview.url}</span>
      </div>
      {preview.image && <img alt={preview.title} src={preview.image} />}
    </a>
  );
}

function PollCard({ poll, onVote }) {
  const hasValidPoll = poll
    && typeof poll.id === 'string'
    && poll.id.trim().length > 0
    && typeof poll.question === 'string'
    && poll.question.trim().length > 0
    && Array.isArray(poll.options)
    && poll.options.length > 0;

  if (!hasValidPoll) return null;

  const totalVotes = poll.options.reduce((sum, option) => sum + (option.count || 0), 0);

  return (
    <div className="poll-card">
      <div className="poll-card__badge">投票</div>
      <div className="poll-card__header">
        <strong>{poll.question}</strong>
        <span>{totalVotes} 票</span>
      </div>
      <div className="poll-card__options">
        {poll.options.map((option, index) => (
          <button
            key={`${poll.id}-${option.text}`}
            className={`poll-option-btn ${poll.selectedOptionIndex === index ? 'selected' : ''}`}
            type="button"
            onClick={() => onVote(poll.id, index)}
          >
            <span className="poll-option-btn__text">{option.text}</span>
            <span className="poll-option-btn__count">{option.count}</span>
          </button>
        ))}
      </div>
      {Number.isInteger(poll.selectedOptionIndex) && (
        <div className="poll-card__selection">
          你目前投給：{poll.options[poll.selectedOptionIndex]?.text || `選項 ${poll.selectedOptionIndex + 1}`}
        </div>
      )}
    </div>
  );
}

export default function MessageItem({
  isMobile,
  message,
  onContextMenu,
  onCreateThread,
  onJoinThread,
  onReply,
  onVote,
  userId
}) {
  const isSystem = message.id === 'System';
  const isMine = message.id === userId;
  const longPressTimerRef = useRef(null);
  const touchOriginRef = useRef(null);
  const senderLabel = message.displayName || message.id;
  const replyLabel = message.replyTo?.displayName || message.replyTo?.id;
  const className = [
    'message-item',
    isMine ? 'is-mine' : '',
    isSystem ? 'is-system' : ''
  ]
    .filter(Boolean)
    .join(' ');

  const html = renderMessageHtml(message.text, message.useMarkdown !== false);
  const timeText = new Date(message.timestamp || Date.now()).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchOriginRef.current = null;
  };

  const handleTouchStart = (event) => {
    if (!isMobile || isSystem || !onContextMenu || event.touches.length !== 1) return;
    const touch = event.touches[0];
    touchOriginRef.current = { x: touch.clientX, y: touch.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      onContextMenu(
        {
          clientX: touch.clientX,
          clientY: touch.clientY
        },
        message
      );
      clearLongPress();
    }, 460);
  };

  const handleTouchMove = (event) => {
    if (!longPressTimerRef.current || !touchOriginRef.current || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const deltaX = Math.abs(touch.clientX - touchOriginRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchOriginRef.current.y);
    if (deltaX > 12 || deltaY > 12) {
      clearLongPress();
    }
  };

  return (
    <li
      className={className}
      onContextMenu={(event) => {
        if (isMobile || isSystem || !onContextMenu) return;
        event.preventDefault();
        onContextMenu(event, message);
      }}
      onTouchCancel={clearLongPress}
      onTouchEnd={clearLongPress}
      onTouchMove={handleTouchMove}
      onTouchStart={handleTouchStart}
    >
      {!isMine && !isSystem && (
        <span className="message-item__user" style={{ color: stringToColor(message.id) }}>
          {senderLabel}
        </span>
      )}

      {message.replyTo && (
        <div className="message-reply">
          <span className="message-reply__label">回覆 {replyLabel}</span>
          <span className="message-reply__text">{message.replyTo.text}</span>
        </div>
      )}

      <div
        className="message-item__body"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {message.threadOpened && (
        <div className="thread-hint">
          🧵 討論串已開啟{message.threadTitle ? `：${message.threadTitle}` : ''}
        </div>
      )}

      {message.threadLink?.room && (
        <button
          className="ghost-btn message-action-btn"
          type="button"
          onClick={() => onJoinThread(message.threadLink.room, message.threadLink.displayName)}
        >
          前往討論串
        </button>
      )}

      <LinkPreview preview={message.linkPreview} />
      <PollCard poll={message.poll} onVote={onVote} />

      {!isSystem && (
        <div className="message-item__footer">
          <span className="message-item__time">{timeText}</span>
          {!isMobile && (
            <div className="message-item__actions">
              <button className="text-btn" type="button" onClick={() => onReply(message)}>
                回覆
              </button>
              <button
                className="text-btn"
                type="button"
                onClick={() => onCreateThread(message)}
              >
                討論串
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
