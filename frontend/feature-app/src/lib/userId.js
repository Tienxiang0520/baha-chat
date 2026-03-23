const USER_ID_STORAGE_KEY = 'baha-react-board-user-id';
const VALID_USER_ID = /^[A-Za-z0-9]{8,10}$/;

function generateUserId() {
  const length = 8 + Math.floor(Math.random() * 3);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let id = '';
  for (let index = 0; index < length; index += 1) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export function getOrCreateUserId() {
  const stored = window.localStorage.getItem(USER_ID_STORAGE_KEY);
  if (stored && VALID_USER_ID.test(stored)) {
    return stored;
  }

  const nextId = generateUserId();
  window.localStorage.setItem(USER_ID_STORAGE_KEY, nextId);
  return nextId;
}
