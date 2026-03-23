import { COMMAND_SUGGESTIONS } from '../lib/commandSuggestions';

function ShortcutButton({ disabled = false, label, onClick, secondary = false }) {
  return (
    <button
      className={`sidebar-shortcut-btn ${secondary ? 'is-secondary' : ''}`}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function RoomSwitchButton({ active = false, label, meta, onClick }) {
  return (
    <button
      className={`room-switch-btn ${active ? 'is-active' : ''}`}
      type="button"
      onClick={onClick}
    >
      <strong>{label}</strong>
      <span>{meta}</span>
    </button>
  );
}

export default function Sidebar({
  activeThreadParent,
  activeThreadTitle,
  connected,
  currentRoom,
  currentRoomDisplayName,
  isRoomOwner,
  mainSiteHref,
  onCopyRoomLink,
  onFocusComposer,
  onJoinRoom,
  onUseCommand,
  rooms,
  userId
}) {
  const hasRoom = Boolean(currentRoom);
  const shortcutCommands = COMMAND_SUGGESTIONS.filter((command) =>
    !['/rename', '/private', '/public', '/clear', '/delete'].includes(command.name)
  );
  const switchableRooms = (Array.isArray(rooms) ? rooms : [])
    .filter((room) => !room.isThread)
    .slice()
    .sort((a, b) => {
      if ((b.userCount || 0) !== (a.userCount || 0)) {
        return (b.userCount || 0) - (a.userCount || 0);
      }
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

  return (
    <aside className="sidebar app-card">
      <div className="sidebar__intro">
        <h1>房內控制台</h1>
        <p>React 版現在就是主站，先選房，再專心聊天與管理房間。</p>
      </div>

      <section className="sidebar-panel">
        <div className="sidebar-panel__header">
          <h2>房間資訊</h2>
          <span className={`sidebar-status ${connected ? 'is-online' : 'is-offline'}`}>
            {connected ? '已連線' : '重連中'}
          </span>
        </div>

        {hasRoom ? (
          <div className="sidebar-info-stack">
            <div className="sidebar-room-card">
              <strong>{currentRoomDisplayName || currentRoom}</strong>
              <span>房間代號：{currentRoom}</span>
              {activeThreadParent && (
                <span>
                  討論串：{activeThreadTitle || '未命名'} · 原房 {activeThreadParent}
                </span>
              )}
            </div>

            <div className="sidebar-badge-grid">
              <div className="sidebar-badge">
                <span>匿名 ID</span>
                <strong>{userId}</strong>
              </div>
              <div className="sidebar-badge">
                <span>管理狀態</span>
                <strong>{isRoomOwner ? '房主可管理' : '一般訪客'}</strong>
              </div>
            </div>
          </div>
        ) : (
          <div className="sidebar-empty">
            <strong>還沒指定房間</strong>
            <p>先從下方快速切房挑一個房間，或用分享連結直接進房。</p>
            <a className="primary-btn sidebar-link-btn" href={mainSiteHref}>
              回首頁
            </a>
          </div>
        )}
      </section>

      <section className="sidebar-panel">
        <div className="sidebar-panel__header">
          <h2>快速切房</h2>
        </div>
        {switchableRooms.length > 0 ? (
          <div className="room-switch-list">
            {switchableRooms.map((room) => (
              <RoomSwitchButton
                key={room.name}
                active={room.name === currentRoom}
                label={room.displayName || room.name}
                meta={`${room.isLocked ? '🔒 鎖房' : '🌐 公開'} · ${room.userCount || 0} 人`}
                onClick={() => onJoinRoom(room.name, room.displayName || room.name)}
              />
            ))}
          </div>
        ) : (
          <div className="sidebar-empty">
            <strong>暫時沒有可切換房間</strong>
            <p>目前還沒有公開房間，等有人建立後這裡就會同步出現。</p>
          </div>
        )}
      </section>

      <section className="sidebar-panel sidebar-panel--shortcuts">
        <div className="sidebar-panel__header">
          <h2>快捷操作</h2>
        </div>
        <div className="sidebar-shortcut-list">
          <ShortcutButton disabled={!hasRoom} label="聚焦輸入框" onClick={onFocusComposer} />
          <ShortcutButton disabled={!hasRoom} label="複製房間連結" onClick={onCopyRoomLink} />
          {shortcutCommands.map((command) => (
            <ShortcutButton
              key={command.name}
              disabled={!hasRoom}
              label={`插入 ${command.name}`}
              onClick={() => onUseCommand(command.template)}
            />
          ))}
        </div>
      </section>

      {isRoomOwner && (
        <section className="sidebar-panel sidebar-panel--grow">
          <div className="sidebar-panel__header">
            <h2>房主管理</h2>
          </div>

          <div className="sidebar-shortcut-list">
            <ShortcutButton disabled={!hasRoom} label="插入 /rename" onClick={() => onUseCommand('/rename 新名稱')} />
            <ShortcutButton disabled={!hasRoom} label="插入 /private" onClick={() => onUseCommand('/private 密碼')} />
            <ShortcutButton disabled={!hasRoom} label="插入 /public" onClick={() => onUseCommand('/public')} />
            <ShortcutButton disabled={!hasRoom} label="插入 /clear" onClick={() => onUseCommand('/clear')} />
            <ShortcutButton disabled={!hasRoom} label="插入 /delete" onClick={() => onUseCommand('/delete')} />
          </div>
        </section>
      )}
    </aside>
  );
}
