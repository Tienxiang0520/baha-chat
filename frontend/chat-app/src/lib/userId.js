const USER_ID_STORAGE_KEY = 'baha-user-id';

function generateRandomUserId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const length = Math.floor(Math.random() * 3) + 8;
  let id = '';

  for (let index = 0; index < length; index += 1) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return id;
}

export function getOrCreateUserId() {
  const existing = window.localStorage.getItem(USER_ID_STORAGE_KEY);
  if (existing && /^[A-Za-z0-9]{8,10}$/.test(existing)) {
    return existing;
  }

  const generated = generateRandomUserId();
  window.localStorage.setItem(USER_ID_STORAGE_KEY, generated);
  return generated;
}

export function stringToColor(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = value.charCodeAt(index) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 42%)`;
}
