import { ENV } from "./env";

const trimSlash = (url: string) => (url.endsWith("/") ? url.slice(0, -1) : url);

// The API as the browser reaches it. Anything rendered into HTML (text, links, img src) uses this,
// or the server-rendered markup would differ from the browser's and break hydration.
export const PUBLIC_SERVER_URL = trimSlash(ENV.VITE_SERVER_URL);

// For requests only: during SSR the server may reach the API on a different internal URL.
const processEnv = typeof process === "undefined" ? undefined : process.env;
export const SERVER_URL =
  typeof window === "undefined" && processEnv?.SERVER_URL
    ? trimSlash(processEnv.SERVER_URL)
    : PUBLIC_SERVER_URL;

export const SYNC_URL = `${PUBLIC_SERVER_URL.replace(/^http/u, "ws")}/api/boards/sync`;
