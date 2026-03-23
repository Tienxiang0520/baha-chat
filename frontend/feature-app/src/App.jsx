import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  formatAnonymousKey,
  getOrCreateUserId,
  getStoredAnonymousDisplayName,
  importAnonymousKey,
  MAX_DISPLAY_NAME_LENGTH,
  setAnonymousDisplayName
} from '../../shared/anonymousIdentity';

const MOBILE_BREAKPOINT = 860;
const MOTION_STORAGE_KEY = 'baha-reduce-motion';
const NOTIFICATION_STORAGE_KEY = 'baha-desktop-notifications';

const VIEW_TITLES = {
  home: '功能中心',
  identity: '匿名身份',
  tutorial: '指令教學',
  embed: '網址嵌入教學',
  announcements: '系統公告',
  server: '伺服器狀態',
  sponsor: '贊助 Baha'
};

const COMMAND_FORMATTING_ROWS = [
  ['一級標題', '# 文字'],
  ['二級標題', '## 文字'],
  ['三級標題', '### 文字'],
  ['粗體', '**文字**'],
  ['斜體', '*文字*'],
  ['底線', '__文字__'],
  ['刪除線', '~~文字~~'],
  ['引用', '> 文字'],
  ['防雷 / 隱藏', '||文字||'],
  ['單行程式碼', '`文字`'],
  ['多行程式碼', '```\n文字\n```'],
  ['加密訊息', '[lock:密碼]文字[/lock]']
];

const INTERACTIVE_COMMANDS = [
  ['/party', '全螢幕碎紙花'],
  ['/quake', '全螢幕震動'],
  ['/roll', '擲骰子 (1~100)'],
  ['/canvas', '建立共用畫布'],
  ['/md', '開關 Markdown']
];

const ROOM_COMMANDS = [
  ['/lock [密碼] <話題名>', '加入或建立話題，帶密碼即可建立上鎖房']
];

const SEARCH_COMMANDS = [
  ['/hot', '熱門話題'],
  ['/lock', '僅顯示密碼保護房'],
  ['/open', '僅顯示公開房間']
];

const ADMIN_COMMANDS = [
  ['/rename 新名稱', '更改本房在大廳顯示的標題'],
  ['/public', '開放房間讓所有人直接加入'],
  ['/private 密碼', '設定密碼鎖，限制進入'],
  ['/clear', '清空房間內的聊天紀錄'],
  ['/delete', '立即關閉並刪除此房間'],
  ['/ban ID', '封鎖並踢出特定匿名 ID'],
  ['/announce 標題 | 內容', '全站公告讓所有人看到']
];

const EMBED_GUIDES = [
  {
    service: 'YouTube',
    content: '點影片下方的分享，再選嵌入，貼上 iframe 程式碼。請使用 https://www.youtube.com/embed/影片ID，不要直接貼 watch?v=。'
  },
  {
    service: 'Spotify',
    content: '打開單曲或歌單的分享選單，選擇內嵌，直接貼上提供的 iframe。'
  },
  {
    service: 'Google 地圖',
    content: '請從分享功能中的「嵌入地圖」複製 HTML。maps.app.goo.gl 這類短連結不能直接放進 iframe。'
  },
  {
    service: '其他網站',
    content: '只要該網站允許嵌入，就可以用 iframe 包起來，寬度建議 100%，高度依內容調整。'
  }
];

const HOME_CARDS = [
  { key: 'identity', icon: '🪪', title: '匿名身份', description: '設定匿名名稱，並複製或匯入你的匿名金鑰。', action: '管理' },
  { key: 'tutorial', icon: '📖', title: '指令教學', description: '集中查看 Markdown、互動指令、房主管理指令。', action: '打開' },
  { key: 'embed', icon: '🔗', title: '網址嵌入教學', description: '整理 YouTube、Spotify、Google 地圖等嵌入方式。', action: '查看' },
  { key: 'announcements', icon: '📢', title: '系統公告', description: '追蹤最新公告與更新提醒。', action: '閱讀' },
  { key: 'server', icon: '🖥️', title: '伺服器狀態', description: '檢查連線數、房間數、負載與記憶體使用。', action: '監看' },
  { key: 'sponsor', icon: '💖', title: '贊助 Baha', description: '查看 PayPal 與聯絡方式，支持伺服器與開發成本。', action: '支持' }
];

const MOBILE_PRIMARY_CARD_KEYS = ['identity', 'tutorial', 'announcements', 'sponsor'];
const MOBILE_MORE_CARD_KEYS = ['embed', 'server'];

function getInitialView() {
  const url = new URL(window.location.href);
  const view = url.searchParams.get('view');
  return VIEW_TITLES[view] ? view : 'home';
}

function syncViewToUrl(view) {
  const url = new URL(window.location.href);
  if (view === 'home') {
    url.searchParams.delete('view');
  } else {
    url.searchParams.set('view', view);
  }
  window.history.replaceState({}, '', url);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'N/A';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'N/A';
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return 'N/A';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (days > 0) return `${days} 天 ${hours} 小時`;
  if (hours > 0) return `${hours} 小時 ${minutes} 分`;
  if (minutes > 0) return `${minutes} 分 ${secs} 秒`;
  return `${secs} 秒`;
}

function StatusCard({ label, value, hint }) {
  return (
    <article className="status-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <p>{hint}</p> : null}
    </article>
  );
}

export default function App() {
  const socketRef = useRef(null);
  const serverRefreshTimerRef = useRef(null);
  const initialUserId = useMemo(() => getOrCreateUserId(), []);

  const [activeView, setActiveView] = useState(() => getInitialView());
  const [isMobileLayout, setIsMobileLayout] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [version, setVersion] = useState('');
  const [announcements, setAnnouncements] = useState([]);
  const [serverStatus, setServerStatus] = useState(null);
  const [serverStatusLoading, setServerStatusLoading] = useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(() => localStorage.getItem(MOTION_STORAGE_KEY) === 'true');
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => localStorage.getItem(NOTIFICATION_STORAGE_KEY) === 'true');
  const [copyNotice, setCopyNotice] = useState('');
  const [currentUserId, setCurrentUserId] = useState(initialUserId);
  const [currentAnonymousKey, setCurrentAnonymousKey] = useState(() => formatAnonymousKey(initialUserId));
  const [anonymousKeyDraft, setAnonymousKeyDraft] = useState('');
  const [currentDisplayName, setCurrentDisplayName] = useState(() => getStoredAnonymousDisplayName());
  const [displayNameDraft, setDisplayNameDraft] = useState(() => getStoredAnonymousDisplayName());
  const [identityNotice, setIdentityNotice] = useState('');

  useEffect(() => {
    syncViewToUrl(activeView);
  }, [activeView]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileLayout(window.innerWidth <= MOBILE_BREAKPOINT);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (!isMobileLayout && activeView === 'home') {
      setActiveView('identity');
    }
  }, [activeView, isMobileLayout]);

  useEffect(() => {
    setMobileMoreOpen(false);
  }, [activeView, isMobileLayout]);

  useEffect(() => {
    document.body.classList.toggle('reduce-motion', reduceMotionEnabled);
    localStorage.setItem(MOTION_STORAGE_KEY, reduceMotionEnabled ? 'true' : 'false');
  }, [reduceMotionEnabled]);

  useEffect(() => {
    fetch('/meta/version', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => setVersion(data.version || ''))
      .catch((error) => console.warn('feature version fetch failed', error));
  }, []);

  useEffect(() => {
    const socket = io({
      auth: { userId: currentUserId }
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('request anonymous profile', (profile) => {
        const displayName = profile?.displayName || '';
        const userId = profile?.userId || currentUserId;
        setCurrentUserId(userId);
        setCurrentAnonymousKey(formatAnonymousKey(userId));
        setCurrentDisplayName(displayName);
        setDisplayNameDraft(displayName);
        setAnonymousDisplayName(displayName);
      });
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('announcement list', (list) => {
      setAnnouncements(Array.isArray(list) ? list : []);
    });

    socket.on('new announcement', (item) => {
      if (!item) return;
      setAnnouncements((prev) => [item, ...prev]);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [currentUserId]);

  useEffect(() => {
    const loadServerStatus = () => {
      if (!socketRef.current) return;
      setServerStatusLoading(true);
      socketRef.current.emit('request server status', (status) => {
        setServerStatusLoading(false);
        setServerStatus(status || { error: '無法取得伺服器狀態' });
      });
    };

    if (activeView === 'server') {
      loadServerStatus();
      serverRefreshTimerRef.current = window.setInterval(loadServerStatus, 5000);
    }

    return () => {
      if (serverRefreshTimerRef.current) {
        clearInterval(serverRefreshTimerRef.current);
        serverRefreshTimerRef.current = null;
      }
    };
  }, [activeView]);

  const latestAnnouncement = announcements[0];
  const mobilePrimaryCards = HOME_CARDS.filter((card) => MOBILE_PRIMARY_CARD_KEYS.includes(card.key));
  const mobileMoreCards = HOME_CARDS.filter((card) => MOBILE_MORE_CARD_KEYS.includes(card.key));

  const serverStatusCards = useMemo(() => {
    if (!serverStatus || serverStatus.error) return [];
    const loadAverage = Array.isArray(serverStatus.loadAverage) ? serverStatus.loadAverage : [0, 0, 0];
    const memoryUsage = serverStatus.memoryUsage || {};

    return [
      ['在線人數', String(serverStatus.connectedUsers ?? 0), '目前 socket 連線數'],
      ['房間數', String(serverStatus.roomCount ?? 0), '資料庫中的房間總數'],
      ['公告數', String(serverStatus.announcementCount ?? 0), '系統公告數量'],
      ['伺服器負載', `${formatNumber(loadAverage[0])} / ${formatNumber(loadAverage[1])} / ${formatNumber(loadAverage[2])}`, '1 / 5 / 15 分鐘平均'],
      ['記憶體使用', `${formatBytes(memoryUsage.rss)} RSS`, `Heap ${formatBytes(memoryUsage.heapUsed)} / ${formatBytes(memoryUsage.heapTotal)}`],
      ['執行時間', formatDuration(serverStatus.uptimeSeconds), `${serverStatus.nodeVersion || 'Node.js'} · ${serverStatus.platform || ''} ${serverStatus.arch || ''}`.trim()],
      ['主機資訊', `${serverStatus.hostname || 'N/A'} / PID ${serverStatus.pid ?? 'N/A'}`, new Date(serverStatus.timestamp || Date.now()).toLocaleString()]
    ];
  }, [serverStatus]);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText('pudding050@gmail.com');
      setCopyNotice('已複製信箱');
      window.setTimeout(() => setCopyNotice(''), 1800);
    } catch (error) {
      console.error('copy email failed', error);
      setCopyNotice('複製失敗');
      window.setTimeout(() => setCopyNotice(''), 1800);
    }
  };

  const handleCopyAnonymousKey = async () => {
    try {
      await navigator.clipboard.writeText(currentAnonymousKey);
      setIdentityNotice('已複製匿名金鑰');
      window.setTimeout(() => setIdentityNotice(''), 1800);
    } catch (error) {
      console.error('copy anonymous key failed', error);
      setIdentityNotice('複製失敗');
      window.setTimeout(() => setIdentityNotice(''), 1800);
    }
  };

  const handleImportAnonymousKey = () => {
    try {
      const importedUserId = importAnonymousKey(anonymousKeyDraft);
      const nextKey = formatAnonymousKey(importedUserId);
      setCurrentAnonymousKey(nextKey);
      setCurrentUserId(importedUserId);
      setAnonymousKeyDraft('');
      setCurrentDisplayName('');
      setDisplayNameDraft('');
      setIdentityNotice('已套用匿名金鑰，正在同步這個身份的匿名名稱與房主權限。');
      window.setTimeout(() => setIdentityNotice(''), 2200);
    } catch (error) {
      console.error('import anonymous key failed', error);
      setIdentityNotice('金鑰格式不正確，請貼上完整的 Baha-Key- 開頭金鑰。');
      window.setTimeout(() => setIdentityNotice(''), 2200);
    }
  };

  const handleSaveDisplayName = () => {
    const socket = socketRef.current;
    if (!socket) return;

    socket.emit('set anonymous display name', { displayName: displayNameDraft }, (result) => {
      if (!result?.ok) {
        setIdentityNotice('匿名名稱儲存失敗，請稍後再試。');
        window.setTimeout(() => setIdentityNotice(''), 2200);
        return;
      }

      const nextDisplayName = result.displayName || '';
      setCurrentDisplayName(nextDisplayName);
      setDisplayNameDraft(nextDisplayName);
      setAnonymousDisplayName(nextDisplayName);
      setIdentityNotice(
        nextDisplayName
          ? '匿名名稱已更新，聊天室之後會顯示這個名字。'
          : '已清空匿名名稱，之後會改回顯示匿名 ID。'
      );
      window.setTimeout(() => setIdentityNotice(''), 2200);
    });
  };

  const handleClearDisplayName = () => {
    setDisplayNameDraft('');
    const socket = socketRef.current;
    if (!socket) {
      setAnonymousDisplayName('');
      setCurrentDisplayName('');
      return;
    }

    socket.emit('set anonymous display name', { displayName: '' }, (result) => {
      if (!result?.ok) {
        setIdentityNotice('清空匿名名稱失敗，請稍後再試。');
        window.setTimeout(() => setIdentityNotice(''), 2200);
        return;
      }

      setAnonymousDisplayName('');
      setCurrentDisplayName('');
      setDisplayNameDraft('');
      setIdentityNotice('已清空匿名名稱，之後會改回顯示匿名 ID。');
      window.setTimeout(() => setIdentityNotice(''), 2200);
    });
  };

  const toggleDesktopNotifications = async () => {
    if (notificationsEnabled) {
      localStorage.setItem(NOTIFICATION_STORAGE_KEY, 'false');
      setNotificationsEnabled(false);
      return;
    }

    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    const enabled = permission === 'granted';
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, enabled ? 'true' : 'false');
    setNotificationsEnabled(enabled);
  };

  const openView = (view) => {
    setActiveView(view);
    setMobileMoreOpen(false);
  };

  const renderDesktopHome = () => (
    <div className="feature-home">
      <section className="feature-home__grid">
        {HOME_CARDS.map((card) => (
          <button key={card.key} type="button" className="feature-tile" onClick={() => openView(card.key)}>
            <span className="feature-tile__icon">{card.icon}</span>
            <strong>{card.title}</strong>
            <p>{card.description}</p>
            <span className="feature-tile__action">{card.action}</span>
          </button>
        ))}

        <a className="feature-tile feature-tile--link" href="/react-chat/">
          <span className="feature-tile__icon">⚛️</span>
          <strong>聊天室</strong>
          <p>前往獨立維護的聊天室前端。</p>
          <span className="feature-tile__action">進入</span>
        </a>

        <a className="feature-tile feature-tile--link" href="/react-board/">
          <span className="feature-tile__icon">🧩</span>
          <strong>白板大廳</strong>
          <p>進入白板式主站頁面，管理模組與版面。</p>
          <span className="feature-tile__action">打開</span>
        </a>
      </section>

      <section className="feature-home__footer">
        <article className="feature-inline-card">
          <strong>最新公告</strong>
          <p>{latestAnnouncement ? latestAnnouncement.title : '目前還沒有公告'}</p>
        </article>
        <article className="feature-inline-card">
          <strong>減少動態效果</strong>
          <button type="button" className="inline-action-btn" onClick={() => setReduceMotionEnabled((prev) => !prev)}>
            {reduceMotionEnabled ? '已啟用' : '啟用'}
          </button>
        </article>
        <article className="feature-inline-card">
          <strong>桌面通知</strong>
          <button type="button" className="inline-action-btn" onClick={toggleDesktopNotifications}>
            {notificationsEnabled ? '已開啟' : '關閉中'}
          </button>
        </article>
      </section>
    </div>
  );

  const renderMobileHome = () => (
    <div className="feature-mobile-home">
      <section className="feature-mobile-home__hero">
        <div>
          <span className="feature-kicker">常用入口</span>
          <h1>先選你要做的事</h1>
          <p>改匿名名稱、看公告、支持開發，都可以從這裡直接進去。</p>
        </div>
        <div className="feature-mobile-home__meta">
          <span className={`feature-connection${connected ? ' is-online' : ''}`}>{connected ? '已連線' : '連線中斷'}</span>
          <span className="feature-version">v{version || '...'}</span>
        </div>
      </section>

      <section className="feature-mobile-home__list">
        {mobilePrimaryCards.map((card) => (
          <button key={card.key} type="button" className="feature-mobile-item" onClick={() => openView(card.key)}>
            <span className="feature-mobile-item__icon">{card.icon}</span>
            <span className="feature-mobile-item__body">
              <strong>{card.title}</strong>
              <span>{card.description}</span>
            </span>
            <span className="feature-mobile-item__arrow">›</span>
          </button>
        ))}
      </section>

      <section className="feature-mobile-home__shortcuts">
        <a className="feature-mobile-link" href="/react-board/">返回主站</a>
        <button type="button" className="feature-mobile-link feature-mobile-link--more" onClick={() => setMobileMoreOpen(true)}>
          更多
        </button>
      </section>

      {mobileMoreOpen && (
        <>
          <button className="feature-mobile-sheet__overlay" type="button" aria-label="關閉更多功能" onClick={() => setMobileMoreOpen(false)} />
          <section className="feature-mobile-sheet" aria-label="更多功能">
            <div className="feature-mobile-sheet__handle" />
            <div className="feature-mobile-sheet__header">
              <div>
                <strong>更多功能</strong>
                <p>不常用但還是需要的工具，我們集中放在這裡。</p>
              </div>
              <button type="button" className="header-ghost-btn" onClick={() => setMobileMoreOpen(false)}>
                關閉
              </button>
            </div>

            <div className="feature-mobile-sheet__list">
              {mobileMoreCards.map((card) => (
                <button key={card.key} type="button" className="feature-mobile-item" onClick={() => openView(card.key)}>
                  <span className="feature-mobile-item__icon">{card.icon}</span>
                  <span className="feature-mobile-item__body">
                    <strong>{card.title}</strong>
                    <span>{card.description}</span>
                  </span>
                  <span className="feature-mobile-item__arrow">›</span>
                </button>
              ))}

              <button type="button" className="feature-mobile-setting" onClick={() => setReduceMotionEnabled((prev) => !prev)}>
                <span>減少動態效果</span>
                <strong>{reduceMotionEnabled ? '已啟用' : '未啟用'}</strong>
              </button>

              <button type="button" className="feature-mobile-setting" onClick={toggleDesktopNotifications}>
                <span>桌面通知</span>
                <strong>{notificationsEnabled ? '已開啟' : '關閉中'}</strong>
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );

  const renderIdentity = () => (
    <div className="feature-article">
      <section className="feature-summary">
        <strong>匿名身份</strong>
        <p>進站時系統會自動幫你建立一把匿名金鑰。把它複製到別的裝置匯入後，就能延續同一個匿名身份，也能保留你建立房間時的房主權限。</p>
      </section>

      <article className="identity-card">
        <span>匿名名稱</span>
        <strong className="identity-card__value">{currentDisplayName || '目前未設定，聊天室會顯示匿名 ID'}</strong>
        <input
          className="identity-name-input"
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          placeholder="輸入想顯示的匿名名稱，可和別人重複"
          value={displayNameDraft}
          onChange={(event) => setDisplayNameDraft(event.target.value)}
        />
        <div className="identity-card__actions">
          <button type="button" className="paypal-btn" onClick={handleSaveDisplayName}>儲存匿名名稱</button>
          <button type="button" className="inline-action-btn" onClick={handleClearDisplayName}>清空名稱</button>
        </div>
        <p className="identity-help">匿名名稱可以隨時改、可以和其他人重複。真正的房主身份仍然綁在匿名金鑰上，不會因為改名而遺失。</p>
      </article>

      <article className="identity-card">
        <span>目前這台裝置使用中的金鑰</span>
        <code className="identity-key-box">{currentAnonymousKey}</code>
        <div className="identity-card__actions">
          <button type="button" className="inline-action-btn" onClick={handleCopyAnonymousKey}>複製匿名金鑰</button>
        </div>
        <p className="identity-help">這把金鑰不會顯示你的真實資料，只是用來延續匿名身份。房間的建立者權限也會綁在這把金鑰上。若你正在其他分頁使用聊天室，重新整理後會套用新的金鑰。</p>
      </article>

      <article className="identity-card">
        <span>在新設備匯入你的匿名金鑰</span>
        <textarea
          className="identity-key-input"
          placeholder="貼上 Baha-Key- 開頭的匿名金鑰"
          value={anonymousKeyDraft}
          onChange={(event) => setAnonymousKeyDraft(event.target.value)}
        />
        <div className="identity-card__actions">
          <button type="button" className="paypal-btn" onClick={handleImportAnonymousKey}>套用這把金鑰</button>
        </div>
        <p className="identity-help">匯入後，這台設備接下來進入白板、聊天室時都會使用同一個匿名身份。</p>
        {identityNotice ? <p className="copy-notice">{identityNotice}</p> : null}
      </article>
    </div>
  );

  const renderTutorial = () => (
    <div className="feature-article">
      <section>
        <h2>📝 文字排版</h2>
        <table className="feature-table">
          <thead>
            <tr>
              <th>效果</th>
              <th>語法</th>
            </tr>
          </thead>
          <tbody>
            {COMMAND_FORMATTING_ROWS.map(([label, syntax]) => (
              <tr key={label}>
                <td>{label}</td>
                <td><code>{syntax}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>🎉 互動指令</h2>
        <ul className="feature-list">
          {INTERACTIVE_COMMANDS.map(([command, description]) => (
            <li key={command}><code>{command}</code>：{description}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>發起新話題指令</h2>
        <ul className="feature-list">
          {ROOM_COMMANDS.map(([command, description]) => (
            <li key={command}><code>{command}</code>：{description}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>🔍 搜尋框指令</h2>
        <ul className="feature-list">
          {SEARCH_COMMANDS.map(([command, description]) => (
            <li key={command}><code>{command}</code>：{description}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>🛡️ 管理權限指令</h2>
        <ul className="feature-list">
          {ADMIN_COMMANDS.map(([command, description]) => (
            <li key={command}><code>{command}</code>：{description}</li>
          ))}
        </ul>
      </section>
    </div>
  );

  const renderEmbedGuide = () => (
    <div className="feature-article">
      <section>
        <h2>🌐 如何嵌入各種網頁工具</h2>
        <p>你可以把其他網站提供的 iframe 嵌入碼貼進卡片內容中。系統已經會過濾危險腳本，但仍建議使用官方提供的 embed 程式碼。</p>
      </section>

      <section className="embed-guide-grid">
        {EMBED_GUIDES.map((item) => (
          <article key={item.service} className="embed-guide-card">
            <strong>{item.service}</strong>
            <p>{item.content}</p>
          </article>
        ))}
      </section>

      <section>
        <h2>💡 小提醒與安全性</h2>
        <ul className="feature-list">
          <li>只有帶特定屬性的 iframe 標籤會被放行，像 script 這種危險語法會被過濾掉。</li>
          <li>若只是一般圖片，可以直接使用 Markdown 語法：<code>![圖片說明](圖片網址)</code>。</li>
          <li>YouTube 請使用 <code>https://www.youtube.com/embed/影片ID</code>，不要直接貼 <code>watch?v=</code>。</li>
          <li>Google 地圖請使用官方「嵌入地圖」提供的 iframe，<code>maps.app.goo.gl</code> 不能直接嵌入。</li>
        </ul>
      </section>
    </div>
  );

  const renderAnnouncements = () => (
    <div className="feature-article announcement-list">
      {announcements.length === 0 ? (
        <article className="empty-card">
          <strong>目前還沒有公告</strong>
          <p>一有新公告，這裡會即時同步更新。</p>
        </article>
      ) : (
        announcements.map((item) => (
          <article key={`${item._id || item.createdAt}-${item.title}`} className="announcement-card">
            <span>{new Date(item.createdAt || Date.now()).toLocaleString()}</span>
            <strong>{item.title}</strong>
            <p>{item.content}</p>
          </article>
        ))
      )}
    </div>
  );

  const renderServerStatus = () => (
    <div className="feature-article">
      <section className="feature-summary">
        <strong>即時狀態</strong>
        <p>查看目前伺服器連線數、房間數、記憶體使用量與負載。進入這頁後會每 5 秒自動更新一次。</p>
      </section>

      {serverStatusLoading ? <div className="loading-card">讀取中...</div> : null}
      {serverStatus?.error ? <div className="empty-card">{serverStatus.error}</div> : null}

      <section className="status-grid">
        {serverStatusCards.map(([label, value, hint]) => (
          <StatusCard key={label} label={label} value={value} hint={hint} />
        ))}
      </section>
    </div>
  );

  const renderSponsor = () => (
    <div className="feature-article">
      <section className="feature-summary">
        <strong>支持開發</strong>
        <p>若你喜歡 Baha，歡迎透過下方方式補貼伺服器與開發成本。</p>
      </section>

      <article className="sponsor-card">
        <span>聯絡信箱</span>
        <strong>pudding050@gmail.com</strong>
        <div className="sponsor-card__actions">
          <button type="button" className="inline-action-btn" onClick={handleCopyEmail}>複製信箱</button>
        </div>
        {copyNotice ? <p className="copy-notice">{copyNotice}</p> : null}
      </article>

      <div className="paypal-group">
        <a className="paypal-btn" href="https://www.paypal.com/ncp/payment/VADFCCNV65CQQ" target="_blank" rel="noreferrer">
          愛心贊助 NT$30
        </a>
        <a className="paypal-btn" href="https://www.paypal.com/ncp/payment/Y5LATTJPS3EFL" target="_blank" rel="noreferrer">
          贊助方案 NT$1490
        </a>
      </div>
      <p className="paypal-hint">你可以依照想支持的方式，選擇輕量贊助或完整方案。</p>
    </div>
  );

  const renderMainContent = () => {
    switch (activeView) {
      case 'identity':
        return renderIdentity();
      case 'tutorial':
        return renderTutorial();
      case 'embed':
        return renderEmbedGuide();
      case 'announcements':
        return renderAnnouncements();
      case 'server':
        return renderServerStatus();
      case 'sponsor':
        return renderSponsor();
      default:
        return isMobileLayout ? renderMobileHome() : renderIdentity();
    }
  };

  return (
    <div className={`feature-app${reduceMotionEnabled ? ' feature-app--reduce-motion' : ''}`}>
      {!isMobileLayout && (
        <header className="feature-header">
          <div>
            <span className="feature-brand">Baha 功能中心</span>
            <p>在這裡查看指令教學、系統公告、匿名身份與贊助資訊。</p>
          </div>
          <div className="feature-header__meta">
            <a className="header-ghost-btn" href="/react-board/">返回主站</a>
            <span className={`feature-connection-chip${connected ? ' is-online' : ''}`}>{connected ? '已連線' : '連線中斷'}</span>
            <span className="feature-version-chip">v{version || '...'}</span>
          </div>
        </header>
      )}

      <div className="feature-layout">
        {!isMobileLayout && (
          <aside className="feature-sidebar">
            <nav className="feature-nav">
              {Object.entries(VIEW_TITLES)
                .filter(([key]) => key !== 'home')
                .map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`feature-nav__item${activeView === key ? ' is-active' : ''}`}
                  onClick={() => openView(key)}
                >
                  {label}
                </button>
                ))}
            </nav>

            <section className="feature-sidebar__section">
              <strong>其他入口</strong>
              <a href="/react-chat/" className="sidebar-link">⚛️ 聊天室</a>
              <a href="/react-board/" className="sidebar-link">🧩 白板大廳</a>
            </section>

            <section className="feature-sidebar__section">
              <strong>快速設定</strong>
              <button type="button" className="sidebar-toggle" onClick={() => setReduceMotionEnabled((prev) => !prev)}>
                減少動態效果
                <span>{reduceMotionEnabled ? '已啟用' : '未啟用'}</span>
              </button>
              <button type="button" className="sidebar-toggle" onClick={toggleDesktopNotifications}>
                桌面通知
                <span>{notificationsEnabled ? '已開啟' : '關閉中'}</span>
              </button>
            </section>
          </aside>
        )}

        <main className="feature-main">
          {(isMobileLayout ? activeView !== 'home' : true) && (
            <div className="feature-main__header">
              <h1>{VIEW_TITLES[activeView]}</h1>
              {isMobileLayout && activeView !== 'home' ? (
                <button type="button" className="header-ghost-btn" onClick={() => openView('home')}>
                  返回功能中心
                </button>
              ) : null}
            </div>
          )}
          {renderMainContent()}
        </main>
      </div>
    </div>
  );
}
