export default function ContextMenu({
  isMobile,
  menu,
  onClose,
  onCopy,
  onKick,
  onReply,
  onThread,
  showKick
}) {
  if (!menu?.open || !menu.message) return null;

  return (
    <>
      <button
        aria-label="close context menu"
        className="context-menu__overlay"
        type="button"
        onClick={onClose}
      />
      <div
        className={`context-menu${isMobile ? ' context-menu--mobile' : ''}`}
        style={isMobile ? undefined : {
          left: `${menu.x}px`,
          top: `${menu.y}px`
        }}
      >
        {isMobile && <div className="context-menu__handle" />}
        <button type="button" onClick={onReply}>
          ↩️ 回覆訊息
        </button>
        <button type="button" onClick={onCopy}>
          📋 複製文字
        </button>
        <button type="button" onClick={onThread}>
          🧵 開啟討論串
        </button>
        {showKick && (
          <button className="context-menu__danger" type="button" onClick={onKick}>
            🚫 踢出 {menu.message.displayName || menu.message.id}
          </button>
        )}
      </div>
    </>
  );
}
