/// <reference types="vite/client" />

// The server's base URL. Deployed builds get VITE_API_URL from sst.config.ts (the stage's API
// domain); `npx sst dev` sets it to the local server. Plain `vite` falls back to that too.
export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
