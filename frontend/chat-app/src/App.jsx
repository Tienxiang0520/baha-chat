import { useEffect, useState } from 'react';
import AdminTokenBanner from './components/AdminTokenBanner';
import ChatHeader from './components/ChatHeader';
import Composer from './components/Composer';
import ContextMenu from './components/ContextMenu';
import MessageList from './components/MessageList';
import Sidebar from './components/Sidebar';
import ThreadBanner from './components/ThreadBanner';
import { useChatSocket } from './hooks/useChatSocket';

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
  const [contextMenu, setContextMenu] = useState({
    open: false,
    x: 0,
    y: 0,
    message: null
  });

  const {
    adminToken,
    connected,
    createThread,
    currentRoom,
    currentRoomDisplayName,
    activeThreadParent,
    activeThreadTitle,
    joinError,
    joinRoom,
    messages,
    rooms,
    sendMessage,
    sendTyping,
    scheduleTypingStop,
    setAdminToken,
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
    const height = 156;
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
      text: contextMenu.message.text
    });
    closeContextMenu();
  };

  const handleThreadFromMenu = () => {
    if (!contextMenu.message) return;
    handleCreateThread(contextMenu.message);
    closeContextMenu();
  };

  const handleCopyAdminToken = async () => {
    if (!adminToken) return;
    try {
      await navigator.clipboard.writeText(adminToken);
      setSystemNotice('已複製房主管理金鑰');
    } catch (error) {
      console.warn('copy admin token failed', error);
      setSystemNotice('複製管理金鑰失敗，請再試一次');
    }
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
  const mainSiteRoom = activeThreadParent || currentRoom;
  const mainSiteHref = mainSiteRoom
    ? `/?room=${encodeURIComponent(mainSiteRoom)}`
    : '/';

  return (
    <div className="app-shell">
      <Sidebar
        activeThreadParent={activeThreadParent}
        activeThreadTitle={activeThreadTitle}
        adminToken={adminToken}
        connected={connected}
        currentRoom={currentRoom}
        currentRoomDisplayName={currentRoomDisplayName}
        mainSiteHref={mainSiteHref}
        onCopyRoomLink={handleCopyRoomLink}
        onFocusComposer={focusComposer}
        onJoinRoom={handleJoinRoomFromSidebar}
        onUseCommand={handleUseCommand}
        rooms={rooms}
        userId={userId}
      />

      <main className="chat-shell app-card">
        <ChatHeader
          connected={connected}
          currentRoomDisplayName={
            currentRoom
              ? activeThreadTitle || currentRoomDisplayName || currentRoom
              : ''
          }
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

        <AdminTokenBanner
          onCopy={handleCopyAdminToken}
          token={adminToken}
          onDismiss={() => setAdminToken('')}
        />

        <MessageList
          currentRoom={currentRoom}
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
          menu={contextMenu}
          onClose={closeContextMenu}
          onCopy={handleCopyMessage}
          onReply={handleReplyFromMenu}
          onThread={handleThreadFromMenu}
        />
      </main>
    </div>
  );
}
