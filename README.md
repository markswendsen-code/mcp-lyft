# @striderlabs/mcp-lyft

MCP server connector for Lyft ride-sharing — request rides, get fare estimates, and track trips via browser automation.

## Installation

```bash
npm install -g @striderlabs/mcp-lyft
```

Or run directly with npx:

```bash
npx @striderlabs/mcp-lyft
```

## MCP Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "lyft": {
      "command": "npx",
      "args": ["@striderlabs/mcp-lyft"]
    }
  }
}
```

## Tools

### `status`
Check current session and route status.

**Returns:** Login state, user info, and saved pickup/destination.

---

### `login`
Authenticate with your Lyft account.

| Parameter    | Type    | Required | Description                          |
|-------------|---------|----------|--------------------------------------|
| `identifier` | string  | Yes      | Email or phone number                |
| `password`   | string  | Yes      | Lyft account password                |
| `headless`   | boolean | No       | Run browser headlessly (default: true) |

**Note:** If Lyft requires a verification code (OTP), you must complete sign-in manually in a browser first.

---

### `logout`
Clear saved session, cookies, and route data.

---

### `set_pickup`
Set the pickup location for your ride.

| Parameter  | Type   | Required | Description                              |
|-----------|--------|----------|------------------------------------------|
| `location` | string | Yes      | Address or place name (e.g. "Times Square, NYC") |

---

### `set_destination`
Set the destination for your ride.

| Parameter  | Type   | Required | Description                              |
|-----------|--------|----------|------------------------------------------|
| `location` | string | Yes      | Address or place name (e.g. "JFK Airport") |

---

### `get_fare_estimate`
Get fare estimates for the current pickup/destination route.

**Requires:** Both pickup and destination to be set via `set_pickup` and `set_destination`.

**Returns:** List of ride types with estimated fares and ETAs.

---

### `get_ride_options`
Get available Lyft ride types for the current route.

**Requires:** Login + both pickup and destination set.

**Returns:** Available options (Lyft, Lyft XL, Lux, Lux Black, etc.) with prices and wait times.

---

### `request_ride`
Request a Lyft ride. Returns a preview by default — set `confirm=true` to actually book.

| Parameter   | Type    | Required | Description                                   |
|------------|---------|----------|-----------------------------------------------|
| `ride_type` | string  | No       | Ride type (default: "Lyft")                   |
| `confirm`   | boolean | No       | Set `true` to book (default: false — preview) |

**Requires:** Login + both pickup and destination set.

---

### `get_ride_status`
Get the status of your current or most recent Lyft ride.

**Requires:** Login.

**Returns:** Driver info, ETA, vehicle details, and trip status.

---

### `cancel_ride`
Cancel a pending or active ride.

| Parameter | Type   | Required | Description               |
|----------|--------|----------|---------------------------|
| `reason`  | string | No       | Optional cancellation reason |

**Note:** Cancellation fees may apply depending on timing.

---

### `get_ride_history`
Get recent ride history.

| Parameter | Type   | Required | Description                        |
|----------|--------|----------|------------------------------------|
| `limit`   | number | No       | Number of rides to return (default: 10) |

**Returns:** List of past rides with date, route, fare, and status.

---

## Typical Workflow

```
1. login          → Authenticate with Lyft
2. set_pickup     → "123 Main St, San Francisco, CA"
3. set_destination → "SFO Airport"
4. get_fare_estimate → See prices for all ride types
5. request_ride   → Preview the ride (confirm=false)
6. request_ride   → confirm=true to actually book
7. get_ride_status → Track your driver
8. cancel_ride    → Cancel if needed
```

## Session Storage

Session data is stored locally at `~/.striderlabs/lyft/`:

| File          | Contents                        |
|--------------|---------------------------------|
| `cookies.json` | Browser session cookies         |
| `auth.json`    | Login metadata (identifier, time) |
| `route.json`   | Saved pickup/destination        |

## Technical Details

- Uses **Playwright** (Chromium) for browser automation
- Stealth techniques applied to avoid bot detection
- Cookies persist across MCP calls for seamless sessions
- Default geolocation: New York City
- User-agent: Chrome 120 on macOS

## Important Notes

- **OTP/Verification:** Lyft frequently requires SMS or email verification codes. If prompted, complete sign-in manually in a browser — cookies will be reused.
- **CAPTCHA:** If a CAPTCHA appears, complete it manually in a browser to establish a session.
- **Cancellation Fees:** Lyft may charge a fee if you cancel after a driver has been assigned.
- **Mobile vs Web:** Some Lyft features may only be available in the mobile app and not accessible via browser automation.

## License

MIT © [Strider Labs](https://striderlabs.ai)
