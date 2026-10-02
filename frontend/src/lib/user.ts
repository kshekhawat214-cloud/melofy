import { v4 as uuidv4 } from 'uuid';

/**
 * Gets the current user's unique ID from localStorage,
 * or generates a new one if it doesn't exist.
 */
export function getOrCreateUserId(): string {
  if (typeof window === 'undefined') return 'server-side';

  let userId = localStorage.getItem('app_user_id');
  if (!userId) {
    userId = `user_${uuidv4().slice(0, 8)}`;
    localStorage.setItem('app_user_id', userId);
  }
  return userId;
}
