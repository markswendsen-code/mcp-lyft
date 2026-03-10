#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { withPage } from "./browser.js";
import {
  saveAuth,
  loadAuth,
  isLoggedIn,
  clearSession,
  saveRoute,
  loadRoute,
  clearRoute,
} from "./session.js";

// --- MCP Server Setup ---

const server = new Server(
  { name: "lyft", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// --- Tool Definitions ---

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "status",
      description:
        "Check current connection and session status — shows login state, saved route, and session info.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "login",
      description:
        "Authenticate with Lyft using email/phone and password. Saves session cookies for future requests.",
      inputSchema: {
        type: "object",
        properties: {
          identifier: {
            type: "string",
            description: "Email address or phone number associated with your Lyft account",
          },
          password: {
            type: "string",
            description: "Lyft account password",
          },
          headless: {
            type: "boolean",
            description: "Run browser in headless mode (default: true)",
          },
        },
        required: ["identifier", "password"],
      },
    },
    {
      name: "logout",
      description: "Clear saved session, cookies, and route data.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "set_pickup",
      description: "Set the pickup location for your ride.",
      inputSchema: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "Pickup address or place name (e.g. '123 Main St, New York, NY')",
          },
        },
        required: ["location"],
      },
    },
    {
      name: "set_destination",
      description: "Set the destination for your ride.",
      inputSchema: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "Destination address or place name (e.g. 'JFK Airport, Queens, NY')",
          },
        },
        required: ["location"],
      },
    },
    {
      name: "get_fare_estimate",
      description:
        "Get fare estimates for the current pickup and destination. Both locations must be set first.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "get_ride_options",
      description:
        "Get available Lyft ride types (Lyft, Lyft XL, Lux, Lux Black, etc.) for the current route.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "request_ride",
      description:
        "Request a Lyft ride. Returns a confirmation preview by default — set confirm=true to actually book the ride.",
      inputSchema: {
        type: "object",
        properties: {
          ride_type: {
            type: "string",
            description: "Ride type to request (e.g. 'Lyft', 'Lyft XL', 'Lux', 'Lux Black'). Defaults to standard Lyft.",
          },
          confirm: {
            type: "boolean",
            description: "Set to true to actually confirm and book the ride (default: false — returns preview only)",
          },
        },
        required: [],
      },
    },
    {
      name: "get_ride_status",
      description: "Get the status of your current or most recent Lyft ride.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "cancel_ride",
      description: "Cancel a pending or active Lyft ride.",
      inputSchema: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Optional reason for cancellation",
          },
        },
        required: [],
      },
    },
    {
      name: "get_ride_history",
      description: "Get recent Lyft ride history.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of recent rides to return (default: 10)",
          },
        },
        required: [],
      },
    },
  ],
}));

// --- Response Helpers ---

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function err(text: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${text}` }],
    isError: true,
  };
}

// --- Tool Handlers ---

async function handleStatus() {
  const auth = loadAuth();
  const route = loadRoute();
  const loggedIn = isLoggedIn();

  const result = {
    logged_in: loggedIn,
    user: auth
      ? {
          identifier: auth.identifier,
          name: auth.name ?? null,
          logged_in_at: auth.loggedInAt,
        }
      : null,
    route: route
      ? {
          pickup: route.pickup ?? null,
          destination: route.destination ?? null,
        }
      : { pickup: null, destination: null },
  };

  return ok(JSON.stringify(result, null, 2));
}

async function handleLogin(identifier: string, password: string, headless = true) {
  return withPage(async (page) => {
    await page.goto("https://www.lyft.com/signin", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForTimeout(2000);

    // Enter email/phone
    const identifierInput = await page.waitForSelector(
      'input[name="email"], input[type="email"], input[placeholder*="Email"], input[placeholder*="Phone"], input[name="phone"], input[data-testid*="email"], input[data-testid*="phone"]',
      { timeout: 15000 }
    );
    await identifierInput.click();
    await identifierInput.fill(identifier);
    await page.waitForTimeout(500);

    // Click continue/next button
    const continueBtn = await page.waitForSelector(
      'button[type="submit"], button[data-testid*="continue"], button[data-testid*="next"], button:has-text("Continue"), button:has-text("Next")',
      { timeout: 10000 }
    );
    await continueBtn.click();
    await page.waitForTimeout(2000);

    // Check for OTP/verification code prompt
    const pageContent = await page.content();
    if (
      pageContent.toLowerCase().includes("verification code") ||
      pageContent.toLowerCase().includes("enter code") ||
      pageContent.toLowerCase().includes("sent a code") ||
      pageContent.toLowerCase().includes("check your")
    ) {
      return err(
        "Lyft requires a verification code (OTP). Please complete verification manually in a browser, then save your session cookies."
      );
    }

    // Enter password if prompted
    try {
      const passwordInput = await page.waitForSelector(
        'input[type="password"], input[name="password"], input[placeholder*="Password"]',
        { timeout: 8000 }
      );
      await passwordInput.click();
      await passwordInput.fill(password);
      await page.waitForTimeout(500);

      const submitBtn = await page.waitForSelector(
        'button[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Continue")',
        { timeout: 8000 }
      );
      await submitBtn.click();
      await page.waitForTimeout(3000);
    } catch {
      // Password field not found; may have used phone OTP flow
    }

    // Re-check for OTP after password submission
    const postContent = await page.content();
    if (
      postContent.toLowerCase().includes("verification code") ||
      postContent.toLowerCase().includes("enter code") ||
      postContent.toLowerCase().includes("sent a code")
    ) {
      return err(
        "Lyft requires a verification code (OTP). Please complete verification manually in a browser, then use this tool again."
      );
    }

    // Detect CAPTCHA
    if (
      postContent.toLowerCase().includes("captcha") ||
      postContent.toLowerCase().includes("robot") ||
      postContent.toLowerCase().includes("verify you")
    ) {
      return err(
        "Lyft is showing a CAPTCHA challenge. Please complete it manually in a browser to establish a session."
      );
    }

    // Check if login succeeded by looking for user indicators
    const currentUrl = page.url();
    const loginSuccess =
      currentUrl.includes("/home") ||
      currentUrl.includes("/dashboard") ||
      postContent.includes("Request a Lyft") ||
      postContent.includes("Where to?") ||
      !currentUrl.includes("/signin");

    if (!loginSuccess) {
      return err(
        "Login may have failed. The page did not redirect to the expected location. Check your credentials."
      );
    }

    // Try to extract user name
    let name: string | undefined;
    try {
      name =
        (await page.evaluate(() => {
          const els = Array.from(
            document.querySelectorAll('[class*="name"], [data-testid*="name"], [aria-label*="name"]')
          );
          for (const el of els) {
            const txt = el.textContent?.trim();
            if (txt && txt.length > 1 && txt.length < 50) return txt;
          }
          return null;
        })) ?? undefined;
    } catch {
      // ignore
    }

    saveAuth({ identifier, loggedInAt: new Date().toISOString(), name });

    const result: Record<string, unknown> = {
      success: true,
      identifier,
      logged_in_at: new Date().toISOString(),
    };
    if (name) result.name = name;

    return ok(JSON.stringify(result, null, 2));
  }, headless);
}

async function handleLogout() {
  clearSession();
  return ok(JSON.stringify({ success: true, message: "Session cleared" }, null, 2));
}

async function handleSetPickup(location: string) {
  saveRoute({ pickup: location });
  return ok(JSON.stringify({ success: true, pickup: location }, null, 2));
}

async function handleSetDestination(location: string) {
  saveRoute({ destination: location });
  return ok(JSON.stringify({ success: true, destination: location }, null, 2));
}

async function handleGetFareEstimate() {
  const route = loadRoute();
  if (!route?.pickup) return err("No pickup location set. Use set_pickup first.");
  if (!route?.destination) return err("No destination set. Use set_destination first.");

  return withPage(async (page) => {
    // Lyft's ride estimate page
    await page.goto("https://www.lyft.com/rider/fare-estimate", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // Fill pickup
    const pickupInput = await page.waitForSelector(
      'input[placeholder*="Pickup"], input[placeholder*="pickup"], input[data-testid*="pickup"], input[aria-label*="pickup"], input[name*="pickup"]',
      { timeout: 15000 }
    );
    await pickupInput.click();
    await pickupInput.fill(route.pickup!);
    await page.waitForTimeout(1000);

    // Select first autocomplete suggestion
    try {
      const pickupSuggestion = await page.waitForSelector(
        '[data-testid*="autocomplete-item"], [class*="autocomplete"] li, [role="option"], [class*="suggestion"]',
        { timeout: 5000 }
      );
      await pickupSuggestion.click();
      await page.waitForTimeout(800);
    } catch {
      await page.keyboard.press("Enter");
      await page.waitForTimeout(800);
    }

    // Fill destination
    const destInput = await page.waitForSelector(
      'input[placeholder*="Destination"], input[placeholder*="destination"], input[data-testid*="destination"], input[aria-label*="destination"], input[name*="destination"]',
      { timeout: 10000 }
    );
    await destInput.click();
    await destInput.fill(route.destination!);
    await page.waitForTimeout(1000);

    try {
      const destSuggestion = await page.waitForSelector(
        '[data-testid*="autocomplete-item"], [class*="autocomplete"] li, [role="option"], [class*="suggestion"]',
        { timeout: 5000 }
      );
      await destSuggestion.click();
      await page.waitForTimeout(1500);
    } catch {
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1500);
    }

    // Wait for fare results
    await page.waitForTimeout(3000);

    // Scrape fare cards
    const fares = await page.evaluate(() => {
      const cards = Array.from(
        document.querySelectorAll(
          '[data-testid*="ride-type"], [class*="ride-type"], [class*="RideType"], [class*="product-card"], [class*="ProductCard"], [class*="fare-card"], [class*="FareCard"]'
        )
      );

      if (cards.length > 0) {
        return cards.map((card) => {
          const name =
            card.querySelector('[class*="name"], [class*="title"], h3, h4')?.textContent?.trim() ??
            "Unknown";
          const price =
            card.querySelector('[class*="price"], [class*="fare"], [class*="cost"]')?.textContent?.trim() ??
            "N/A";
          const time =
            card.querySelector('[class*="eta"], [class*="time"], [class*="wait"]')?.textContent?.trim() ??
            null;
          return { name, price, eta: time };
        });
      }

      // Fallback: look for any price-like text
      const priceEls = Array.from(document.querySelectorAll('[class*="price"], [class*="fare"]'));
      return priceEls.slice(0, 8).map((el) => ({
        name: "Ride option",
        price: el.textContent?.trim() ?? "N/A",
        eta: null,
      }));
    });

    if (fares.length === 0) {
      // Last-resort fallback: return page text snippet
      const bodyText = await page.evaluate(() =>
        document.body.innerText.slice(0, 500)
      );
      return ok(
        JSON.stringify(
          {
            pickup: route.pickup,
            destination: route.destination,
            note: "Could not extract structured fare data",
            page_snippet: bodyText,
          },
          null,
          2
        )
      );
    }

    return ok(
      JSON.stringify(
        {
          pickup: route.pickup,
          destination: route.destination,
          fares,
        },
        null,
        2
      )
    );
  });
}

async function handleGetRideOptions() {
  const route = loadRoute();
  if (!route?.pickup) return err("No pickup location set. Use set_pickup first.");
  if (!route?.destination) return err("No destination set. Use set_destination first.");
  if (!isLoggedIn()) return err("Not logged in. Use login first.");

  return withPage(async (page) => {
    await page.goto("https://ride.lyft.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // Fill pickup
    const pickupInput = await page.waitForSelector(
      'input[placeholder*="Pickup"], input[placeholder*="pickup"], input[data-testid*="start"], input[aria-label*="pickup"]',
      { timeout: 15000 }
    );
    await pickupInput.click();
    await pickupInput.fill(route.pickup!);
    await page.waitForTimeout(1000);

    try {
      const suggestion = await page.waitForSelector(
        '[data-testid*="autocomplete-item"], [role="option"], [class*="suggestion"]',
        { timeout: 5000 }
      );
      await suggestion.click();
    } catch {
      await page.keyboard.press("Enter");
    }
    await page.waitForTimeout(800);

    // Fill destination
    const destInput = await page.waitForSelector(
      'input[placeholder*="Destination"], input[placeholder*="Where to"], input[data-testid*="end"], input[aria-label*="destination"]',
      { timeout: 10000 }
    );
    await destInput.click();
    await destInput.fill(route.destination!);
    await page.waitForTimeout(1000);

    try {
      const suggestion = await page.waitForSelector(
        '[data-testid*="autocomplete-item"], [role="option"], [class*="suggestion"]',
        { timeout: 5000 }
      );
      await suggestion.click();
    } catch {
      await page.keyboard.press("Enter");
    }
    await page.waitForTimeout(3000);

    // Scrape ride options
    const options = await page.evaluate(() => {
      const cards = Array.from(
        document.querySelectorAll(
          '[data-testid*="ride-option"], [class*="ride-option"], [class*="RideOption"], [class*="service-level"], [class*="product"]'
        )
      );

      return cards.map((card) => {
        const name =
          card.querySelector('[class*="name"], [class*="title"]')?.textContent?.trim() ??
          card.textContent?.trim().slice(0, 30) ??
          "Unknown";
        const price =
          card.querySelector('[class*="price"], [class*="fare"]')?.textContent?.trim() ?? "N/A";
        const eta =
          card.querySelector('[class*="eta"], [class*="time"], [class*="wait"]')?.textContent?.trim() ??
          null;
        return { name, price, eta };
      });
    });

    if (options.length === 0) {
      return ok(
        JSON.stringify(
          {
            note: "Could not find ride options. Lyft may require additional interaction.",
            pickup: route.pickup,
            destination: route.destination,
          },
          null,
          2
        )
      );
    }

    return ok(
      JSON.stringify({ pickup: route.pickup, destination: route.destination, options }, null, 2)
    );
  });
}

async function handleRequestRide(rideType = "Lyft", confirm = false) {
  if (!isLoggedIn()) return err("Not logged in. Use login first.");
  const route = loadRoute();
  if (!route?.pickup) return err("No pickup location set. Use set_pickup first.");
  if (!route?.destination) return err("No destination set. Use set_destination first.");

  return withPage(async (page) => {
    await page.goto("https://ride.lyft.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // Fill pickup
    const pickupInput = await page.waitForSelector(
      'input[placeholder*="Pickup"], input[placeholder*="pickup"], input[data-testid*="start"], input[aria-label*="pickup"]',
      { timeout: 15000 }
    );
    await pickupInput.click();
    await pickupInput.fill(route.pickup!);
    await page.waitForTimeout(1000);

    try {
      const s = await page.waitForSelector('[data-testid*="autocomplete-item"], [role="option"]', { timeout: 5000 });
      await s.click();
    } catch {
      await page.keyboard.press("Enter");
    }
    await page.waitForTimeout(800);

    // Fill destination
    const destInput = await page.waitForSelector(
      'input[placeholder*="Destination"], input[placeholder*="Where to"], input[data-testid*="end"], input[aria-label*="destination"]',
      { timeout: 10000 }
    );
    await destInput.click();
    await destInput.fill(route.destination!);
    await page.waitForTimeout(1000);

    try {
      const s = await page.waitForSelector('[data-testid*="autocomplete-item"], [role="option"]', { timeout: 5000 });
      await s.click();
    } catch {
      await page.keyboard.press("Enter");
    }
    await page.waitForTimeout(3000);

    // Select ride type
    try {
      const rideCards = await page.$$('[data-testid*="ride-option"], [class*="ride-option"], [class*="RideOption"], [class*="product"]');
      for (const card of rideCards) {
        const text = await card.textContent();
        if (text?.toLowerCase().includes(rideType.toLowerCase())) {
          await card.click();
          await page.waitForTimeout(1000);
          break;
        }
      }
    } catch {
      // Proceed with default selection
    }

    // Extract fare info before confirming
    let fareInfo: Record<string, string | null> = {};
    try {
      fareInfo = await page.evaluate(() => {
        const priceEl = document.querySelector('[class*="price"], [class*="fare"], [data-testid*="price"]');
        const etaEl = document.querySelector('[class*="eta"], [class*="time"], [data-testid*="eta"]');
        return {
          price: priceEl?.textContent?.trim() ?? null,
          eta: etaEl?.textContent?.trim() ?? null,
        };
      });
    } catch {
      // ignore
    }

    if (!confirm) {
      return ok(
        JSON.stringify(
          {
            preview: true,
            confirmed: false,
            ride_type: rideType,
            pickup: route.pickup,
            destination: route.destination,
            estimated_fare: fareInfo.price ?? "See app",
            estimated_eta: fareInfo.eta ?? "See app",
            message: "Set confirm=true to actually book this ride.",
          },
          null,
          2
        )
      );
    }

    // Click the request/confirm button
    const confirmBtn = await page.waitForSelector(
      'button[data-testid*="confirm"], button[data-testid*="request"], button:has-text("Confirm"), button:has-text("Request"), button:has-text("Request Lyft")',
      { timeout: 10000 }
    );
    await confirmBtn.click();
    await page.waitForTimeout(4000);

    // Extract confirmation details
    const confirmation = await page.evaluate(() => {
      const statusEl = document.querySelector('[class*="status"], [data-testid*="status"], [class*="confirmation"]');
      const driverEl = document.querySelector('[class*="driver"], [data-testid*="driver"]');
      const etaEl = document.querySelector('[class*="eta"], [data-testid*="eta"]');
      return {
        status: statusEl?.textContent?.trim() ?? null,
        driver: driverEl?.textContent?.trim() ?? null,
        eta: etaEl?.textContent?.trim() ?? null,
      };
    });

    clearRoute();

    return ok(
      JSON.stringify(
        {
          confirmed: true,
          ride_type: rideType,
          pickup: route.pickup,
          destination: route.destination,
          status: confirmation.status ?? "Ride requested",
          driver: confirmation.driver ?? "Searching for driver...",
          eta: confirmation.eta ?? fareInfo.eta ?? "Calculating...",
          fare: fareInfo.price ?? "See app",
        },
        null,
        2
      )
    );
  });
}

async function handleGetRideStatus() {
  if (!isLoggedIn()) return err("Not logged in. Use login first.");

  return withPage(async (page) => {
    await page.goto("https://ride.lyft.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    const status = await page.evaluate(() => {
      // Look for active ride indicators
      const statusEl = document.querySelector(
        '[data-testid*="ride-status"], [class*="ride-status"], [class*="RideStatus"], [class*="trip-status"]'
      );
      const driverEl = document.querySelector(
        '[data-testid*="driver-name"], [class*="driver-name"], [class*="DriverName"]'
      );
      const etaEl = document.querySelector(
        '[data-testid*="eta"], [class*="eta"], [class*="ETA"], [class*="arrival-time"]'
      );
      const vehicleEl = document.querySelector(
        '[data-testid*="vehicle"], [class*="vehicle"], [class*="Vehicle"], [class*="car-info"]'
      );
      const licenseEl = document.querySelector(
        '[data-testid*="license"], [class*="license"], [class*="plate"]'
      );

      if (!statusEl && !driverEl && !etaEl) {
        return null; // No active ride
      }

      return {
        status: statusEl?.textContent?.trim() ?? "Active",
        driver: driverEl?.textContent?.trim() ?? null,
        eta: etaEl?.textContent?.trim() ?? null,
        vehicle: vehicleEl?.textContent?.trim() ?? null,
        license_plate: licenseEl?.textContent?.trim() ?? null,
      };
    });

    if (!status) {
      return ok(
        JSON.stringify({ active_ride: false, message: "No active ride found." }, null, 2)
      );
    }

    return ok(JSON.stringify({ active_ride: true, ...status }, null, 2));
  });
}

async function handleCancelRide(reason?: string) {
  if (!isLoggedIn()) return err("Not logged in. Use login first.");

  return withPage(async (page) => {
    await page.goto("https://ride.lyft.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // Look for cancel button
    try {
      const cancelBtn = await page.waitForSelector(
        'button[data-testid*="cancel"], button:has-text("Cancel ride"), button:has-text("Cancel Ride"), [class*="cancel-ride"]',
        { timeout: 8000 }
      );
      await cancelBtn.click();
      await page.waitForTimeout(2000);

      // Handle cancellation confirmation dialog
      try {
        const confirmCancel = await page.waitForSelector(
          'button:has-text("Confirm"), button:has-text("Yes, cancel"), button[data-testid*="confirm-cancel"]',
          { timeout: 5000 }
        );
        await confirmCancel.click();
        await page.waitForTimeout(2000);
      } catch {
        // No confirmation dialog
      }

      return ok(
        JSON.stringify(
          {
            success: true,
            message: "Ride cancellation requested.",
            reason: reason ?? null,
            note: "Cancellation fees may apply depending on how long ago the ride was requested.",
          },
          null,
          2
        )
      );
    } catch {
      return err(
        "No cancellable ride found. There may be no active ride, or the cancel option is not accessible at this time."
      );
    }
  });
}

async function handleGetRideHistory(limit = 10) {
  if (!isLoggedIn()) return err("Not logged in. Use login first.");

  return withPage(async (page) => {
    await page.goto("https://ride.lyft.com/profile/ride-history", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // Wait for ride history items
    try {
      await page.waitForSelector(
        '[data-testid*="ride-history"], [class*="ride-history"], [class*="RideHistory"], [class*="trip-card"], [class*="TripCard"]',
        { timeout: 10000 }
      );
    } catch {
      // May still have results
    }

    const rides = await page.evaluate((lim: number) => {
      const cards = Array.from(
        document.querySelectorAll(
          '[data-testid*="ride-history-item"], [class*="trip-card"], [class*="TripCard"], [class*="ride-item"], [class*="RideItem"]'
        )
      ).slice(0, lim);

      return cards.map((card) => {
        const date =
          card.querySelector('[class*="date"], [class*="Date"], time')?.textContent?.trim() ?? null;
        const pickup =
          card.querySelector('[class*="pickup"], [class*="origin"], [data-testid*="pickup"]')?.textContent?.trim() ?? null;
        const destination =
          card.querySelector('[class*="destination"], [class*="dropoff"], [data-testid*="destination"]')?.textContent?.trim() ?? null;
        const fare =
          card.querySelector('[class*="price"], [class*="fare"], [class*="cost"]')?.textContent?.trim() ?? null;
        const rideType =
          card.querySelector('[class*="ride-type"], [class*="product"], [class*="service"]')?.textContent?.trim() ?? null;
        const status =
          card.querySelector('[class*="status"]')?.textContent?.trim() ?? "Completed";

        return { date, pickup, destination, fare, ride_type: rideType, status };
      });
    }, limit);

    if (rides.length === 0) {
      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400));
      return ok(
        JSON.stringify(
          {
            rides: [],
            note: "No ride history found or page structure changed.",
            page_snippet: bodyText,
          },
          null,
          2
        )
      );
    }

    return ok(JSON.stringify({ count: rides.length, rides }, null, 2));
  });
}

// --- Request Handler ---

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "status":
        return handleStatus();

      case "login":
        if (!a.identifier || !a.password) {
          return err("identifier and password are required.");
        }
        return handleLogin(
          a.identifier as string,
          a.password as string,
          a.headless !== false
        );

      case "logout":
        return handleLogout();

      case "set_pickup":
        if (!a.location) return err("location is required.");
        return handleSetPickup(a.location as string);

      case "set_destination":
        if (!a.location) return err("location is required.");
        return handleSetDestination(a.location as string);

      case "get_fare_estimate":
        return handleGetFareEstimate();

      case "get_ride_options":
        return handleGetRideOptions();

      case "request_ride":
        return handleRequestRide(
          (a.ride_type as string) ?? "Lyft",
          (a.confirm as boolean) ?? false
        );

      case "get_ride_status":
        return handleGetRideStatus();

      case "cancel_ride":
        return handleCancelRide(a.reason as string | undefined);

      case "get_ride_history":
        return handleGetRideHistory((a.limit as number) ?? 10);

      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(`Tool '${name}' failed: ${msg}`);
  }
});

// --- Start Server ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  process.stderr.write(`Fatal: ${e}\n`);
  process.exit(1);
});
