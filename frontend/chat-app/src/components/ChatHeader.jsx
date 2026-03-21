export default function ChatHeader({ connected, currentRoomDisplayName, mainSiteHref, userId, version }) {
  return (
    <header className="chat-shell__header">
      <a className="ghost-btn" href={mainSiteHref}>
        返回主站
      </a>

      <div className="chat-shell__title-group">
        <h2>{currentRoomDisplayName || '選一個房間開始'}</h2>
        <p>{currentRoomDisplayName ? `匿名 ID：${userId}` : '先從主站挑房，再用 React 版專心聊天。'}</p>
      </div>

      <div className="chat-shell__meta">
        <span className={`status-dot ${connected ? 'is-online' : 'is-offline'}`} />
        <span>{connected ? '已連線' : '連線中斷'}</span>
        {version && <span className="version-chip">v{version}</span>}
      </div>
    </header>
  );
}
