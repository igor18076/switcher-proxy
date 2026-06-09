const STORAGE_KEY = "proxySwitcherState";

const DEFAULT_PROFILE = {
  id: "default",
  name: "Main proxy",
  type: "SOCKS5",
  host: "",
  port: "",
  username: "",
  password: "",
  bypassList: "localhost\n127.0.0.1\n<local>",
  domainList: "",
  mode: "allExcept"
};

const DEFAULT_STATE = {
  enabled: false,
  language: "ru",
  activeProfileId: "default",
  profiles: [DEFAULT_PROFILE]
};

let cachedState = null;
const headerHistoryByTab = new Map();
let globalHeaderHistory = [];
const requestRecordsById = new Map();
const MAX_HEADER_RECORDS = 25;
const securityFindingsByTab = new Map();

chrome.runtime.onInstalled.addListener(async () => {
  const state = await getState();
  await saveState(normalizeState(state));
  await applyProxySettings();
});

chrome.runtime.onStartup.addListener(async () => {
  await applyProxySettings();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEY]) return;
  cachedState = normalizeState(changes[STORAGE_KEY].newValue);
  applyProxySettings();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "GET_STATE") {
      sendResponse({ ok: true, state: await getState() });
      return;
    }

    if (message?.type === "SAVE_STATE") {
      const state = normalizeState(message.state);
      await saveState(state);
      await applyProxySettings();
      sendResponse({ ok: true, state });
      return;
    }

    if (message?.type === "TEST_PROXY") {
      sendResponse({ ok: true, result: await getProxyStatus() });
      return;
    }

    if (message?.type === "CHECK_CONNECTION") {
      sendResponse({ ok: true, result: await checkConnection() });
      return;
    }

    if (message?.type === "GET_HEADER_HISTORY") {
      const tabId = Number(message.tabId);
      const tabRecords = headerHistoryByTab.get(tabId) || [];
      const fallbackRecords = filterHeaderRecordsByUrl(globalHeaderHistory, message.url);
      sendResponse({
        ok: true,
        records: tabRecords.length ? tabRecords : fallbackRecords,
        tabRecordCount: tabRecords.length,
        globalRecordCount: globalHeaderHistory.length,
        lastCapturedAt: globalHeaderHistory[0]?.lastSeen || globalHeaderHistory[0]?.timeStamp || null
      });
      return;
    }

    if (message?.type === "GET_SECURITY_FINDINGS") {
      const tabId = Number(message.tabId);
      const findings = securityFindingsByTab.get(tabId) || [];
      sendResponse({
        ok: true,
        findings: message.url ? filterSecurityFindingsByUrl(findings, message.url) : findings
      });
      return;
    }

    if (message?.type === "CLEAR_SECURITY_FINDINGS") {
      const tabId = Number(message.tabId);
      const findings = securityFindingsByTab.get(tabId) || [];
      if (message.url) {
        securityFindingsByTab.set(tabId, filterSecurityFindingsByUrl(findings, message.url, true));
      } else {
        securityFindingsByTab.delete(tabId);
      }
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "CLEAR_HEADER_HISTORY") {
      const tabId = Number(message.tabId);
      headerHistoryByTab.delete(tabId);
      globalHeaderHistory = filterHeaderRecordsByUrl(globalHeaderHistory, message.url, true);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "PAGE_SECURITY_SCAN") {
      const tabId = typeof sender.tab?.id === "number" ? sender.tab.id : Number(message.tabId);
      if (Number.isInteger(tabId)) {
        addSecurityFindings(tabId, message.findings || [], message.url || sender.tab?.url || "");
      }
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message" });
  })().catch((error) => {
    sendResponse({ ok: false, error: error.message || String(error) });
  });

  return true;
});

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const record = upsertRequestRecord(details.requestId, {
      tabId: details.tabId,
      url: details.url,
      method: details.method,
      type: details.type,
      timeStamp: details.timeStamp,
      lastSeen: Date.now(),
      initiator: details.initiator || "",
      requestHeaders: sanitizeHeaders(details.requestHeaders || [])
    });

    storeHeaderRecord(record);
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders"]
);

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const record = upsertRequestRecord(details.requestId, {
      tabId: details.tabId,
      url: details.url,
      method: details.method,
      type: details.type,
      statusCode: details.statusCode,
      statusLine: details.statusLine || "",
      responseHeaders: sanitizeHeaders(details.responseHeaders || []),
      lastSeen: Date.now()
    });

    storeHeaderRecord(record);
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.url.startsWith("http://") && details.initiator?.startsWith("https://")) {
      const findings = ["mixed"];

      if (details.type === "script") findings.push("mixed-script");
      if (details.type === "image" && /favicon/i.test(details.url)) findings.push("mixed-favicon");

      addSecurityFindings(details.tabId, findings, details.url);
    }
  },
  { urls: ["http://*/*"] }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    const record = upsertRequestRecord(details.requestId, {
      tabId: details.tabId,
      url: details.url,
      method: details.method,
      type: details.type,
      error: details.error,
      lastSeen: Date.now()
    });

    storeHeaderRecord(record);

    const mapped = mapCertificateError(details.error);
    if (mapped.length) {
      addSecurityFindings(details.tabId, mapped, details.url);
    }
  },
  { urls: ["https://*/*"] }
);

chrome.webRequest.onAuthRequired.addListener(
  (details, callback) => {
    (async () => {
      const state = await getState();
      const profile = getActiveProfile(state);

      if (
        !state.enabled ||
        !profile ||
        !profile.username ||
        details.isProxy !== true
      ) {
        callback({});
        return;
      }

      callback({
        authCredentials: {
          username: profile.username,
          password: profile.password || ""
        }
      });
    })().catch(() => callback({}));
  },
  { urls: ["<all_urls>"] },
  ["asyncBlocking"]
);

async function getState() {
  if (cachedState) return cachedState;

  const data = await chrome.storage.local.get(STORAGE_KEY);
  cachedState = normalizeState(data[STORAGE_KEY] || DEFAULT_STATE);
  return cachedState;
}

function sanitizeHeaders(headers) {
  const sensitive = new Set([
    "authorization",
    "cookie",
    "proxy-authorization"
  ]);

  return headers.map((header) => {
    const name = String(header.name || "");
    const value = sensitive.has(name.toLowerCase())
      ? "[masked]"
      : String(header.value || "");

    return { name, value };
  });
}

function upsertRequestRecord(requestId, patch) {
  const existing = requestRecordsById.get(requestId) || { id: requestId };
  const record = {
    ...existing,
    ...patch,
    requestHeaders: patch.requestHeaders || existing.requestHeaders || [],
    responseHeaders: patch.responseHeaders || existing.responseHeaders || [],
    statusCode: patch.statusCode ?? existing.statusCode ?? null,
    statusLine: patch.statusLine ?? existing.statusLine ?? "",
    error: patch.error ?? existing.error ?? ""
  };

  requestRecordsById.set(requestId, record);
  return record;
}

function storeHeaderRecord(record) {
  globalHeaderHistory = [
    record,
    ...globalHeaderHistory.filter((item) => item.id !== record.id)
  ].slice(0, MAX_HEADER_RECORDS * 4);

  if (record.tabId >= 0) {
    const records = headerHistoryByTab.get(record.tabId) || [];
    headerHistoryByTab.set(record.tabId, [
      record,
      ...records.filter((item) => item.id !== record.id)
    ].slice(0, MAX_HEADER_RECORDS));
  }
}

function addSecurityFindings(tabId, codes, url) {
  if (tabId < 0 || !Array.isArray(codes) || !codes.length) return;

  const existing = securityFindingsByTab.get(tabId) || [];
  const merged = new Map(existing.map((finding) => [finding.code, finding]));

  codes.forEach((code) => {
    const current = merged.get(code);
    merged.set(code, {
      code,
      url,
      count: current ? current.count + 1 : 1,
      lastSeen: Date.now()
    });
  });

  const findings = Array.from(merged.values())
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, 40);

  securityFindingsByTab.set(tabId, findings);
}

function mapCertificateError(error) {
  const value = String(error || "");
  const findings = [];

  if (!value.includes("ERR_CERT")) return findings;

  if (value.includes("DATE_INVALID")) findings.push("certificate:expired");
  if (value.includes("COMMON_NAME_INVALID")) findings.push("certificate:wrong.host", "certificate:no-common-name");
  if (value.includes("AUTHORITY_INVALID")) findings.push("certificate:untrusted-root", "certificate:self-signed");
  if (value.includes("REVOKED")) findings.push("certificate:revoked");
  if (value.includes("INVALID")) findings.push("certificate:invalid");
  if (value.includes("WEAK_SIGNATURE_ALGORITHM")) findings.push("certificate:weak-signature");

  return findings.length ? findings : ["certificate:error"];
}

function filterHeaderRecordsByUrl(records, url, invert = false) {
  const host = getUrlHost(url);
  if (!host) return invert ? records : records.slice(0, MAX_HEADER_RECORDS);

  const filtered = records.filter((record) => {
    const recordHost = getUrlHost(record.url);
    const sameHost = recordHost === host || recordHost.endsWith(`.${host}`) || host.endsWith(`.${recordHost}`);
    return invert ? !sameHost : sameHost;
  });

  return filtered.slice(0, MAX_HEADER_RECORDS);
}

function filterSecurityFindingsByUrl(findings, url, invert = false) {
  const host = getUrlHost(url);
  if (!host) return findings;

  return findings.filter((finding) => {
    const findingHost = getUrlHost(finding.url);
    const sameHost = !findingHost || findingHost === host || findingHost.endsWith(`.${host}`) || host.endsWith(`.${findingHost}`);
    return invert ? !sameHost : sameHost;
  });
}

function getUrlHost(url) {
  try {
    return new URL(url || "").hostname.toLowerCase();
  } catch (error) {
    return "";
  }
}

async function saveState(state) {
  cachedState = normalizeState(state);
  await chrome.storage.local.set({ [STORAGE_KEY]: cachedState });
}

function normalizeState(state) {
  const profiles = Array.isArray(state?.profiles) && state.profiles.length
    ? state.profiles.map(normalizeProfile)
    : [normalizeProfile(DEFAULT_PROFILE)];

  const activeProfileId = profiles.some((profile) => profile.id === state?.activeProfileId)
    ? state.activeProfileId
    : profiles[0].id;

  return {
    enabled: Boolean(state?.enabled),
    language: state?.language === "en" ? "en" : "ru",
    activeProfileId,
    profiles
  };
}

function normalizeProfile(profile) {
  return {
    id: String(profile?.id || crypto.randomUUID()),
    name: String(profile?.name || "Proxy profile"),
    type: ["HTTP", "HTTPS", "SOCKS4", "SOCKS5"].includes(profile?.type) ? profile.type : "SOCKS5",
    host: String(profile?.host || "").trim(),
    port: String(profile?.port || "").trim(),
    username: String(profile?.username || ""),
    password: String(profile?.password || ""),
    bypassList: String(profile?.bypassList || ""),
    domainList: String(profile?.domainList || ""),
    mode: profile?.mode === "onlySelected" ? "onlySelected" : "allExcept"
  };
}

function getActiveProfile(state) {
  return state.profiles.find((profile) => profile.id === state.activeProfileId) || state.profiles[0];
}

async function applyProxySettings() {
  const state = await getState();
  const profile = getActiveProfile(state);

  if (!state.enabled || !profile?.host || !isValidPort(profile.port)) {
    await chrome.proxy.settings.clear({ scope: "regular" });
    await setBadge(false, profile);
    return;
  }

  const config = buildPacConfig(profile);

  await chrome.proxy.settings.set({ value: config, scope: "regular" });
  await setBadge(true, profile);
}

function buildPacConfig(profile) {
  const proxy = pacProxyString(profile);
  const selectedDomains = splitRules(profile.domainList);
  const bypassDomains = splitRules(profile.bypassList);
  const mode = profile.mode;

  return {
    mode: "pac_script",
    pacScript: {
      data: `
function FindProxyForURL(url, host) {
  var selected = ${JSON.stringify(selectedDomains)};
  var bypass = ${JSON.stringify(bypassDomains)};
  var proxy = ${JSON.stringify(proxy)};
  var mode = ${JSON.stringify(mode)};

  if (matchesAny(host, bypass)) return "DIRECT";
  if (mode !== "onlySelected") return proxy;
  if (matchesAny(host, selected)) return proxy;
  return "DIRECT";
}

function matchesAny(host, rules) {
  host = normalizeHost(host);
  for (var i = 0; i < rules.length; i++) {
    if (matchesRule(host, rules[i])) return true;
  }
  return false;
}

function matchesRule(host, rule) {
  rule = normalizeHost(rule);
  if (!rule || rule === "<local>") return rule === "<local>" && host.indexOf(".") === -1;
  if (rule.charAt(0) === ".") rule = rule.slice(1);
  if (rule.indexOf("*.") === 0) rule = rule.slice(2);
  return host === rule || host.slice(-(rule.length + 1)) === "." + rule;
}

function normalizeHost(value) {
  return String(value || "")
    .replace(/^https?:\\/\\//, "")
    .replace(/\\/.*$/, "")
    .replace(/:\\d+$/, "")
    .toLowerCase();
}
`
    }
  };
}

function pacProxyString(profile) {
  const address = `${profile.host}:${Number(profile.port)}`;

  if (profile.type === "HTTP") return `PROXY ${address}`;
  if (profile.type === "HTTPS") return `HTTPS ${address}`;
  if (profile.type === "SOCKS4") return `SOCKS ${address}`;
  return `SOCKS5 ${address}`;
}

function splitRules(value) {
  return String(value || "")
    .split(/[\n,;]/)
    .map((item) => item.trim())
    .map(normalizeRule)
    .filter(Boolean);
}

function normalizeRule(rule) {
  if (!rule || rule === "<local>") return rule;

  const wildcardPrefix = rule.startsWith("*.") ? "*." : "";
  const dotPrefix = !wildcardPrefix && rule.startsWith(".") ? "." : "";
  const normalized = toAsciiHost(rule.slice(wildcardPrefix.length || dotPrefix.length));

  return normalized ? `${wildcardPrefix}${dotPrefix}${normalized}` : "";
}

function toAsciiHost(value) {
  const cleanValue = String(value || "")
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .toLowerCase();

  if (!cleanValue) return "";
  if (/^[\x00-\x7F]+$/.test(cleanValue)) return cleanValue;

  try {
    return new URL(`http://${cleanValue}`).hostname;
  } catch (error) {
    return "";
  }
}

function isValidPort(port) {
  const value = Number(port);
  return Number.isInteger(value) && value > 0 && value <= 65535;
}

async function setBadge(enabled, profile) {
  await chrome.action.setBadgeText({ text: enabled ? "ON" : "" });
  await chrome.action.setBadgeBackgroundColor({ color: enabled ? "#11a36a" : "#6b7280" });
  await chrome.action.setTitle({
    title: enabled && profile
      ? `Proxy Switcher Pro: ${profile.name} enabled`
      : "Proxy Switcher Pro: disabled"
  });
}

async function getProxyStatus() {
  const config = await chrome.proxy.settings.get({ incognito: false });
  return {
    levelOfControl: config.levelOfControl,
    value: config.value
  };
}

async function checkConnection() {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8500);

  try {
    const [proxyStatus, ipResponse] = await Promise.all([
      getProxyStatus(),
      fetch("https://api.ipify.org?format=json", {
        cache: "no-store",
        signal: controller.signal
      })
    ]);

    if (!ipResponse.ok) {
      throw new Error(`HTTP ${ipResponse.status}`);
    }

    const payload = await ipResponse.json();
    return {
      ok: true,
      ip: String(payload.ip || ""),
      latencyMs: Date.now() - startedAt,
      levelOfControl: proxyStatus.levelOfControl,
      proxyMode: proxyStatus.value?.mode || "unknown",
      checkedAt: Date.now()
    };
  } catch (error) {
    const proxyStatus = await getProxyStatus().catch(() => ({ levelOfControl: "unknown", value: {} }));
    return {
      ok: false,
      error: error.name === "AbortError" ? "timeout" : error.message || String(error),
      latencyMs: Date.now() - startedAt,
      levelOfControl: proxyStatus.levelOfControl,
      proxyMode: proxyStatus.value?.mode || "unknown",
      checkedAt: Date.now()
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
