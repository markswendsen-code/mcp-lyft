import { chromium, BrowserContext, Page } from "playwright";
import { loadCookies, saveCookies } from "./session.js";

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

let browserInstance: Awaited<ReturnType<typeof chromium.launch>> | null = null;
let contextInstance: BrowserContext | null = null;

export async function getBrowserContext(headless = true): Promise<BrowserContext> {
  if (contextInstance) return contextInstance;

  browserInstance = await chromium.launch({
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
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
    timezoneId: "America/New_York",
    geolocation: { latitude: 40.7128, longitude: -74.006 },
    permissions: ["geolocation"],
  });

  // Restore saved cookies
  const cookies = loadCookies();
  if (cookies && Array.isArray(cookies) && cookies.length > 0) {
    await contextInstance.addCookies(cookies as Parameters<BrowserContext["addCookies"]>[0]);
  }

  return contextInstance;
}

export async function saveSessionCookies(): Promise<void> {
  if (!contextInstance) return;
  const cookies = await contextInstance.cookies();
  saveCookies(cookies);
}

export async function closeBrowser(): Promise<void> {
  if (contextInstance) {
    await contextInstance.close();
    contextInstance = null;
  }
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

export async function withPage<T>(
  fn: (page: Page) => Promise<T>,
  headless = true
): Promise<T> {
  const ctx = await getBrowserContext(headless);
  const page = await ctx.newPage();
  await page.addInitScript(STEALTH_INIT_SCRIPT);
  try {
    const result = await fn(page);
    await saveSessionCookies();
    return result;
  } finally {
    await page.close();
  }
}
