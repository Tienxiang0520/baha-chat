const PRIMARY_USER_ID_STORAGE_KEY = 'baha-user-id';
const PRIMARY_DISPLAY_NAME_STORAGE_KEY = 'baha-display-name';
const LEGACY_USER_ID_STORAGE_KEYS = ['baha-react-board-user-id'];
const USER_ID_STORAGE_KEYS = [PRIMARY_USER_ID_STORAGE_KEY, ...LEGACY_USER_ID_STORAGE_KEYS];
const VALID_USER_ID = /^[A-Za-z0-9]{8,10}$/;
const KEY_PREFIX = 'Baha-Key-';
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const MAX_DISPLAY_NAME_LENGTH = 24;

function generateRandomUserId() {
  const length = 8 + Math.floor(Math.random() * 3);
  let id = '';

  for (let index = 0; index < length; index += 1) {
    id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  }

  return id;
}

function persistUserId(userId) {
  USER_ID_STORAGE_KEYS.forEach((storageKey) => {
    window.localStorage.setItem(storageKey, userId);
  });
}

function resolveStoredUserId() {
  for (const storageKey of USER_ID_STORAGE_KEYS) {
    const stored = window.localStorage.getItem(storageKey);
    if (stored && VALID_USER_ID.test(stored)) {
      return stored;
    }
  }
  return '';
}

export function isValidUserId(value) {
  return VALID_USER_ID.test(String(value || '').trim());
}

export function getStoredUserId() {
  return resolveStoredUserId();
}

export function getOrCreateUserId() {
  const stored = resolveStoredUserId();
  if (stored) {
    persistUserId(stored);
    return stored;
  }

  const nextUserId = generateRandomUserId();
  persistUserId(nextUserId);
  return nextUserId;
}

export function setUserId(nextUserId) {
  const normalized = String(nextUserId || '').trim();
  if (!VALID_USER_ID.test(normalized)) {
    throw new Error('invalid_user_id');
  }

  persistUserId(normalized);
  return normalized;
}

export function formatAnonymousKey(userId = getOrCreateUserId()) {
  return `${KEY_PREFIX}${userId}`;
}

export function parseAnonymousKey(rawValue) {
  const normalized = String(rawValue || '').trim();
  if (!normalized) return '';

  const userId = normalized.replace(/^baha-key-/i, '').trim();
  if (!VALID_USER_ID.test(userId)) return '';
  return userId;
}

export function importAnonymousKey(rawValue) {
  const userId = parseAnonymousKey(rawValue);
  if (!userId) {
    throw new Error('invalid_anonymous_key');
  }

  return setUserId(userId);
}

export function normalizeAnonymousDisplayName(value) {
  return String(value || '')
    .trim()
    .slice(0, MAX_DISPLAY_NAME_LENGTH);
}

export function getStoredAnonymousDisplayName() {
  return normalizeAnonymousDisplayName(
    window.localStorage.getItem(PRIMARY_DISPLAY_NAME_STORAGE_KEY) || ''
  );
}

export function setAnonymousDisplayName(nextDisplayName) {
  const normalized = normalizeAnonymousDisplayName(nextDisplayName);
  window.localStorage.setItem(PRIMARY_DISPLAY_NAME_STORAGE_KEY, normalized);
  return normalized;
}

export {
  PRIMARY_USER_ID_STORAGE_KEY,
  PRIMARY_DISPLAY_NAME_STORAGE_KEY,
  KEY_PREFIX,
  MAX_DISPLAY_NAME_LENGTH
};
