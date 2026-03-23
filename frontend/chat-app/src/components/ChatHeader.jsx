export default function ChatHeader({
  connected,
  currentRoomDisplayName,
  isMobile,
  mainSiteHref,
  userId,
  version
}) {
  const subtitle = currentRoomDisplayName
    ? `匿名 ID：${userId}`
    : isMobile
      ? '先回主站選房，再進來聊天。'
      : '先從左側快速切房，或用分享連結直接進房。';

  return (
    <header className="chat-shell__header">
      <a className="ghost-btn" href={mainSiteHref}>
        返回主站
      </a>

      <div className="chat-shell__title-group">
        <h2>{currentRoomDisplayName || '選一個房間開始'}</h2>
        <p>{subtitle}</p>
      </div>

      <div className="chat-shell__meta">
        <span className={`status-dot ${connected ? 'is-online' : 'is-offline'}`} />
        <span>{connected ? '已連線' : '連線中斷'}</span>
        {version && <span className="version-chip">v{version}</span>}
      </div>
    </header>
  );
}
