import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getOrCreateUserId } from './lib/userId';

const BOARD_STORAGE_KEY = 'baha-react-board-layout-v1';
const BOARD_CANVAS_SIZE_STORAGE_KEY = 'baha-react-board-canvas-size-v1';
const DEFAULT_ROUTE = '/react-chat/';
const FEATURE_ROUTE = '/react-features/';
const DESKTOP_BREAKPOINT = 980;
const BOARD_DEFAULT_CANVAS_WIDTH = 1500;
const BOARD_DEFAULT_CANVAS_HEIGHT = 980;
const BOARD_MIN_CANVAS_WIDTH = 960;
const BOARD_MIN_CANVAS_HEIGHT = 640;
const BOARD_CANVAS_PADDING = 200;
const DEFAULT_CANVAS_SIZE = {
  width: BOARD_DEFAULT_CANVAS_WIDTH,
  height: BOARD_DEFAULT_CANVAS_HEIGHT,
  padding: BOARD_CANVAS_PADDING
};
const CANVAS_SIZE_PRESETS = [
  { key: 'small', label: '小', width: 1120, height: 760, padding: 40 },
  { key: 'medium', label: '中', width: 2400, height: 1540, padding: 520 },
  { key: 'large', label: '大', width: 3400, height: 2200, padding: 900 }
];

const MODULE_LIBRARY = {
  create: {
    title: '建立房間',
    subtitle: '快速開啟一個新話題',
    width: 320,
    height: 210
  },
  search: {
    title: '搜尋話題',
    subtitle: '支援 /hot、/lock 等指令',
    width: 320,
    height: 176
  },
  rooms: {
    title: '熱門房間',
    subtitle: '直接在白板挑選',
    width: 340,
    height: 260
  },
  actions: {
    title: '建立與搜尋指令',
    subtitle: '建立房間與搜尋話題',
    width: 420,
    height: 430
  },
  sponsor: {
    title: '支持開發',
    subtitle: '每份贊助都讓 Baha 更穩定',
    width: 320,
    height: 210
  },
  custom: {
    title: '自訂模組',
    subtitle: '放入你自己的說明、清單或提醒',
    width: 320,
    height: 220
  }
};

const DEFAULT_MODULES = [
  { id: 'module-create', type: 'create', x: 28, y: 40 },
  { id: 'module-search', type: 'search', x: 408, y: 58 },
  { id: 'module-rooms', type: 'rooms', x: 844, y: 58 }
];

const ACTION_ITEMS = [
  { command: '直接輸入房名', description: '快速建立或加入公開話題' },
  { command: '/lock 密碼 房名', description: '建立帶密碼的鎖房話題' },
  { command: '/hot', description: '只看熱門話題' },
  { command: '/lock', description: '搜尋時只看鎖房' },
  { command: '/open', description: '搜尋時只看公開房間' }
];

const ROOM_BATCH_SIZE = 8;
const MOBILE_ROOM_PAGE_SIZE = 10;
const ROOM_SCROLL_THRESHOLD = 72;

function getIsDesktopViewport() {
  return window.innerWidth > DESKTOP_BREAKPOINT;
}

function loadBoardModules() {
  try {
    const stored = window.localStorage.getItem(BOARD_STORAGE_KEY);
    if (!stored) return DEFAULT_MODULES;
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_MODULES;
    return parsed.filter((item) => MODULE_LIBRARY[item.type]).map((item) => ({
      ...item
    }));
  } catch (error) {
    console.warn('board layout parse failed', error);
    return DEFAULT_MODULES;
  }
}

function normalizeCanvasSize(size) {
  return {
    width: Math.max(BOARD_MIN_CANVAS_WIDTH, Math.round(Number(size?.width) || BOARD_DEFAULT_CANVAS_WIDTH)),
    height: Math.max(BOARD_MIN_CANVAS_HEIGHT, Math.round(Number(size?.height) || BOARD_DEFAULT_CANVAS_HEIGHT)),
    padding: Math.max(0, Math.round(Number(size?.padding) || BOARD_CANVAS_PADDING))
  };
}

function loadCanvasSize() {
  try {
    const stored = window.localStorage.getItem(BOARD_CANVAS_SIZE_STORAGE_KEY);
    if (!stored) return DEFAULT_CANVAS_SIZE;
    return normalizeCanvasSize(JSON.parse(stored));
  } catch (error) {
    console.warn('board canvas size parse failed', error);
    return DEFAULT_CANVAS_SIZE;
  }
}

function getModuleSize(module) {
  const definition = MODULE_LIBRARY[module.type];
  return {
    width: module.width || definition.width,
    height: module.height || definition.height
  };
}

function clampModulePosition(module) {
  return {
    ...module,
    x: Math.max(0, module.x || 0),
    y: Math.max(0, module.y || 0)
  };
}

function getCanvasSize(modules, isDesktop, canvasSize) {
  if (!isDesktop) {
    return { width: '100%', height: 'auto' };
  }

  let width = Math.max(canvasSize?.width || BOARD_DEFAULT_CANVAS_WIDTH, BOARD_MIN_CANVAS_WIDTH);
  let height = Math.max(canvasSize?.height || BOARD_DEFAULT_CANVAS_HEIGHT, BOARD_MIN_CANVAS_HEIGHT);
  const canvasPadding = canvasSize?.padding ?? BOARD_CANVAS_PADDING;

  modules.forEach((module) => {
    const { width: moduleWidth, height: moduleHeight } = getModuleSize(module);
    width = Math.max(width, (module.x || 0) + moduleWidth + canvasPadding);
    height = Math.max(height, (module.y || 0) + moduleHeight + canvasPadding);
  });

  return {
    width: `${width}px`,
    height: `${height}px`
  };
}

function formatRelativeTime(createdAt) {
  if (!createdAt) return '剛剛';
  const diffMs = Math.max(0, Date.now() - new Date(createdAt).getTime());
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return '剛剛';
  if (diffMinutes < 60) return `${diffMinutes} 分鐘前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小時前`;
  return `${Math.floor(diffHours / 24)} 天前`;
}

function resolveSearchFilter(searchTerm) {
  const lower = searchTerm.toLowerCase();
  if (lower.includes('/hot')) return 'hot';
  if (lower.includes('/lock')) return 'locked';
  if (lower.includes('/open')) return 'open';
  return 'all';
}

function normalizeSearchKeyword(searchTerm) {
  return searchTerm.replace(/\/(hot|lock|open)\b/gi, '').trim().toLowerCase();
}

function goToChat(roomName) {
  const target = roomName ? `${DEFAULT_ROUTE}?room=${encodeURIComponent(roomName)}` : DEFAULT_ROUTE;
  window.location.assign(target);
}

function goToFeatures() {
  window.location.assign(FEATURE_ROUTE);
}

function ModuleCard({
  children,
  className = '',
  isDesktop,
  module,
  onDragStart,
  onRemove,
  onResizeStart,
  style,
  title,
  subtitle
}) {
  return (
    <article className={`board-module-card${className ? ` ${className}` : ''}`} style={style}>
      <header
        className={`board-module-card__header${isDesktop ? ' board-module-card__header--draggable' : ''}`}
        onPointerDown={isDesktop ? (event) => onDragStart(event, module.id) : undefined}
      >
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <button
          className="board-module-card__close"
          type="button"
          onClick={onRemove}
          onPointerDown={(event) => event.stopPropagation()}
          aria-label={`關閉 ${title}`}
        >
          ×
        </button>
      </header>
      <div className="board-module-card__body">{children}</div>
      {isDesktop && (
        <button
          className="board-module-card__corner"
          type="button"
          aria-label={`調整 ${title} 大小`}
          onPointerDown={(event) => onResizeStart(event, module.id)}
        />
      )}
    </article>
  );
}

export default function App() {
  const userId = useMemo(() => getOrCreateUserId(), []);
  const socketRef = useRef(null);
  const pendingCreateRoomRef = useRef('');
  const boardSurfaceRef = useRef(null);
  const createInputRef = useRef(null);
  const customTitleInputRefs = useRef(new Map());
  const pendingCustomFocusRef = useRef(null);
  const roomListRef = useRef(null);
  const searchInputRef = useRef(null);
  const modulesRef = useRef(loadBoardModules());
  const dragStateRef = useRef(null);
  const panStateRef = useRef(null);
  const resizeStateRef = useRef(null);

  const [modules, setModules] = useState(() => loadBoardModules());
  const [isDesktop, setIsDesktop] = useState(() => getIsDesktopViewport());
  const [isPanning, setIsPanning] = useState(false);
  const [canvasSize, setCanvasSize] = useState(() => loadCanvasSize());
  const [canvasSizeDraft, setCanvasSizeDraft] = useState(() => loadCanvasSize());
  const [rooms, setRooms] = useState([]);
  const [connected, setConnected] = useState(false);
  const [version, setVersion] = useState('');
  const [createRoomName, setCreateRoomName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showPalette, setShowPalette] = useState(false);
  const [showCanvasSizePanel, setShowCanvasSizePanel] = useState(false);
  const [systemNotice, setSystemNotice] = useState('');
  const [visibleRoomCount, setVisibleRoomCount] = useState(ROOM_BATCH_SIZE);
  const [mobileRoomPage, setMobileRoomPage] = useState(0);

  useEffect(() => {
    window.localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(modules));
  }, [modules]);

  useEffect(() => {
    window.localStorage.setItem(BOARD_CANVAS_SIZE_STORAGE_KEY, JSON.stringify(canvasSize));
  }, [canvasSize]);

  useEffect(() => {
    modulesRef.current = modules;
  }, [modules]);

  useEffect(() => {
    const moduleId = pendingCustomFocusRef.current;
    if (!moduleId) return;

    const titleInput = customTitleInputRefs.current.get(moduleId);
    if (!titleInput) return;

    titleInput.focus();
    titleInput.select?.();
    pendingCustomFocusRef.current = null;
  }, [modules]);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(getIsDesktopViewport());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetch('/meta/version', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => setVersion(data.version || ''))
      .catch((error) => console.warn('version fetch failed', error));
  }, []);

  useEffect(() => {
    const socket = io({
      auth: { userId }
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('room list', (list) => {
      setRooms(Array.isArray(list) ? list : []);
    });

    socket.on('room create error', (errorKey) => {
      pendingCreateRoomRef.current = '';
      if (errorKey === 'room_name_taken') {
        setSystemNotice('房間名稱已存在，請換一個。');
        return;
      }
      setSystemNotice('建立房間失敗，請稍後再試。');
    });

    socket.on('room created', ({ room }) => {
      if (!room || pendingCreateRoomRef.current !== room) return;
      pendingCreateRoomRef.current = '';
      setSystemNotice(`已建立 ${room}，正在帶你進入聊天室。`);
      window.setTimeout(() => {
        goToChat(room);
      }, 220);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId]);

  const publicRooms = useMemo(
    () => rooms.filter((room) => !room.isThread),
    [rooms]
  );

  const filteredRooms = useMemo(() => {
    const filter = resolveSearchFilter(searchTerm);
    const keyword = normalizeSearchKeyword(searchTerm);

    let next = publicRooms.slice();

    if (filter === 'locked') next = next.filter((room) => room.isLocked);
    if (filter === 'open') next = next.filter((room) => !room.isLocked);

    next.sort((a, b) => {
      if (filter === 'hot') {
        if ((b.userCount || 0) !== (a.userCount || 0)) {
          return (b.userCount || 0) - (a.userCount || 0);
        }
      }
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    if (!keyword) return next;
    return next.filter((room) => {
      const displayName = (room.displayName || '').toLowerCase();
      const roomName = (room.name || '').toLowerCase();
      return displayName.includes(keyword) || roomName.includes(keyword);
    });
  }, [publicRooms, searchTerm]);

  const hotRooms = useMemo(
    () =>
      publicRooms
        .slice()
        .sort((a, b) => {
          if ((b.userCount || 0) !== (a.userCount || 0)) {
            return (b.userCount || 0) - (a.userCount || 0);
          }
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        }),
    [publicRooms]
  );

  const roomFeedSource = useMemo(() => {
    if (searchTerm.trim()) {
      return filteredRooms;
    }
    return hotRooms;
  }, [filteredRooms, hotRooms, searchTerm]);

  const mobileRoomPageCount = useMemo(
    () => Math.max(1, Math.ceil(roomFeedSource.length / MOBILE_ROOM_PAGE_SIZE)),
    [roomFeedSource.length]
  );

  const visibleRooms = useMemo(
    () => {
      if (!isDesktop) {
        const startIndex = mobileRoomPage * MOBILE_ROOM_PAGE_SIZE;
        return roomFeedSource.slice(startIndex, startIndex + MOBILE_ROOM_PAGE_SIZE);
      }

      return roomFeedSource.slice(0, visibleRoomCount);
    },
    [isDesktop, mobileRoomPage, roomFeedSource, visibleRoomCount]
  );

  useEffect(() => {
    setVisibleRoomCount(Math.min(ROOM_BATCH_SIZE, roomFeedSource.length));
    setMobileRoomPage(0);
    if (roomListRef.current) {
      roomListRef.current.scrollTop = 0;
    }
  }, [roomFeedSource]);

  useEffect(() => {
    const roomListNode = roomListRef.current;
    if (!roomListNode || !isDesktop) return;
    if (visibleRooms.length === 0 || visibleRooms.length >= roomFeedSource.length) return;

    if (roomListNode.scrollHeight <= roomListNode.clientHeight + ROOM_SCROLL_THRESHOLD) {
      setVisibleRoomCount((current) => Math.min(current + ROOM_BATCH_SIZE, roomFeedSource.length));
    }
  }, [isDesktop, roomFeedSource.length, visibleRooms.length]);

  const handleRoomListScroll = (event) => {
    const roomListNode = event.currentTarget;
    const reachedBottom =
      roomListNode.scrollTop + roomListNode.clientHeight >= roomListNode.scrollHeight - ROOM_SCROLL_THRESHOLD;

    if (!reachedBottom) return;

    setVisibleRoomCount((current) => {
      if (current >= roomFeedSource.length) return current;
      return Math.min(current + ROOM_BATCH_SIZE, roomFeedSource.length);
    });
  };

  const handleCreateRoom = () => {
    const roomName = createRoomName.trim();
    if (!roomName || !socketRef.current) return;
    pendingCreateRoomRef.current = roomName;
    setSystemNotice('');
    socketRef.current.emit('create room', { name: roomName });
    setCreateRoomName('');
  };

  const handleResetLayout = () => {
    setModules(DEFAULT_MODULES);
    setShowPalette(false);
    setSystemNotice('已恢復預設白板佈局');
  };

  const togglePalette = () => {
    setShowCanvasSizePanel(false);
    setShowPalette((open) => !open);
  };

  const toggleCanvasSizePanel = () => {
    setCanvasSizeDraft(canvasSize);
    setShowPalette(false);
    setShowCanvasSizePanel((open) => !open);
  };

  const handleAddModule = (type) => {
    const blueprint = MODULE_LIBRARY[type];
    if (!blueprint) return;

    const nextIndex = modules.length;
    setModules((prev) => [
      ...prev,
      {
        id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type,
        x: 42 + (nextIndex % 3) * 36,
        y: 56 + nextIndex * 26,
        width: blueprint.width,
        height: blueprint.height
      }
    ]);
    setShowPalette(false);
  };

  const visiblePaletteItems = useMemo(() => {
    if (isDesktop) {
      return Object.entries(MODULE_LIBRARY).filter(([type]) => type !== 'custom');
    }

    return [
      ...Object.entries(MODULE_LIBRARY).filter(([type]) => type !== 'custom'),
      ['custom', MODULE_LIBRARY.custom]
    ];
  }, [isDesktop]);

  const handleCreateBlankCustomModule = () => {
    const moduleId = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    setModules((prev) => [
      ...prev,
      {
        id: moduleId,
        type: 'custom',
        x: 60,
        y: 60,
        width: MODULE_LIBRARY.custom.width,
        height: MODULE_LIBRARY.custom.height,
        data: {
          title: '',
          content: '',
          isEditing: true
        }
      }
    ]);

    pendingCustomFocusRef.current = moduleId;
    setShowPalette(false);
    setSystemNotice('已建立空白自訂模組，直接在卡片內填寫內容。');
  };

  const handleRemoveModule = (id) => {
    setModules((prev) => prev.filter((module) => module.id !== id));
  };

  const updateCustomModule = (moduleId, nextData) => {
    setModules((currentModules) =>
      currentModules.map((module) => {
        if (module.id !== moduleId) return module;
        return {
          ...module,
          data: {
            ...module.data,
            ...nextData
          }
        };
      })
    );
  };

  const registerCustomTitleInput = (moduleId, node) => {
    if (!node) {
      customTitleInputRefs.current.delete(moduleId);
      return;
    }
    customTitleInputRefs.current.set(moduleId, node);
  };

  const handleApplyCanvasSize = () => {
    const nextSize = normalizeCanvasSize(canvasSizeDraft);
    setCanvasSize(nextSize);
    setCanvasSizeDraft(nextSize);
    setShowCanvasSizePanel(false);
    setSystemNotice(`已更新版面大小為 ${nextSize.width} × ${nextSize.height}`);
  };

  const handleResetCanvasSize = () => {
    setCanvasSize(DEFAULT_CANVAS_SIZE);
    setCanvasSizeDraft(DEFAULT_CANVAS_SIZE);
    setShowCanvasSizePanel(false);
    setSystemNotice('已恢復預設版面大小');
  };

  const handleApplyCanvasPreset = (preset) => {
    const nextSize = normalizeCanvasSize(preset);
    setCanvasSize(nextSize);
    setCanvasSizeDraft(nextSize);
    setShowCanvasSizePanel(false);
    setSystemNotice(`已切換為${preset.label}版面：${nextSize.width} × ${nextSize.height}`);
  };

  useEffect(() => {
    if (!isDesktop) return undefined;

    const handlePointerMove = (event) => {
      const panState = panStateRef.current;
      if (panState && boardSurfaceRef.current) {
        event.preventDefault();
        boardSurfaceRef.current.scrollLeft = panState.startScrollLeft - (event.clientX - panState.startX);
        boardSurfaceRef.current.scrollTop = panState.startScrollTop - (event.clientY - panState.startY);
        return;
      }

      const dragState = dragStateRef.current;
      if (dragState) {
        const dx = event.clientX - dragState.startX;
        const dy = event.clientY - dragState.startY;

        setModules((currentModules) =>
          currentModules.map((module) => {
            if (module.id !== dragState.moduleId) return module;
            return clampModulePosition({
              ...module,
              x: dragState.originX + dx,
              y: dragState.originY + dy
            });
          })
        );
        return;
      }

      const resizeState = resizeStateRef.current;
      if (!resizeState) return;

      const dx = event.clientX - resizeState.startX;
      const dy = event.clientY - resizeState.startY;

      setModules((currentModules) =>
        currentModules.map((module) => {
          if (module.id !== resizeState.moduleId) return module;
          return {
            ...module,
            width: Math.max(resizeState.startWidth + dx, 260),
            height: Math.max(resizeState.startHeight + dy, 150)
          };
        })
      );
    };

    const handlePointerUp = () => {
      if (!dragStateRef.current && !resizeStateRef.current && !panStateRef.current) return;
      dragStateRef.current = null;
      panStateRef.current = null;
      resizeStateRef.current = null;
      setIsPanning(false);
      document.body.style.userSelect = '';
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDesktop]);

  useEffect(() => {
    if (isDesktop) return;
    panStateRef.current = null;
    setIsPanning(false);
  }, [isDesktop]);

  const handleDragStart = (event, moduleId) => {
    if (!isDesktop || event.button !== 0) return;
    const module = modulesRef.current.find((item) => item.id === moduleId);
    if (!module) return;

    event.preventDefault();
    dragStateRef.current = {
      moduleId,
      startX: event.clientX,
      startY: event.clientY,
      originX: module.x || 0,
      originY: module.y || 0
    };
    resizeStateRef.current = null;
    document.body.style.userSelect = 'none';
  };

  const handleResizeStart = (event, moduleId) => {
    if (!isDesktop || event.button !== 0) return;
    const module = modulesRef.current.find((item) => item.id === moduleId);
    if (!module) return;

    const { width, height } = getModuleSize(module);
    event.preventDefault();
    event.stopPropagation();
    resizeStateRef.current = {
      moduleId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: width,
      startHeight: height
    };
    dragStateRef.current = null;
    panStateRef.current = null;
    document.body.style.userSelect = 'none';
  };

  const handleSurfacePointerDown = (event) => {
    if (!isDesktop || event.button !== 2 || !boardSurfaceRef.current) return;
    if (event.target.closest('.board-module-card')) return;

    event.preventDefault();
    dragStateRef.current = null;
    resizeStateRef.current = null;
    panStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: boardSurfaceRef.current.scrollLeft,
      startScrollTop: boardSurfaceRef.current.scrollTop
    };
    setIsPanning(true);
    document.body.style.userSelect = 'none';
  };

  const handleSurfaceContextMenu = (event) => {
    if (!isDesktop) return;
    if (event.target.closest('.board-module-card')) return;
    event.preventDefault();
  };

  const renderModule = (module) => {
    const definition = MODULE_LIBRARY[module.type];
    const size = getModuleSize(module);
    const sharedProps = {
      key: module.id,
      isDesktop,
      module,
      onDragStart: handleDragStart,
      onRemove: () => handleRemoveModule(module.id),
      onResizeStart: handleResizeStart,
      style: {
        '--module-x': `${module.x}px`,
        '--module-y': `${module.y}px`,
        '--module-width': `${size.width}px`,
        '--module-height': `${size.height}px`
      },
      title: definition.title,
      subtitle: definition.subtitle
    };

    if (module.type === 'create') {
      return (
        <ModuleCard {...sharedProps}>
          <input
            ref={createInputRef}
            className="board-input"
            placeholder="輸入房間名稱"
            value={createRoomName}
            onChange={(event) => setCreateRoomName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleCreateRoom();
              }
            }}
          />
          <button className="board-primary-btn" type="button" onClick={handleCreateRoom}>
            立即建立
          </button>
        </ModuleCard>
      );
    }

    if (module.type === 'search') {
      return (
        <ModuleCard {...sharedProps}>
          <input
            ref={searchInputRef}
            className="board-input"
            placeholder="搜尋話題 /hot /lock"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </ModuleCard>
      );
    }

    if (module.type === 'rooms') {
      const roomModuleTitle = searchTerm.trim() ? '搜尋結果' : definition.title;
      const roomModuleSubtitle = searchTerm.trim() ? '依照輸入條件即時篩選' : definition.subtitle;
      return (
        <ModuleCard
          {...sharedProps}
          className="board-module-card--rooms"
          title={roomModuleTitle}
          subtitle={roomModuleSubtitle}
        >
          <div
            ref={roomListRef}
            className="board-room-list board-room-list--scrollable"
            onScroll={isDesktop ? handleRoomListScroll : undefined}
          >
                {visibleRooms.length > 0 ? (
                  <>
                    {visibleRooms.map((room) => (
                      <button
                        key={room.name}
                    className="board-room-item"
                    type="button"
                    onClick={() => goToChat(room.name)}
                  >
                    <strong>{room.displayName || room.name}</strong>
                    <span>{room.userCount || 0} 人</span>
                    <em>{formatRelativeTime(room.createdAt)}</em>
                  </button>
                ))}
                    {isDesktop && visibleRooms.length < roomFeedSource.length && (
                      <p className="board-room-list__status">繼續往下滑，會自動載入更多熱門房間</p>
                    )}
                  </>
                ) : (
                  <p className="board-empty-text">
                    {searchTerm.trim() ? '目前沒有符合搜尋條件的房間' : '還沒有公開房間'}
                  </p>
                )}
              </div>
              {!isDesktop && roomFeedSource.length > MOBILE_ROOM_PAGE_SIZE && (
                <div className="board-room-pagination">
                  <button
                    className="board-room-pagination__btn"
                    type="button"
                    disabled={mobileRoomPage <= 0}
                    onClick={() => setMobileRoomPage((current) => Math.max(current - 1, 0))}
                    aria-label="上一頁房間"
                  >
                    ←
                  </button>
                  <span className="board-room-pagination__status">
                    {mobileRoomPage + 1} / {mobileRoomPageCount}
                  </span>
                  <button
                    className="board-room-pagination__btn"
                    type="button"
                    disabled={mobileRoomPage >= mobileRoomPageCount - 1}
                    onClick={() => setMobileRoomPage((current) => Math.min(current + 1, mobileRoomPageCount - 1))}
                    aria-label="下一頁房間"
                  >
                    →
                  </button>
                </div>
              )}
            </ModuleCard>
          );
    }

    if (module.type === 'actions') {
      return (
        <ModuleCard {...sharedProps}>
          <div className="board-action-list">
            {ACTION_ITEMS.map((item) => (
              <button
                key={item.command}
                className="board-action-item"
                type="button"
                onClick={() => {
                  if (item.command === '直接輸入房名') {
                    createInputRef.current?.focus();
                    setSystemNotice('已聚焦建立房間輸入框。');
                    return;
                  }

                  if (item.command.startsWith('/')) {
                    setSearchTerm(item.command);
                    searchInputRef.current?.focus();
                    setSystemNotice(`已套用搜尋指令：${item.command}`);
                  }
                }}
              >
                <strong>{item.command}</strong>
                <span>{item.description}</span>
              </button>
            ))}
          </div>
        </ModuleCard>
      );
    }

    if (module.type === 'sponsor') {
      return (
        <ModuleCard {...sharedProps}>
          <div className="board-sponsor-block">
            <strong>Email</strong>
            <span>pudding050@gmail.com</span>
          </div>
          <div className="board-sponsor-links">
            <a
              className="board-sponsor-link"
              href="https://www.paypal.com/ncp/payment/VADFCCNV65CQQ"
              rel="noreferrer"
              target="_blank"
            >
              愛心贊助 NT$30
            </a>
            <a
              className="board-sponsor-link"
              href="https://www.paypal.com/ncp/payment/Y5LATTJPS3EFL"
              rel="noreferrer"
              target="_blank"
            >
              贊助方案 NT$1490
            </a>
          </div>
        </ModuleCard>
      );
    }

    if (module.type === 'custom') {
      const isEditing = module.data?.isEditing ?? (!module.data?.title && !module.data?.content);
      return (
        <ModuleCard
          {...sharedProps}
          title={module.data?.title || definition.title}
          subtitle={isEditing ? '直接在卡片裡編輯標題與內容' : definition.subtitle}
        >
          {isEditing ? (
            <div className="board-custom-editor">
              <input
                ref={(node) => registerCustomTitleInput(module.id, node)}
                className="board-input"
                placeholder="模組標題"
                value={module.data?.title || ''}
                onChange={(event) => updateCustomModule(module.id, { title: event.target.value, isEditing: true })}
              />
              <textarea
                className="board-textarea"
                placeholder="模組內容"
                value={module.data?.content || ''}
                onChange={(event) => updateCustomModule(module.id, { content: event.target.value, isEditing: true })}
              />
              <div className="board-custom-editor__actions">
                <button
                  className="board-primary-btn"
                  type="button"
                  onClick={() => {
                    updateCustomModule(module.id, { isEditing: false });
                    setSystemNotice(`已儲存自訂模組：${(module.data?.title || '未命名模組').trim() || '未命名模組'}`);
                  }}
                >
                  完成編輯
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="board-custom-content">{module.data?.content || '尚未填入內容'}</div>
              <div className="board-custom-editor__actions">
                <button
                  className="board-toolbar__btn board-toolbar__btn--inline"
                  type="button"
                  onClick={() => updateCustomModule(module.id, { isEditing: true })}
                >
                  編輯內容
                </button>
              </div>
            </>
          )}
        </ModuleCard>
      );
    }

    return null;
  };

  if (!isDesktop) {
    return (
      <div className="board-mobile-page">
        <header className="board-mobile-header">
          <div className="board-mobile-header__spacer" aria-hidden="true" />
          <div className="board-mobile-header__title">
            <span>Baha-chat</span>
          </div>
          <button className="board-mobile-feature-btn" type="button" onClick={goToFeatures}>
            功能
          </button>
        </header>

        {systemNotice && <div className="board-mobile-notice">{systemNotice}</div>}

        <main className="board-mobile-main">
          <section className="board-mobile-card board-mobile-card--create">
            <input
              ref={createInputRef}
              className="board-mobile-input"
              placeholder="建立新房間..."
              value={createRoomName}
              onChange={(event) => setCreateRoomName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleCreateRoom();
                }
              }}
            />
            <button className="board-mobile-create-btn" type="button" onClick={handleCreateRoom}>
              建立
            </button>
          </section>

          <section className="board-mobile-search">
            <input
              ref={searchInputRef}
              className="board-mobile-input board-mobile-input--search"
              placeholder="🔎 搜尋話題..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </section>

          <div className="board-mobile-divider" />

          <section className="board-mobile-card board-mobile-card--rooms">
            <div className="board-mobile-room-list">
              {visibleRooms.length > 0 ? (
                visibleRooms.map((room) => (
                  <button
                    key={room.name}
                    type="button"
                    className="board-mobile-room-item"
                    onClick={() => goToChat(room.name)}
                  >
                    <span className="board-mobile-room-item__name">
                      {room.isLocked ? '🔒 ' : '💬 '}
                      {room.displayName || room.name}
                    </span>
                    <span className="board-mobile-room-item__meta">
                      <em>👤 {room.userCount || 0}</em>
                      <strong>{formatRelativeTime(room.createdAt)}</strong>
                    </span>
                  </button>
                ))
              ) : (
                <p className="board-mobile-empty">
                  {searchTerm.trim() ? '目前沒有符合搜尋條件的房間' : '目前還沒有可顯示的房間'}
                </p>
              )}
            </div>

            {roomFeedSource.length > MOBILE_ROOM_PAGE_SIZE && (
              <div className="board-mobile-pagination">
                <button
                  className="board-mobile-pagination__btn"
                  type="button"
                  aria-label="上一頁房間"
                  disabled={mobileRoomPage <= 0}
                  onClick={() => setMobileRoomPage((current) => Math.max(current - 1, 0))}
                >
                  ←
                </button>
                <button
                  className="board-mobile-pagination__btn"
                  type="button"
                  aria-label="下一頁房間"
                  disabled={mobileRoomPage >= mobileRoomPageCount - 1}
                  onClick={() => setMobileRoomPage((current) => Math.min(current + 1, mobileRoomPageCount - 1))}
                >
                  →
                </button>
              </div>
            )}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="board-page-shell">
      <header className="board-page-header">
        <div>
          <span className="board-page-brand">Baha-chat</span>
        </div>

        <div className={`board-toolbar${isDesktop ? '' : ' board-toolbar--mobile'}`}>
          <button className="board-toolbar__btn" type="button" onClick={togglePalette}>
            新增組件
          </button>
          {isDesktop && (
            <>
              <button className="board-toolbar__btn" type="button" onClick={handleCreateBlankCustomModule}>
                新增自訂模組
              </button>
              <button className="board-toolbar__btn" type="button" onClick={toggleCanvasSizePanel}>
                版面大小
              </button>
              <button className="board-toolbar__btn" type="button" onClick={handleResetLayout}>
                重置佈局
              </button>
              <button className="board-toolbar__btn" type="button" onClick={goToFeatures}>
                功能
              </button>
            </>
          )}
        </div>
      </header>

      {showPalette && (
        <div className="board-floating-panel board-floating-panel--palette">
          {visiblePaletteItems.map(([type, info]) => (
            <button
              key={type}
              className="board-floating-panel__item"
              type="button"
              onClick={() => {
                if (type === 'custom') {
                  handleCreateBlankCustomModule();
                  return;
                }
                handleAddModule(type);
              }}
            >
              <strong>{info.title}</strong>
              <span>{info.subtitle}</span>
            </button>
          ))}
        </div>
      )}

      {showCanvasSizePanel && (
        <div className="board-floating-panel board-floating-panel--canvas">
          <div className="board-canvas-size-panel">
            <strong>設定版面大小</strong>
            <span>調整白板畫布的基準寬高，畫布仍會依模組位置自動撐大。</span>
            <div className="board-canvas-presets">
              {CANVAS_SIZE_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  className="board-canvas-presets__btn"
                  type="button"
                  onClick={() => handleApplyCanvasPreset(preset)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <label className="board-size-field">
              <span>寬度</span>
              <input
                className="board-input"
                type="number"
                min={BOARD_MIN_CANVAS_WIDTH}
                step="20"
                value={canvasSizeDraft.width}
                onChange={(event) =>
                  setCanvasSizeDraft((prev) => ({
                    ...prev,
                    width: event.target.value
                  }))
                }
              />
            </label>
            <label className="board-size-field">
              <span>高度</span>
              <input
                className="board-input"
                type="number"
                min={BOARD_MIN_CANVAS_HEIGHT}
                step="20"
                value={canvasSizeDraft.height}
                onChange={(event) =>
                  setCanvasSizeDraft((prev) => ({
                    ...prev,
                    height: event.target.value
                  }))
                }
              />
            </label>
            <div className="board-canvas-size-panel__actions">
              <button className="board-toolbar__btn board-toolbar__btn--inline" type="button" onClick={handleResetCanvasSize}>
                恢復預設
              </button>
              <button className="board-primary-btn" type="button" onClick={handleApplyCanvasSize}>
                套用尺寸
              </button>
            </div>
          </div>
        </div>
      )}

      {systemNotice && <div className="board-notice">{systemNotice}</div>}

      <section
        ref={boardSurfaceRef}
        className={`board-surface-react${isPanning ? ' board-surface-react--panning' : ''}`}
        onContextMenu={handleSurfaceContextMenu}
        onPointerDown={handleSurfacePointerDown}
      >
        <div className="board-canvas-react" style={getCanvasSize(modules, isDesktop, canvasSize)}>
          {modules.map(renderModule)}
        </div>
      </section>

      <div className="board-version-chip">VERSION {version ? `v${version}` : '讀取中'}</div>
    </div>
  );
}
