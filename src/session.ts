import fs from "fs";
import path from "path";
import os from "os";

const BASE_DIR = path.join(os.homedir(), ".striderlabs", "lyft");
const COOKIES_FILE = path.join(BASE_DIR, "cookies.json");
const AUTH_FILE = path.join(BASE_DIR, "auth.json");
const ROUTE_FILE = path.join(BASE_DIR, "route.json");

export interface AuthInfo {
  identifier: string;
  loggedInAt: string;
  name?: string;
}

export interface RouteInfo {
  pickup?: string;
  destination?: string;
}

function ensureDir(): void {
  if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true });
  }
}

// --- Cookies ---

export function saveCookies(cookies: unknown[]): void {
  ensureDir();
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
}

export function loadCookies(): unknown[] | null {
  if (!fs.existsSync(COOKIES_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(COOKIES_FILE, "utf-8"));
  } catch {
    return null;
  }
}

// --- Auth ---

export function saveAuth(info: AuthInfo): void {
  ensureDir();
  fs.writeFileSync(AUTH_FILE, JSON.stringify(info, null, 2));
}

export function loadAuth(): AuthInfo | null {
  if (!fs.existsSync(AUTH_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(AUTH_FILE, "utf-8")) as AuthInfo;
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return fs.existsSync(COOKIES_FILE) && fs.existsSync(AUTH_FILE);
}

// --- Route ---

export function saveRoute(route: Partial<RouteInfo>): void {
  ensureDir();
  const existing = loadRoute() ?? {};
  fs.writeFileSync(ROUTE_FILE, JSON.stringify({ ...existing, ...route }, null, 2));
}

export function loadRoute(): RouteInfo | null {
  if (!fs.existsSync(ROUTE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(ROUTE_FILE, "utf-8")) as RouteInfo;
  } catch {
    return null;
  }
}

export function clearRoute(): void {
  if (fs.existsSync(ROUTE_FILE)) fs.unlinkSync(ROUTE_FILE);
}

// --- Logout ---

export function clearSession(): void {
  [COOKIES_FILE, AUTH_FILE, ROUTE_FILE].forEach((f) => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
}
