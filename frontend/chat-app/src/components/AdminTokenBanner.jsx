export default function AdminTokenBanner({ onCopy, onDismiss, token }) {
  if (!token) return null;

  return (
    <div className="inline-banner inline-banner--admin">
      <div>
        <strong>房主管理金鑰</strong>
        <p>{token}</p>
      </div>
      <div className="inline-banner__actions">
        <button className="ghost-btn" type="button" onClick={onCopy}>
          複製
        </button>
        <button className="ghost-btn" type="button" onClick={onDismiss}>
          收起
        </button>
      </div>
    </div>
  );
}
