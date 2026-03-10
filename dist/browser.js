"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBrowserContext = getBrowserContext;
exports.saveSessionCookies = saveSessionCookies;
exports.closeBrowser = closeBrowser;
exports.withPage = withPage;
const playwright_1 = require("playwright");
const session_js_1 = require("./session.js");
// Stealth script to remove automation markers
const STEALTH_INIT_SCRIPT = `
(() => {
  // Remove webdriver flag
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

  // Spoof plugins
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const plugins = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
      ];
      Object.setPrototypeOf(plugins, PluginArray.prototype);
      return plugins;
    }
  });

  // Set languages
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

  // Patch permissions
  const origQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
  window.navigator.permissions.query = (parameters) => {
    if (parameters.name === 'notifications') {
      return Promise.resolve({ state: Notification.permission, name: 'notifications' } as PermissionStatus);
    }
    return origQuery(parameters);
  };

  // Remove CDP markers
  delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Array;
  delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Promise;
  delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
})();
`;
let browserInstance = null;
let contextInstance = null;
async function getBrowserContext(headless = true) {
    if (contextInstance)
        return contextInstance;
    browserInstance = await playwright_1.chromium.launch({
        headless,
        args: [
            "--no-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--disable-infobars",
            "--window-size=1280,800",
        ],
    });
    contextInstance = await browserInstance.newContext({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 800 },
        locale: "en-US",
        timezoneId: "America/New_York",
        geolocation: { latitude: 40.7128, longitude: -74.006 },
        permissions: ["geolocation"],
    });
    // Restore saved cookies
    const cookies = (0, session_js_1.loadCookies)();
    if (cookies && Array.isArray(cookies) && cookies.length > 0) {
        await contextInstance.addCookies(cookies);
    }
    return contextInstance;
}
async function saveSessionCookies() {
    if (!contextInstance)
        return;
    const cookies = await contextInstance.cookies();
    (0, session_js_1.saveCookies)(cookies);
}
async function closeBrowser() {
    if (contextInstance) {
        await contextInstance.close();
        contextInstance = null;
    }
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
    }
}
async function withPage(fn, headless = true) {
    const ctx = await getBrowserContext(headless);
    const page = await ctx.newPage();
    await page.addInitScript(STEALTH_INIT_SCRIPT);
    try {
        const result = await fn(page);
        await saveSessionCookies();
        return result;
    }
    finally {
        await page.close();
    }
}
//# sourceMappingURL=browser.js.map