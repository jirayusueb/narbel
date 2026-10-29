import { ENV } from "./env";

const trimSlash = (url: string) => (url.endsWith("/") ? url.slice(0, -1) : url);

// During SSR the server may reach the API on a different internal URL.
const processEnv = typeof process === "undefined" ? undefined : process.env;
export const SERVER_URL = trimSlash(
  typeof window === "undefined" && processEnv?.SERVER_URL
    ? processEnv.SERVER_URL
    : ENV.VITE_SERVER_URL
);

export const SYNC_URL = `${SERVER_URL.replace(/^http/u, "ws")}/api/boards/sync`;
