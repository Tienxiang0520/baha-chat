import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getOrCreateUserId } from '../lib/userId';

const POLL_VOTE_STORAGE_PREFIX = 'baha-poll-vote:';
const TYPING_INACTIVITY_MS = 2500;

function updateMessageById(list, messageId, updater) {
  return list.map((entry) => {
    const currentId = entry.mid || entry._id;
    if (currentId !== messageId) return entry;
    return updater(entry);
  });
}

function attachStoredVoteSelection(message, userId) {
  if (!message?.poll?.id) return message;
  const storedSelection = window.localStorage.getItem(
    `${POLL_VOTE_STORAGE_PREFIX}${userId}:${message.poll.id}`
  );
  if (storedSelection === null) return message;

  const selectedOptionIndex = Number(storedSelection);
  if (!Number.isInteger(selectedOptionIndex)) return message;

  return {
    ...message,
    poll: {
      ...message.poll,
      selectedOptionIndex
    }
  };
}

export function useChatSocket() {
  const userId = useMemo(() => getOrCreateUserId(), []);
  const socketRef = useRef(null);
  const pendingJoinRef = useRef(null);
  const pendingCreatedRoomRef = useRef('');
  const roomFromUrlRef = useRef(
    new URLSearchParams(window.location.search).get('room') || ''
  );
  const roomPasswordCacheRef = useRef(new Map());
  const typingTimerRef = useRef(null);
  const typingMapRef = useRef(new Map());
  const currentRoomRef = useRef('');

  const [connected, setConnected] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState('');
  const [currentRoomDisplayName, setCurrentRoomDisplayName] = useState('');
  const [currentRoomIsOwner, setCurrentRoomIsOwner] = useState(false);
  const [activeThreadParent, setActiveThreadParent] = useState('');
  const [activeThreadTitle, setActiveThreadTitle] = useState('');
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [joinError, setJoinError] = useState('');
  const [systemNotice, setSystemNotice] = useState('');

  useEffect(() => {
    currentRoomRef.current = currentRoom;
  }, [currentRoom]);

  const syncRoomUrl = (roomName = '') => {
    const url = new URL(window.location.href);
    if (roomName) {
      url.searchParams.set('room', roomName);
    } else {
      url.searchParams.delete('room');
    }
    window.history.replaceState(null, '', url.toString());
  };

  const clearTypingState = () => {
    typingMapRef.current.clear();
    setTypingUsers([]);
  };

  const appendSystemNotice = (text) => {
    setSystemNotice(text);
    setMessages((prev) => [
      ...prev,
      {
        id: 'System',
        text,
        timestamp: Date.now(),
        useMarkdown: false
      }
    ]);
  };

  const resetCurrentRoomState = (notice = '') => {
    pendingJoinRef.current = null;
    setCurrentRoom('');
    setCurrentRoomDisplayName('');
    setCurrentRoomIsOwner(false);
    setActiveThreadParent('');
    setActiveThreadTitle('');
    setMessages([]);
    setJoinError('');
    clearTypingState();
    syncRoomUrl('');
    if (notice) {
      setSystemNotice(notice);
    }
  };

  const requestRoomPassword = (displayName) =>
    window.prompt(`「${displayName || '此房間'}」已上鎖，請輸入密碼：`);

  const joinRoom = (roomName, password = null, options = {}) => {
    if (!roomName || !socketRef.current) return;
    pendingJoinRef.current = {
      roomName,
      password,
      displayName: options.roomDisplayName || roomName,
      parentRoom: options.parentRoom || '',
      threadTitle: options.threadTitle || '',
      silent: Boolean(options.silent)
    };
    setJoinError('');
    if (options.parentRoom) {
      setActiveThreadParent(options.parentRoom);
    }
    if (options.threadTitle) {
      setActiveThreadTitle(options.threadTitle);
    }
    socketRef.current.emit('join room', { name: roomName, password });
  };

  const createRoom = (name, password = null) => {
    if (!name.trim() || !socketRef.current) return;
    pendingCreatedRoomRef.current = name.trim();
    setJoinError('');
    setSystemNotice('');
    socketRef.current.emit('create room', { name: name.trim(), password });
  };

  const sendMessage = ({ text, useMarkdown, replyTo }) => {
    const targetRoom = currentRoomRef.current;
    const socket = socketRef.current;

    if (!text.trim()) return false;

    if (!targetRoom) {
      setSystemNotice('目前尚未加入房間，請先選一個房間。');
      return false;
    }

    if (!socket?.connected) {
      setSystemNotice('目前尚未連線完成，請稍後再試。');
      return false;
    }

    socket.emit('chat message', {
      room: targetRoom,
      text,
      useMarkdown,
      replyTo
    });

    return true;
  };

  const createThread = (messageId, title) => {
    if (!currentRoom || !messageId || !socketRef.current) return;
    socketRef.current.emit('create thread', {
      room: currentRoom,
      messageId,
      title
    });
  };

  const votePoll = (pollId, optionIndex) => {
    if (!pollId || !Number.isInteger(optionIndex)) return;
    window.localStorage.setItem(
      `${POLL_VOTE_STORAGE_PREFIX}${userId}:${pollId}`,
      String(optionIndex)
    );
    setMessages((prev) =>
      prev.map((entry) => {
        if (!entry.poll || entry.poll.id !== pollId) return entry;
        return {
          ...entry,
          poll: {
            ...entry.poll,
            selectedOptionIndex: optionIndex
          }
        };
      })
    );
    socketRef.current?.emit('poll vote', { pollId, optionIndex });
  };

  const kickUser = (targetUserId) => {
    const targetRoom = currentRoomRef.current;
    const socket = socketRef.current;

    if (!targetUserId || targetUserId === userId) return false;

    if (!targetRoom) {
      setSystemNotice('目前尚未加入房間，無法踢人。');
      return false;
    }

    if (!socket?.connected) {
      setSystemNotice('目前尚未連線完成，請稍後再試。');
      return false;
    }

    socket.emit('chat message', {
      room: targetRoom,
      text: `/kick ${targetUserId}`,
      useMarkdown: false
    });

    return true;
  };

  const sendTyping = (typing) => {
    if (!currentRoom || !socketRef.current) return;
    socketRef.current.emit('typing', { room: currentRoom, typing });
  };

  const scheduleTypingStop = () => {
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = window.setTimeout(() => {
      sendTyping(false);
    }, TYPING_INACTIVITY_MS);
  };

  useEffect(() => {
    const socket = io({
      auth: { userId }
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      const roomFromUrl = roomFromUrlRef.current;
      if (roomFromUrl) {
        joinRoom(roomFromUrl, roomPasswordCacheRef.current.get(roomFromUrl) || null, {
          roomDisplayName: roomFromUrl,
          silent: true
        });
        roomFromUrlRef.current = '';
        return;
      }
      if (currentRoomRef.current) {
        const reconnectRoom = currentRoomRef.current;
        joinRoom(reconnectRoom, roomPasswordCacheRef.current.get(reconnectRoom) || null, {
          roomDisplayName: reconnectRoom,
          silent: true
        });
      }
    });

    socket.on('disconnect', () => {
      setConnected(false);
      if (currentRoomRef.current) {
        setSystemNotice('連線中斷，正在嘗試重新連線...');
      }
    });

    socket.on('room list', (nextRooms) => {
      setRooms(Array.isArray(nextRooms) ? nextRooms : []);
    });

    socket.on('room created', (payload) => {
      if (!payload?.room || pendingCreatedRoomRef.current !== payload.room) return;
      pendingCreatedRoomRef.current = '';
      setSystemNotice(`已建立 ${payload.displayName || payload.room}，正在進入房間。`);
      joinRoom(payload.room);
    });

    socket.on('room create error', (errorKey) => {
      pendingCreatedRoomRef.current = '';
      setJoinError(errorKey || 'room_create_failed');
    });

    socket.on('join success', (roomInfo) => {
      const roomName = roomInfo?.name || '';
      const isThread = Boolean(roomInfo?.isThread);
      const pendingJoin = pendingJoinRef.current;
      const displayName = roomInfo?.displayName || roomName;

      setCurrentRoom(roomName);
      setCurrentRoomDisplayName(displayName);
      setCurrentRoomIsOwner(Boolean(roomInfo?.isOwner));
      setActiveThreadParent(isThread ? (roomInfo?.parentRoom || '') : '');
      setActiveThreadTitle(isThread ? (roomInfo?.threadTitle || '') : '');
      setJoinError('');
      clearTypingState();
      syncRoomUrl(roomName);

      if (pendingJoin?.roomName === roomName && pendingJoin.password) {
        roomPasswordCacheRef.current.set(roomName, pendingJoin.password);
      }

      if (!pendingJoin?.silent) {
        setSystemNotice(isThread ? `已進入討論串：${displayName}` : `已加入 ${displayName}`);
      } else {
        setSystemNotice('');
      }

      pendingJoinRef.current = null;
    });

    socket.on('join error', (errorKey) => {
      const pendingJoin = pendingJoinRef.current;
      if (errorKey === 'wrong_password' && pendingJoin?.roomName) {
        const password = requestRoomPassword(pendingJoin.displayName);
        if (password === null) {
          pendingJoinRef.current = null;
          setJoinError('');
          setSystemNotice(`已取消加入 ${pendingJoin.displayName}`);
          return;
        }
        if (password.trim()) {
          joinRoom(pendingJoin.roomName, password, {
            parentRoom: pendingJoin.parentRoom,
            roomDisplayName: pendingJoin.displayName,
            silent: pendingJoin.silent,
            threadTitle: pendingJoin.threadTitle
          });
          return;
        }
      }
      pendingJoinRef.current = null;
      setJoinError(errorKey || 'room_not_found');
    });

    socket.on('chat history', (history) => {
      const nextMessages = Array.isArray(history)
        ? history.map((message) => attachStoredVoteSelection(message, userId))
        : [];
      setMessages(nextMessages);
    });

    socket.on('chat message', (message) => {
      setMessages((prev) => [...prev, attachStoredVoteSelection(message, userId)]);
    });

    socket.on('chat message updated', (payload) => {
      if (!payload?.mid) return;
      setMessages((prev) =>
        updateMessageById(prev, payload.mid, (entry) => ({
          ...entry,
          linkPreview: payload.linkPreview
        }))
      );
    });

    socket.on('thread ready', (payload) => {
      if (!payload?.room) return;
      joinRoom(payload.room, null, {
        parentRoom: payload.parentRoom || currentRoomRef.current,
        roomDisplayName: payload.displayName || payload.room,
        threadTitle: payload.displayName || ''
      });
    });

    socket.on('thread status', (payload) => {
      if (!payload?.parentMessageId) return;
      setMessages((prev) =>
        updateMessageById(prev, payload.parentMessageId, (entry) => ({
          ...entry,
          threadOpened: true,
          threadRoom: payload.threadRoom,
          threadTitle: payload.threadTitle
        }))
      );
    });

    socket.on('typing status', (payload) => {
      if (!payload?.userId || payload.userId === userId) return;
      if (payload.typing) {
        typingMapRef.current.set(
          payload.userId,
          payload.displayName || payload.userId
        );
      } else {
        typingMapRef.current.delete(payload.userId);
      }
      setTypingUsers(Array.from(typingMapRef.current.values()));
    });

    socket.on('poll update', (payload) => {
      if (!payload?.pollId || !Array.isArray(payload.options)) return;
      setMessages((prev) =>
        prev.map((entry) => {
          if (!entry.poll || entry.poll.id !== payload.pollId) return entry;
          return {
            ...entry,
            poll: {
              ...entry.poll,
              options: entry.poll.options.map((option, index) => ({
                ...option,
                count: payload.options[index]?.count ?? option.count
              }))
            }
          };
        })
      );
    });

    socket.on('room cleared', (payload) => {
      if (payload?.room !== currentRoomRef.current) return;
      setMessages([]);
      appendSystemNotice('本房聊天紀錄已清空。');
    });

    socket.on('room deleted', (payload) => {
      if (payload?.room !== currentRoomRef.current) return;
      roomPasswordCacheRef.current.delete(payload.room);
      resetCurrentRoomState('房間已被刪除。');
    });

    socket.on('room renamed', (payload) => {
      if (payload?.room !== currentRoomRef.current) return;
      setCurrentRoomDisplayName(payload.displayName || payload.room);
      appendSystemNotice(`房間名稱已更新為 ${payload.displayName || payload.room}`);
    });

    socket.on('kicked', ({ room }) => {
      if (!room || room !== currentRoomRef.current) return;
      roomPasswordCacheRef.current.delete(room);
      resetCurrentRoomState(`你已被踢出 ${room}`);
    });

    return () => {
      if (typingTimerRef.current) {
        window.clearTimeout(typingTimerRef.current);
      }
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId]);

  const isRoomOwner = useMemo(() => {
    const roomFromList = rooms.find((room) => room.name === currentRoom);
    if (roomFromList?.creatorId) {
      return roomFromList.creatorId === userId;
    }
    return currentRoomIsOwner;
  }, [currentRoom, currentRoomIsOwner, rooms, userId]);

  return {
    connected,
    createRoom,
    createThread,
    currentRoom,
    currentRoomDisplayName,
    activeThreadParent,
    activeThreadTitle,
    isRoomOwner,
    joinError,
    joinRoom,
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
    kickUser,
    votePoll
  };
}
