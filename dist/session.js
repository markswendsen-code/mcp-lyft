"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveCookies = saveCookies;
exports.loadCookies = loadCookies;
exports.saveAuth = saveAuth;
exports.loadAuth = loadAuth;
exports.isLoggedIn = isLoggedIn;
exports.saveRoute = saveRoute;
exports.loadRoute = loadRoute;
exports.clearRoute = clearRoute;
exports.clearSession = clearSession;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const BASE_DIR = path_1.default.join(os_1.default.homedir(), ".striderlabs", "lyft");
const COOKIES_FILE = path_1.default.join(BASE_DIR, "cookies.json");
const AUTH_FILE = path_1.default.join(BASE_DIR, "auth.json");
const ROUTE_FILE = path_1.default.join(BASE_DIR, "route.json");
function ensureDir() {
    if (!fs_1.default.existsSync(BASE_DIR)) {
        fs_1.default.mkdirSync(BASE_DIR, { recursive: true });
    }
}
// --- Cookies ---
function saveCookies(cookies) {
    ensureDir();
    fs_1.default.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
}
function loadCookies() {
    if (!fs_1.default.existsSync(COOKIES_FILE))
        return null;
    try {
        return JSON.parse(fs_1.default.readFileSync(COOKIES_FILE, "utf-8"));
    }
    catch {
        return null;
    }
}
// --- Auth ---
function saveAuth(info) {
    ensureDir();
    fs_1.default.writeFileSync(AUTH_FILE, JSON.stringify(info, null, 2));
}
function loadAuth() {
    if (!fs_1.default.existsSync(AUTH_FILE))
        return null;
    try {
        return JSON.parse(fs_1.default.readFileSync(AUTH_FILE, "utf-8"));
    }
    catch {
        return null;
    }
}
function isLoggedIn() {
    return fs_1.default.existsSync(COOKIES_FILE) && fs_1.default.existsSync(AUTH_FILE);
}
// --- Route ---
function saveRoute(route) {
    ensureDir();
    const existing = loadRoute() ?? {};
    fs_1.default.writeFileSync(ROUTE_FILE, JSON.stringify({ ...existing, ...route }, null, 2));
}
function loadRoute() {
    if (!fs_1.default.existsSync(ROUTE_FILE))
        return null;
    try {
        return JSON.parse(fs_1.default.readFileSync(ROUTE_FILE, "utf-8"));
    }
    catch {
        return null;
    }
}
function clearRoute() {
    if (fs_1.default.existsSync(ROUTE_FILE))
        fs_1.default.unlinkSync(ROUTE_FILE);
}
// --- Logout ---
function clearSession() {
    [COOKIES_FILE, AUTH_FILE, ROUTE_FILE].forEach((f) => {
        if (fs_1.default.existsSync(f))
            fs_1.default.unlinkSync(f);
    });
}
//# sourceMappingURL=session.js.map