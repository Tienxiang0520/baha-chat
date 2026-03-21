import { useEffect, useMemo, useRef, useState } from 'react';
import { COMMAND_SUGGESTIONS } from '../lib/commandSuggestions';

export default function Composer({
  currentRoom,
  draftValue,
  focusRequestKey,
  markdownEnabled,
  onDraftChange,
  onSend,
  onToggleMarkdown,
  onTyping,
  replyingTo,
  setReplyingTo,
  typingUsers
}) {
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [commandMenuPinned, setCommandMenuPinned] = useState(false);
  const composerRef = useRef(null);
  const textareaRef = useRef(null);
  const COMMAND_MENU_LIMIT = 6;

  const typedCommandSuggestions = useMemo(() => {
    const trimmed = draftValue.trimStart();
    if (!trimmed.startsWith('/')) return [];
    if (/\s/.test(trimmed)) return [];

    const commandToken = trimmed.split(/\s+/, 1)[0].toLowerCase();
    return COMMAND_SUGGESTIONS.filter((command) => command.name.startsWith(commandToken));
  }, [draftValue]);

  const visibleCommandSuggestions = useMemo(() => {
    if (commandMenuPinned) {
      return typedCommandSuggestions.length > 0 ? typedCommandSuggestions : COMMAND_SUGGESTIONS;
    }
    if (suggestionsDismissed) return [];
    return typedCommandSuggestions;
  }, [commandMenuPinned, suggestionsDismissed, typedCommandSuggestions]);

  const commandMenuStartIndex = useMemo(() => {
    if (visibleCommandSuggestions.length <= COMMAND_MENU_LIMIT) return 0;
    return Math.min(
      Math.max(activeSuggestionIndex - (COMMAND_MENU_LIMIT - 1), 0),
      visibleCommandSuggestions.length - COMMAND_MENU_LIMIT
    );
  }, [activeSuggestionIndex, visibleCommandSuggestions]);

  const commandMenuItems = useMemo(
    () => visibleCommandSuggestions.slice(
      commandMenuStartIndex,
      commandMenuStartIndex + COMMAND_MENU_LIMIT
    ),
    [commandMenuStartIndex, visibleCommandSuggestions]
  );

  useEffect(() => {
    setActiveSuggestionIndex(0);
  }, [draftValue, visibleCommandSuggestions.length]);

  useEffect(() => {
    if (!currentRoom) {
      onDraftChange('');
    }
    setCommandMenuPinned(false);
    setSuggestionsDismissed(false);
  }, [currentRoom, onDraftChange]);

  useEffect(() => {
    if (!focusRequestKey) return;
    textareaRef.current?.focus();
  }, [focusRequestKey]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!composerRef.current?.contains(event.target)) {
        setCommandMenuPinned(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  const applySuggestion = (suggestion) => {
    if (!suggestion) return;
    setCommandMenuPinned(false);
    setSuggestionsDismissed(false);
    onDraftChange(suggestion.template);
    requestAnimationFrame(() => {
      const input = textareaRef.current;
      if (!input) return;
      input.focus();
      const cursorPosition = suggestion.template.length;
      input.setSelectionRange(cursorPosition, cursorPosition);
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!draftValue.trim()) {
      onTyping(false);
      return;
    }

    const sent = onSend({
      text: draftValue,
      useMarkdown: markdownEnabled,
      replyTo: replyingTo
    });
    if (!sent) return;

    onDraftChange('');
    setCommandMenuPinned(false);
    setSuggestionsDismissed(false);
    onTyping(false);
    setReplyingTo(null);
  };

  const handleChange = (event) => {
    const nextValue = event.target.value;
    onDraftChange(nextValue);
    setSuggestionsDismissed(false);
    if (!currentRoom) return;
    onTyping(Boolean(nextValue.trim()));
  };

  const toggleCommandMenu = () => {
    if (!currentRoom) return;
    setSuggestionsDismissed(false);
    setCommandMenuPinned((open) => !open);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  const isCommandMenuOpen = currentRoom && visibleCommandSuggestions.length > 0;

  return (
    <section ref={composerRef} className="composer app-card">
      <div className="composer__toolbar">
        <div className="composer__toolbar-actions">
          <button className="ghost-btn" type="button" onClick={onToggleMarkdown}>
            {markdownEnabled ? 'Markdown ON' : 'Markdown OFF'}
          </button>
          <button
            className={`ghost-btn ${commandMenuPinned ? 'is-active' : ''}`}
            type="button"
            onClick={toggleCommandMenu}
          >
            / 指令
          </button>
        </div>
        <span className="composer__hint">
          {typingUsers.length > 0 ? `[${typingUsers[0]}] 正在輸入...` : 'Shift + Enter 換行，Enter 發送'}
        </span>
      </div>

      {replyingTo && (
        <div className="reply-banner">
          <div>
            <strong>回覆 [{replyingTo.id}]</strong>
            <p>{replyingTo.text}</p>
          </div>
          <button className="ghost-btn" type="button" onClick={() => setReplyingTo(null)}>
            取消
          </button>
        </div>
      )}

      <div className="composer__editor">
        {isCommandMenuOpen && (
          <div className="composer__command-menu" role="listbox" aria-label="指令建議">
            {commandMenuItems.map((suggestion, index) => {
              const actualIndex = commandMenuStartIndex + index;
              return (
              <button
                key={suggestion.name}
                className={`composer__command-item ${actualIndex === activeSuggestionIndex ? 'is-active' : ''}`}
                type="button"
                onClick={() => applySuggestion(suggestion)}
              >
                <span className="composer__command-name">{suggestion.name}</span>
                <span className="composer__command-desc">{suggestion.description}</span>
              </button>
              );
            })}
            <div className="composer__command-hint">方向鍵切換，Enter / Tab 套用</div>
          </div>
        )}

        <form className="composer__form" onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            className="composer__input"
            disabled={!currentRoom}
            placeholder={currentRoom ? '輸入匿名訊息...' : '先加入房間後才能發言'}
            value={draftValue}
            onBlur={() => onTyping(false)}
            onChange={handleChange}
            onKeyDown={(event) => {
              if (isCommandMenuOpen) {
                const maxIndex = visibleCommandSuggestions.length - 1;
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setActiveSuggestionIndex((index) => Math.min(index + 1, maxIndex));
                  return;
                }

                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActiveSuggestionIndex((index) => Math.max(index - 1, 0));
                  return;
                }

                if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
                  const activeSuggestion = visibleCommandSuggestions[Math.min(activeSuggestionIndex, maxIndex)];
                  if (activeSuggestion) {
                    event.preventDefault();
                    applySuggestion(activeSuggestion);
                    return;
                  }
                }

                if (event.key === 'Escape') {
                  event.preventDefault();
                  setCommandMenuPinned(false);
                  setSuggestionsDismissed(true);
                  return;
                }
              }

              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button className="primary-btn composer__submit" disabled={!currentRoom} type="submit">
            發送
          </button>
        </form>
      </div>
    </section>
  );
}
