import {
  formatAnonymousKey,
  getOrCreateUserId,
  importAnonymousKey,
  parseAnonymousKey,
  setUserId
} from '../../../shared/anonymousIdentity';

export function stringToColor(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = value.charCodeAt(index) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 42%)`;
}

export {
  formatAnonymousKey,
  getOrCreateUserId,
  importAnonymousKey,
  parseAnonymousKey,
  setUserId
};
