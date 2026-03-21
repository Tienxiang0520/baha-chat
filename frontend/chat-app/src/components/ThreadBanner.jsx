export default function ThreadBanner({
  activeThreadParent,
  activeThreadTitle,
  onBack,
  parentDisplayName
}) {
  if (!activeThreadParent) return null;

  return (
    <div className="inline-banner">
      <div>
        <strong>子討論串</strong>
        <p>
          原房間：{parentDisplayName || activeThreadParent}
          {activeThreadTitle ? ` · ${activeThreadTitle}` : ''}
        </p>
      </div>
      <button className="ghost-btn" type="button" onClick={onBack}>
        返回主頻道
      </button>
    </div>
  );
}
