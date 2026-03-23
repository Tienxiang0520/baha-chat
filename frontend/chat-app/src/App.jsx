import { useEffect, useState } from 'react';
import ChatHeader from './components/ChatHeader';
import Composer from './components/Composer';
import ContextMenu from './components/ContextMenu';
import MessageList from './components/MessageList';
import Sidebar from './components/Sidebar';
import ThreadBanner from './components/ThreadBanner';
import { useChatSocket } from './hooks/useChatSocket';

const MOBILE_BREAKPOINT = 980;

const ERROR_MESSAGES = {
  room_name_taken: '房間名稱已存在，請換一個。',
  room_create_failed: '無法建立房間，請稍後再試。',
  room_not_found: '找不到該房間。',
  wrong_password: '密碼錯誤。',
  room_banned: '你已被此房間封鎖。'
};

export default function App() {
  const [version, setVersion] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [draftValue, setDraftValue] = useState('');
  const [markdownEnabled, setMarkdownEnabled] = useState(true);
  const [composerFocusKey, setComposerFocusKey] = useState(0);
  const [isMobileLayout, setIsMobileLayout] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT);
  const [contextMenu, setContextMenu] = useState({
    open: false,
    x: 0,
    y: 0,
    message: null
  });

  const {
    connected,
    createThread,
    currentRoom,
    currentRoomDisplayName,
    activeThreadParent,
    activeThreadTitle,
    isRoomOwner,
    joinError,
    joinRoom,
    kickUser,
    messages,
    rooms,
    sendMessage,
    sendTyping,
    scheduleTypingStop,
    setJoinError,
    setSystemNotice,
    systemNotice,
    typingUsers,
    userId,
    votePoll
  } = useChatSocket();

  useEffect(() => {
    let alive = true;

    fetch('/meta/version', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (!alive) return;
        setVersion(data.version || '');
      })
      .catch((error) => {
        console.warn('version fetch failed', error);
      });

    return () => {
      alive = false;
    };
  }, []);

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
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const handleJoinThread = (roomName, title) => {
    joinRoom(roomName, null, {
      parentRoom: currentRoom,
      threadTitle: title
    });
  };

  const handleCreateThread = (message) => {
    const defaultTitle = message.text?.slice(0, 60).trim() || '新討論串';
    createThread(message.mid || message._id, defaultTitle);
  };

  const handleOpenContextMenu = (event, message) => {
    const width = 220;
    const canKickFromMenu = Boolean(
      isRoomOwner && message?.id && message.id !== 'System' && message.id !== userId
    );
    const height = canKickFromMenu ? 204 : 156;
    setContextMenu({
      open: true,
      x: Math.max(12, Math.min(event.clientX, window.innerWidth - width - 12)),
      y: Math.max(12, Math.min(event.clientY, window.innerHeight - height - 12)),
      message
    });
  };

  const closeContextMenu = () => {
    setContextMenu({
      open: false,
      x: 0,
      y: 0,
      message: null
    });
  };

  const handleCopyMessage = async () => {
    if (!contextMenu.message?.text) return;
    try {
      await navigator.clipboard.writeText(contextMenu.message.text);
      setSystemNotice('已複製訊息文字');
    } catch (error) {
      console.warn('copy message failed', error);
      setSystemNotice('複製失敗，請再試一次');
    }
    closeContextMenu();
  };

  const handleReplyFromMenu = () => {
    if (!contextMenu.message) return;
    setReplyingTo({
      id: contextMenu.message.id,
      displayName: contextMenu.message.displayName || '',
      text: contextMenu.message.text
    });
    closeContextMenu();
  };

  const handleThreadFromMenu = () => {
    if (!contextMenu.message) return;
    handleCreateThread(contextMenu.message);
    closeContextMenu();
  };

  const handleKickFromMenu = () => {
    if (!contextMenu.message?.id || contextMenu.message.id === userId) return;
    kickUser(contextMenu.message.id);
    closeContextMenu();
  };

  const focusComposer = () => {
    setComposerFocusKey((value) => value + 1);
  };

  const handleCopyRoomLink = async () => {
    if (!currentRoom) return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setSystemNotice('已複製房間連結');
    } catch (error) {
      console.warn('copy room link failed', error);
      setSystemNotice('複製房間連結失敗，請再試一次');
    }
  };

  const handleUseCommand = (template) => {
    setDraftValue(template);
    focusComposer();
  };

  const handleJoinRoomFromSidebar = (roomName, displayName) => {
    if (!roomName) return;
    joinRoom(roomName, null, {
      roomDisplayName: displayName || roomName
    });
  };

  const parentRoomDisplayName =
    rooms.find((room) => room.name === activeThreadParent)?.displayName || activeThreadParent;
  const mainSiteHref = '/react-board/';
  const canKickFromContextMenu = Boolean(
    isRoomOwner &&
    contextMenu.message?.id &&
    contextMenu.message.id !== 'System' &&
    contextMenu.message.id !== userId
  );

  return (
    <div className="app-shell">
      {!isMobileLayout && (
        <Sidebar
          activeThreadParent={activeThreadParent}
          activeThreadTitle={activeThreadTitle}
          connected={connected}
          currentRoom={currentRoom}
          currentRoomDisplayName={currentRoomDisplayName}
          isRoomOwner={isRoomOwner}
          mainSiteHref={mainSiteHref}
          onCopyRoomLink={handleCopyRoomLink}
          onFocusComposer={focusComposer}
          onJoinRoom={handleJoinRoomFromSidebar}
          onUseCommand={handleUseCommand}
          rooms={rooms}
          userId={userId}
        />
      )}

      <main className="chat-shell app-card">
        <ChatHeader
          connected={connected}
          currentRoomDisplayName={
            currentRoom
              ? activeThreadTitle || currentRoomDisplayName || currentRoom
              : ''
          }
          isMobile={isMobileLayout}
          mainSiteHref={mainSiteHref}
          userId={userId}
          version={version}
        />

        {joinError && (
          <div className="notice notice--warning notice--dismissable">
            <span>{ERROR_MESSAGES[joinError] || joinError}</span>
            <button className="notice__close" type="button" onClick={() => setJoinError('')}>
              關閉
            </button>
          </div>
        )}

        {systemNotice && (
          <div className="notice notice--dismissable">
            <span>{systemNotice}</span>
            <button className="notice__close" type="button" onClick={() => setSystemNotice('')}>
              關閉
            </button>
          </div>
        )}

        <ThreadBanner
          activeThreadParent={activeThreadParent}
          activeThreadTitle={activeThreadTitle}
          onBack={() =>
            joinRoom(activeThreadParent, null, {
              roomDisplayName: parentRoomDisplayName
            })
          }
          parentDisplayName={parentRoomDisplayName}
        />

        <MessageList
          currentRoom={currentRoom}
          isMobile={isMobileLayout}
          messages={messages}
          onContextMenu={handleOpenContextMenu}
          onCreateThread={handleCreateThread}
          onJoinThread={handleJoinThread}
          onReply={setReplyingTo}
          onVote={votePoll}
          userId={userId}
        />

        <Composer
          currentRoom={currentRoom}
          draftValue={draftValue}
          focusRequestKey={composerFocusKey}
          isMobile={isMobileLayout}
          markdownEnabled={markdownEnabled}
          onDraftChange={setDraftValue}
          onSend={sendMessage}
          onToggleMarkdown={() => setMarkdownEnabled((value) => !value)}
          onTyping={(typing) => {
            sendTyping(typing);
            if (typing) {
              scheduleTypingStop();
            }
          }}
          replyingTo={replyingTo}
          setReplyingTo={setReplyingTo}
          typingUsers={typingUsers}
        />

        <ContextMenu
          isMobile={isMobileLayout}
          menu={contextMenu}
          onClose={closeContextMenu}
          onCopy={handleCopyMessage}
          onKick={handleKickFromMenu}
          onReply={handleReplyFromMenu}
          onThread={handleThreadFromMenu}
          showKick={canKickFromContextMenu}
        />
      </main>
    </div>
  );
}
