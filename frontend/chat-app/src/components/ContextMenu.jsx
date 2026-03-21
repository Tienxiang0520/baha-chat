export default function ContextMenu({
  menu,
  onClose,
  onCopy,
  onReply,
  onThread
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
        className="context-menu"
        style={{
          left: `${menu.x}px`,
          top: `${menu.y}px`
        }}
      >
        <button type="button" onClick={onReply}>
          ↩️ 回覆訊息
        </button>
        <button type="button" onClick={onCopy}>
          📋 複製文字
        </button>
        <button type="button" onClick={onThread}>
          🧵 開啟討論串
        </button>
      </div>
    </>
  );
}
