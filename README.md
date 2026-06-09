# Proxy Switcher Pro

Profile-based Chrome proxy switcher with authentication, routing rules, connection checks, request-header diagnostics, and lightweight page risk analysis.

Proxy Switcher Pro is a Manifest V3 Chrome extension for people who frequently switch between local, work, testing, and remote proxy configurations. It stores multiple profiles, applies Chrome proxy settings through the official `chrome.proxy` API, and helps verify how the current browser traffic is being routed.

## Features

- Multiple proxy profiles with fast switching.
- HTTP, HTTPS, SOCKS4, and SOCKS5 proxy support.
- Optional proxy authentication through `chrome.webRequest.onAuthRequired`.
- Global on/off toggle with an extension badge indicator.
- Two routing modes:
  - **All except bypass**: proxy all browser traffic except domains matched by the bypass list.
  - **Only selected**: proxy only selected domains through a generated PAC script.
- Bypass and selected-domain lists with wildcard-style host matching.
- Route tester for checking how a domain will be handled before opening it.
- Connection check with visible IP, Chrome proxy control state, latency, and expected route.
- Request and response header diagnostics for the active tab.
- Page risk panel with signals for HTTP pages, suspicious URLs, mixed content, certificate/cipher indicators, and direct routing.
- Import and export of extension settings as JSON.
- English and Russian UI.

## Installation

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome or another Chromium-based browser.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `proxy-switcher-pro` folder.

The extension requires Chrome 108 or newer.

## Usage

1. Open the extension popup.
2. Go to **Settings** and create or edit a proxy profile.
3. Enter the proxy type, host, port, and optional credentials.
4. Choose a routing mode:
   - **All except bypass** for a browser-wide proxy with exclusions.
   - **Only selected** for a proxy that applies only to listed domains.
5. Add bypass or selected-domain rules when needed.
6. Save the profile and use the power button to enable or disable the proxy.

Use the route tester to check whether a host will go through the proxy or directly. Use the connection check to confirm the visible IP and Chrome proxy state.

## Rule Format

Rules can be separated by new lines, commas, or semicolons.

Supported examples:

```text
localhost
127.0.0.1
<local>
example.com
*.internal.example
.company.test
```

Matching behavior:

- `example.com` matches `example.com` and its subdomains.
- `*.example.com` matches `example.com` and its subdomains.
- `.example.com` behaves like a domain suffix rule.
- `<local>` matches hosts without dots, such as `localhost`.
- The bypass list always wins over selected-domain routing.

## Permissions

The extension uses the following Chrome permissions:

- `proxy`: apply and clear Chrome proxy settings.
- `storage`: save profiles and UI settings locally.
- `tabs`: inspect the active tab URL for diagnostics.
- `webRequest`: collect request/response diagnostics and observe network errors.
- `webRequestAuthProvider`: provide saved proxy credentials when Chrome requests proxy authentication.
- `<all_urls>` host permission: allow proxy auth, header diagnostics, and page risk checks across regular web pages.

## Privacy

Proxy Switcher Pro stores settings locally in `chrome.storage.local`. It does not include analytics, telemetry, or a remote backend.

The connection check requests the visible IP from `https://api.ipify.org`. Header diagnostics are kept in extension memory for recent activity and are sanitized so sensitive authorization headers are not displayed.

## Project Structure

```text
manifest.json      Extension manifest
background.js      Proxy application, auth handling, header capture, connection check
popup.html         Extension popup markup
popup.css          Popup UI styles
popup.js           Popup state, rendering, import/export, diagnostics UI
i18n.js            English and Russian translations
rules.js           Routing-rule parsing and matching helpers
risk.js            Page risk scoring helpers
content-risk.js    Page-level security signal collection
```

## Development

This is a plain JavaScript browser extension with no build step.

After changing files:

1. Open `chrome://extensions`.
2. Click the reload button on Proxy Switcher Pro.
3. Reopen the popup and test the changed flow.

Useful checks before publishing:

```powershell
node --check background.js
node --check popup.js
node --check rules.js
node --check risk.js
node --check content-risk.js
python -m json.tool manifest.json
```

## Packaging

For local distribution, zip the extension source files without `.git`, editor settings, or generated archives. Chrome Web Store packaging should be created from the same unpacked-extension source.

## License

Use this project however you want. I created it for personal needs and do not plan to actively develop it.
