/**
 * Base URL for all REST API calls.
 *
 * Dev  : "" (empty) → relative paths → Vite proxy forwards /api/* to localhost:3001
 * Prod : VITE_API_URL="https://your-app.up.railway.app" → absolute URLs go straight to Railway
 */
export const API_BASE = import.meta.env.VITE_API_URL ?? '';

/** Prepend the backend base URL to a path. */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
