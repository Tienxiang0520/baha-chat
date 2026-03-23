import { useEffect, useRef } from 'react';
import MessageItem from './MessageItem';

export default function MessageList(props) {
  const { currentRoom, messages, onContextMenu, isMobile } = props;
  const listRef = useRef(null);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: 'smooth'
    });
  }, [messages]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;

    const handleClick = (event) => {
      const button = event.target.closest('.locked-message__button');
      if (!button) return;

      const container = button.closest('.locked-message');
      const input = container?.querySelector('.locked-message__input');
      const password = button.dataset.lockPassword || '';
      const encodedContent = button.dataset.lockContent || '';

      if (!container || !input) return;

      if (input.value === password) {
        container.innerHTML = `<div class="locked-message__title">🔓 ${decodeURIComponent(encodedContent).replace(/\n/g, '<br>')}</div>`;
        return;
      }

      input.value = '';
      input.placeholder = '密碼錯誤';
    };

    list.addEventListener('click', handleClick);
    return () => {
      list.removeEventListener('click', handleClick);
    };
  }, []);

  return (
    <div className="message-panel">
      {!currentRoom && (
        <div className="message-panel__empty">
          <strong>還沒進房間</strong>
          <p>先從左側快速切房挑一個房間，或使用帶 `room` 參數的分享連結。</p>
        </div>
      )}

      <ul ref={listRef} className="message-list">
        {messages.map((message) => (
          <MessageItem
            key={message.mid || `${message.id}-${message.timestamp}-${message.text}`}
            {...props}
            isMobile={isMobile}
            message={message}
            onContextMenu={onContextMenu}
          />
        ))}
      </ul>
    </div>
  );
}
