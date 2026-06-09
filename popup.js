let state = null;
let activeProfile = null;
let saveTimer = null;
let currentPage = "status";
let pageRisk = null;
let activeTabId = null;
let activeTabUrl = "";
let securityFindings = [];
let headerRecords = [];
let headerStats = {
  tabRecordCount: 0,
  globalRecordCount: 0,
  lastCapturedAt: null
};
let connectionCheck = null;
let connectionCheckBusy = false;

const $ = (id) => document.getElementById(id);
const t = (key) => window.ProxyI18n.t(key, state?.language || "ru");
const CHECK_HOST = "api.ipify.org";

const elements = {
  app: document.querySelector(".app"),
  statusTab: $("statusTab"),
  headersTab: $("headersTab"),
  settingsTab: $("settingsTab"),
  statusPage: $("statusPage"),
  headersPage: $("headersPage"),
  settingsPage: $("settingsPage"),
  statusText: $("statusText"),
  statusEyebrow: $("statusEyebrow"),
  statusHeadline: $("statusHeadline"),
  statusDescription: $("statusDescription"),
  statProfileLabel: $("statProfileLabel"),
  statProfile: $("statProfile"),
  statServerLabel: $("statServerLabel"),
  statServer: $("statServer"),
  statModeLabel: $("statModeLabel"),
  statMode: $("statMode"),
  statAuthLabel: $("statAuthLabel"),
  statAuth: $("statAuth"),
  checkCard: $("checkCard"),
  checkLabel: $("checkLabel"),
  checkHeadline: $("checkHeadline"),
  runCheck: $("runCheck"),
  checkIpLabel: $("checkIpLabel"),
  checkIp: $("checkIp"),
  checkControlLabel: $("checkControlLabel"),
  checkControl: $("checkControl"),
  checkLatencyLabel: $("checkLatencyLabel"),
  checkLatency: $("checkLatency"),
  checkRouteLabel: $("checkRouteLabel"),
  checkRoute: $("checkRoute"),
  riskCard: $("riskCard"),
  riskLabel: $("riskLabel"),
  riskLevel: $("riskLevel"),
  riskPill: $("riskPill"),
  riskUrl: $("riskUrl"),
  riskReasons: $("riskReasons"),
  riskDetailsLabel: $("riskDetailsLabel"),
  riskDetails: $("riskDetails"),
  riskTimelineLabel: $("riskTimelineLabel"),
  riskTimelineCount: $("riskTimelineCount"),
  riskTimeline: $("riskTimeline"),
  refreshRisk: $("refreshRisk"),
  clearRisk: $("clearRisk"),
  openSettings: $("openSettings"),
  headersTitle: $("headersTitle"),
  headersSubtitle: $("headersSubtitle"),
  refreshHeaders: $("refreshHeaders"),
  clearHeaders: $("clearHeaders"),
  diagTabLabel: $("diagTabLabel"),
  diagTabId: $("diagTabId"),
  diagTabRecordsLabel: $("diagTabRecordsLabel"),
  diagTabRecords: $("diagTabRecords"),
  diagGlobalRecordsLabel: $("diagGlobalRecordsLabel"),
  diagGlobalRecords: $("diagGlobalRecords"),
  diagLastCaptureLabel: $("diagLastCaptureLabel"),
  diagLastCapture: $("diagLastCapture"),
  headersList: $("headersList"),
  messageText: $("messageText"),
  footer: document.querySelector(".footer"),
  toggleProxy: $("toggleProxy"),
  profileSelect: $("profileSelect"),
  addProfile: $("addProfile"),
  deleteProfile: $("deleteProfile"),
  profileName: $("profileName"),
  proxyType: $("proxyType"),
  proxyHost: $("proxyHost"),
  proxyPort: $("proxyPort"),
  proxyUsername: $("proxyUsername"),
  proxyPassword: $("proxyPassword"),
  bypassList: $("bypassList"),
  bypassHelp: $("bypassHelp"),
  bypassHint: $("bypassHint"),
  domainList: $("domainList"),
  domainListField: $("domainListField"),
  domainHelp: $("domainHelp"),
  domainHint: $("domainHint"),
  routeTest: document.querySelector(".route-test"),
  routeTestLabel: $("routeTestLabel"),
  routeTestHint: $("routeTestHint"),
  routeTestResult: $("routeTestResult"),
  routeTestInputLabel: $("routeTestInputLabel"),
  routeTestInput: $("routeTestInput"),
  routeTestReason: $("routeTestReason"),
  modeAllExcept: $("modeAllExcept"),
  modeOnlySelected: $("modeOnlySelected"),
  saveProfile: $("saveProfile"),
  exportSettings: $("exportSettings"),
  importLabel: $("importLabel"),
  importSettings: $("importSettings"),
  langRu: $("langRu"),
  langEn: $("langEn")
};

init();

async function init() {
  const response = await sendMessage({ type: "GET_STATE" });
  state = normalizeState(response.state);
  bindEvents();
  render();
  updatePageRisk();
}

function bindEvents() {
  elements.toggleProxy.addEventListener("click", async () => {
    syncFormToState();
    const validation = validateProfile(activeProfile);
    if (!state.enabled && validation) {
      showMessage(validation, "bad");
      return;
    }

    state.enabled = !state.enabled;
    await persist(t(state.enabled ? "enabledAction" : "disabledAction"));
  });

  elements.profileSelect.addEventListener("change", async () => {
    syncFormToState();
    state.activeProfileId = elements.profileSelect.value;
    activeProfile = getActiveProfile();
    render();
    await persist(t("profileSelected"), false);
  });

  elements.addProfile.addEventListener("click", async () => {
    syncFormToState();
    const profile = createProfile();
    state.profiles.push(profile);
    state.activeProfileId = profile.id;
    render();
    await persist(t("profileAdded"));
  });

  elements.deleteProfile.addEventListener("click", async () => {
    if (state.profiles.length === 1) {
      showMessage(t("keepOne"), "bad");
      return;
    }

    state.profiles = state.profiles.filter((profile) => profile.id !== state.activeProfileId);
    state.activeProfileId = state.profiles[0].id;
    render();
    await persist(t("profileDeleted"));
  });

  [
    elements.profileName,
    elements.proxyType,
    elements.proxyHost,
    elements.proxyPort,
    elements.proxyUsername,
    elements.proxyPassword,
    elements.bypassList,
    elements.domainList
  ].forEach((element) => {
    element.addEventListener("input", () => {
      scheduleSave();
      renderRouteTest();
    });
    element.addEventListener("change", () => {
      scheduleSave();
      renderRouteTest();
    });
  });

  elements.routeTestInput.addEventListener("input", () => renderRouteTest());
  elements.modeAllExcept.addEventListener("click", () => setMode("allExcept"));
  elements.modeOnlySelected.addEventListener("click", () => setMode("onlySelected"));
  elements.statusTab.addEventListener("click", () => setPage("status"));
  elements.headersTab.addEventListener("click", () => setPage("headers"));
  elements.settingsTab.addEventListener("click", () => setPage("settings"));
  elements.openSettings.addEventListener("click", () => setPage("settings"));
  elements.runCheck.addEventListener("click", () => runConnectionCheck());
  elements.refreshRisk.addEventListener("click", () => updatePageRisk(true));
  elements.clearRisk.addEventListener("click", () => clearRiskTimeline());
  elements.refreshHeaders.addEventListener("click", () => updateHeaderHistory());
  elements.clearHeaders.addEventListener("click", () => clearHeaderHistory());
  elements.bypassHelp.addEventListener("click", () => toggleHint(elements.bypassHint));
  elements.domainHelp.addEventListener("click", () => toggleHint(elements.domainHint));
  elements.langRu.addEventListener("click", () => setLanguage("ru"));
  elements.langEn.addEventListener("click", () => setLanguage("en"));
  elements.saveProfile.addEventListener("click", () => persist(t("saved")));
  elements.exportSettings.addEventListener("click", exportSettings);
  elements.importSettings.addEventListener("change", importSettings);
}

function render() {
  activeProfile = getActiveProfile();
  applyLanguage();
  renderPage();
  elements.app.classList.toggle("enabled", state.enabled);
  elements.statusText.textContent = statusText();

  elements.profileSelect.innerHTML = "";
  state.profiles.forEach((profile) => {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name || "Proxy profile";
    elements.profileSelect.appendChild(option);
  });
  elements.profileSelect.value = activeProfile.id;

  elements.profileName.value = activeProfile.name;
  elements.proxyType.value = activeProfile.type;
  elements.proxyHost.value = activeProfile.host;
  elements.proxyPort.value = activeProfile.port;
  elements.proxyUsername.value = activeProfile.username;
  elements.proxyPassword.value = activeProfile.password;
  elements.bypassList.value = activeProfile.bypassList;
  elements.domainList.value = activeProfile.domainList;

  elements.modeAllExcept.classList.toggle("active", activeProfile.mode === "allExcept");
  elements.modeOnlySelected.classList.toggle("active", activeProfile.mode === "onlySelected");
  elements.domainListField.style.display = activeProfile.mode === "onlySelected" ? "grid" : "none";
  elements.domainHint.hidden = activeProfile.mode === "onlySelected" ? elements.domainHint.hidden : true;

  renderStatus();
  renderConnectionCheck();
  renderRisk();
  renderHeaders();
  renderHeaderDiagnostics();
  renderRouteTest();
}

function renderPage() {
  const isStatus = currentPage === "status";
  const isHeaders = currentPage === "headers";
  elements.statusTab.classList.toggle("active", isStatus);
  elements.headersTab.classList.toggle("active", isHeaders);
  elements.settingsTab.classList.toggle("active", currentPage === "settings");
  elements.statusPage.classList.toggle("active", isStatus);
  elements.headersPage.classList.toggle("active", isHeaders);
  elements.settingsPage.classList.toggle("active", currentPage === "settings");
}

function renderStatus() {
  const validation = validateProfile(activeProfile);
  const configured = activeProfile.host && window.ProxyRules.isValidPort(activeProfile.port);

  elements.statusHeadline.textContent = state.enabled ? t("proxyEnabledHeadline") : t("proxyDisabledHeadline");
  elements.statusDescription.textContent = state.enabled && !validation
    ? t("proxyEnabledDescription")
    : validation || t("proxyDisabledDescription");
  elements.statProfile.textContent = activeProfile.name || "Proxy profile";
  elements.statServer.textContent = configured
    ? `${activeProfile.type} ${activeProfile.host}:${activeProfile.port}`
    : t("notConfigured");
  elements.statMode.textContent = modeLabel(activeProfile.mode);
  elements.statAuth.textContent = activeProfile.username ? t("on") : t("off");
}

function renderConnectionCheck() {
  elements.checkCard.classList.remove("good", "bad", "busy");
  elements.checkCard.classList.toggle("busy", connectionCheckBusy);

  if (connectionCheckBusy) {
    elements.checkHeadline.textContent = t("checkRunning");
    elements.checkIp.textContent = "-";
    elements.checkControl.textContent = "-";
    elements.checkLatency.textContent = "-";
    elements.checkRoute.textContent = expectedRouteLabel();
    return;
  }

  if (!connectionCheck) {
    elements.checkHeadline.textContent = t("checkNotRun");
    elements.checkIp.textContent = "-";
    elements.checkControl.textContent = "-";
    elements.checkLatency.textContent = "-";
    elements.checkRoute.textContent = expectedRouteLabel();
    return;
  }

  elements.checkCard.classList.add(connectionCheck.ok ? "good" : "bad");
  elements.checkHeadline.textContent = connectionCheck.ok
    ? t("checkOk")
    : `${t("checkFailed")}: ${connectionCheck.error || "error"}`;
  elements.checkIp.textContent = connectionCheck.ip || "-";
  elements.checkControl.textContent = connectionCheck.levelOfControl || "-";
  elements.checkLatency.textContent = Number.isFinite(connectionCheck.latencyMs)
    ? `${connectionCheck.latencyMs} ms`
    : "-";
  elements.checkRoute.textContent = expectedRouteLabel(connectionCheck.proxyMode);
}

function renderRisk() {
  const risk = pageRisk || {
    level: "unknown",
    url: t("noActivePage"),
    reasons: [t("noActivePage")],
    groups: {}
  };
  const levelKey = risk.level === "high" ? "riskHigh" : risk.level === "medium" ? "riskMedium" : risk.level === "low" ? "riskLow" : "riskUnknown";

  elements.riskCard.classList.remove("low", "medium", "high", "unknown");
  elements.riskCard.classList.add(risk.level || "unknown");
  elements.riskLevel.textContent = t(levelKey);
  elements.riskPill.textContent = (risk.level || "unknown").toUpperCase();
  elements.riskUrl.textContent = risk.url || t("noActivePage");
  elements.riskReasons.innerHTML = "";

  const reasonList = Array.isArray(risk.reasons) ? risk.reasons : [];
  const reasons = reasonList.length ? reasonList : [t("noRiskReasons")];
  reasons.slice(0, 4).forEach((reason) => {
    const item = document.createElement("li");
    item.textContent = reason;
    elements.riskReasons.appendChild(item);
  });

  renderRiskDetails(risk.groups || {});
  renderRiskTimeline(securityFindings);
}

function renderRiskDetails(groups) {
  const groupOrder = [
    "certificate",
    "clientCertificate",
    "mixed",
    "http",
    "cipher",
    "proxy",
    "url"
  ];
  const filledGroups = groupOrder
    .map((group) => [group, Array.isArray(groups[group]) ? groups[group] : []])
    .filter(([, reasons]) => reasons.length);

  elements.riskDetails.innerHTML = "";

  if (!filledGroups.length) {
    const empty = document.createElement("div");
    empty.className = "risk-group empty";
    empty.textContent = t("riskGroupEmpty");
    elements.riskDetails.appendChild(empty);
    return;
  }

  filledGroups.forEach(([group, reasons]) => {
    const section = document.createElement("section");
    section.className = "risk-group";

    const head = document.createElement("div");
    head.className = "risk-group-head";
    head.append(
      textNode("strong", "", riskGroupLabel(group)),
      textNode("span", "risk-count", String(reasons.length))
    );

    const list = document.createElement("ul");
    reasons.forEach((reason) => {
      const item = document.createElement("li");
      item.textContent = reason;
      list.appendChild(item);
    });

    section.append(head, list);
    elements.riskDetails.appendChild(section);
  });
}

function renderRiskTimeline(findings) {
  const events = [...findings]
    .filter((finding) => finding?.code)
    .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
    .slice(0, 12);

  elements.riskTimelineCount.textContent = String(events.length);
  elements.riskTimeline.innerHTML = "";

  if (!events.length) {
    const empty = document.createElement("div");
    empty.className = "risk-group empty";
    empty.textContent = t("riskTimelineEmpty");
    elements.riskTimeline.appendChild(empty);
    return;
  }

  events.forEach((finding) => {
    const event = document.createElement("article");
    event.className = "risk-event";

    const top = document.createElement("div");
    top.className = "risk-event-top";
    top.append(
      textNode("span", "risk-event-kind", riskSignalKind(finding.code)),
      textNode("span", "risk-event-code", finding.code),
      textNode("span", "risk-event-count", `x${finding.count || 1}`)
    );

    const meta = document.createElement("div");
    meta.className = "risk-event-meta";
    meta.append(
      textNode("span", "", finding.lastSeen ? new Date(finding.lastSeen).toLocaleTimeString() : "-"),
      textNode("span", "risk-event-url", finding.url || activeTabUrl || "")
    );

    event.append(top, meta);
    elements.riskTimeline.appendChild(event);
  });
}

function renderHeaders() {
  elements.headersList.innerHTML = "";

  if (!headerRecords.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = t("noHeaders");
    elements.headersList.appendChild(empty);
    return;
  }

  headerRecords.forEach((record) => {
    const details = document.createElement("details");
    details.className = "header-record";

    const summary = document.createElement("summary");
    summary.append(
      textNode("span", "header-method", record.method || "GET"),
      textNode("span", "header-type", record.type || "other"),
      textNode("span", statusClass(record), statusLabel(record)),
      textNode("span", "header-url", record.url || "")
    );

    const table = document.createElement("div");
    table.className = "header-table";
    appendHeaderSection(table, t("requestSection"), record.requestHeaders || [], t("noRequestHeaders"));
    appendHeaderSection(table, t("responseSection"), record.responseHeaders || [], t("noResponseHeaders"));

    details.append(summary, table);
    elements.headersList.appendChild(details);
  });
}

function renderHeaderDiagnostics() {
  elements.diagTabId.textContent = activeTabId === null ? "-" : String(activeTabId);
  elements.diagTabRecords.textContent = String(headerStats.tabRecordCount || 0);
  elements.diagGlobalRecords.textContent = String(headerStats.globalRecordCount || 0);
  elements.diagLastCapture.textContent = headerStats.lastCapturedAt
    ? new Date(headerStats.lastCapturedAt).toLocaleTimeString()
    : "-";
}

function renderRouteTest() {
  if (!state || !activeProfile) return;

  syncFormToState();
  const rawValue = elements.routeTestInput.value.trim();
  const host = normalizeRouteTestHost(rawValue);
  elements.routeTest.classList.remove("proxy", "direct", "bad");

  if (!rawValue) {
    setRouteTestResult("-", t("routeTestEmpty"), "");
    return;
  }

  if (!host) {
    setRouteTestResult("!", t("routeTestInvalid"), "bad");
    return;
  }

  const validation = validateProfile(activeProfile);
  if (!state.enabled) {
    setRouteTestResult(t("routeResultDirect"), `${host}: ${t("routeTestProxyOff")}`, "direct");
    return;
  }

  if (validation) {
    setRouteTestResult(t("routeResultDirect"), `${host}: ${formatTemplate(t("routeTestProfileInvalid"), { reason: validation })}`, "bad");
    return;
  }

  const bypassRule = findMatchingRule(host, activeProfile.bypassList);
  if (bypassRule) {
    setRouteTestResult(t("routeResultDirect"), `${host}: ${formatTemplate(t("routeTestBypass"), { rule: bypassRule })}`, "direct");
    return;
  }

  if (activeProfile.mode === "onlySelected") {
    const selectedRule = findMatchingRule(host, activeProfile.domainList);
    if (selectedRule) {
      setRouteTestResult(t("routeResultProxy"), `${host}: ${formatTemplate(t("routeTestSelected"), { rule: selectedRule })}`, "proxy");
      return;
    }

    setRouteTestResult(t("routeResultDirect"), `${host}: ${t("routeTestNotSelected")}`, "direct");
    return;
  }

  setRouteTestResult(t("routeResultProxy"), `${host}: ${t("routeTestAll")}`, "proxy");
}

function setRouteTestResult(result, reason, tone) {
  elements.routeTestResult.textContent = result;
  elements.routeTestReason.textContent = reason;
  if (tone) elements.routeTest.classList.add(tone);
}

function statusText() {
  if (!state.enabled) return t("disabled");
  const validation = validateProfile(activeProfile);
  if (validation) return validation;
  return `${activeProfile.type} ${activeProfile.host}:${activeProfile.port}`;
}

function setMode(mode) {
  syncFormToState();
  activeProfile.mode = mode;
  render();
  scheduleSave();
}

function setPage(page) {
  currentPage = page;
  render();
  if (page === "status") updatePageRisk();
  if (page === "headers") updateHeaderHistory();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist(t("autoSaved"), false), 450);
}

async function persist(message = t("saved"), visible = true) {
  clearTimeout(saveTimer);
  syncFormToState();
  state = normalizeState(state);
  connectionCheck = null;
  render();

  const response = await sendMessage({ type: "SAVE_STATE", state });
  if (!response.ok) {
    showMessage(response.error || t("saveFailed"), "bad");
    return;
  }

  state = normalizeState(response.state);
  render();
  updatePageRisk();
  if (visible) showMessage(message, "good");
}

async function runConnectionCheck() {
  connectionCheckBusy = true;
  renderConnectionCheck();

  try {
    const response = await sendMessage({ type: "CHECK_CONNECTION" });
    connectionCheck = response.ok ? response.result : { ok: false, error: response.error || "error" };
    showMessage(connectionCheck.ok ? t("checkDone") : t("checkFailed"), connectionCheck.ok ? "good" : "bad");
  } catch (error) {
    connectionCheck = { ok: false, error: error.message || String(error) };
    showMessage(t("checkFailed"), "bad");
  } finally {
    connectionCheckBusy = false;
    renderConnectionCheck();
  }
}

function syncFormToState() {
  activeProfile = getActiveProfile();
  activeProfile.name = elements.profileName.value.trim() || "Proxy profile";
  activeProfile.type = elements.proxyType.value;
  activeProfile.host = elements.proxyHost.value.trim();
  activeProfile.port = elements.proxyPort.value.trim();
  activeProfile.username = elements.proxyUsername.value;
  activeProfile.password = elements.proxyPassword.value;
  activeProfile.bypassList = elements.bypassList.value;
  activeProfile.domainList = elements.domainList.value;
}

function validateProfile(profile) {
  if (!profile.host) return t("hostRequired");
  if (!window.ProxyRules.isValidPort(profile.port)) return t("portInvalid");
  if (profile.mode === "onlySelected" && !profile.domainList.trim()) return t("selectedRequired");
  return "";
}

function modeLabel(mode) {
  return mode === "onlySelected" ? t("modeOnlySelected") : t("modeAllExcept");
}

function expectedRouteLabel(proxyMode = "") {
  const validation = activeProfile ? validateProfile(activeProfile) : "";
  const usesProxy = state?.enabled && !validation && window.ProxyRules.pageUsesProxy(CHECK_HOST, activeProfile);
  if (usesProxy) return `${t("routeProxy")} (${activeProfile.type}${proxyMode ? `, ${proxyMode}` : ""})`;
  return t("routeDirect");
}

function normalizeRouteTestHost(value) {
  const cleanValue = String(value || "").trim();
  if (!cleanValue) return "";

  try {
    return new URL(cleanValue.includes("://") ? cleanValue : `http://${cleanValue}`).hostname.toLowerCase();
  } catch (error) {
    return "";
  }
}

function findMatchingRule(host, rulesText) {
  return window.ProxyRules
    .splitRules(rulesText)
    .find((rule) => window.ProxyRules.matchesRule(host, rule)) || "";
}

function formatTemplate(template, values) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, value),
    template
  );
}

function getActiveProfile() {
  return state.profiles.find((profile) => profile.id === state.activeProfileId) || state.profiles[0];
}

function createProfile() {
  return {
    id: crypto.randomUUID(),
    name: `Profile ${state.profiles.length + 1}`,
    type: "SOCKS5",
    host: "",
    port: "",
    username: "",
    password: "",
    bypassList: "localhost\n127.0.0.1\n<local>",
    domainList: "",
    mode: "allExcept"
  };
}

function normalizeState(source) {
  const profiles = Array.isArray(source?.profiles) && source.profiles.length
    ? source.profiles.map(normalizeProfile)
    : [createFallbackProfile()];

  const activeProfileId = profiles.some((profile) => profile.id === source?.activeProfileId)
    ? source.activeProfileId
    : profiles[0].id;

  return {
    enabled: Boolean(source?.enabled),
    language: source?.language === "en" ? "en" : "ru",
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

function createFallbackProfile() {
  return {
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
}

async function exportSettings() {
  syncFormToState();
  const payload = JSON.stringify(state, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "proxy-switcher-pro-settings.json";
  link.click();
  URL.revokeObjectURL(url);
  showMessage(t("exported"), "good");
}

async function importSettings(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    state = normalizeState(JSON.parse(text));
    render();

    const response = await sendMessage({ type: "SAVE_STATE", state });
    if (!response.ok) {
      showMessage(response.error || t("importFailed"), "bad");
      return;
    }

    state = normalizeState(response.state);
    render();
    showMessage(t("imported"), "good");
  } catch (error) {
    showMessage(t("invalidJson"), "bad");
  } finally {
    event.target.value = "";
  }
}

async function setLanguage(language) {
  syncFormToState();
  state.language = language;
  render();
  await persist(t("saved"), false);
}

async function updatePageRisk(visible = false) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTabId = tab?.id ?? null;
    activeTabUrl = tab?.url || "";
    const liveFindings = await scanActivePage(activeTabId, activeTabUrl);
    const storedFindings = activeTabId === null
      ? []
      : (await sendMessage({ type: "GET_SECURITY_FINDINGS", tabId: activeTabId, url: activeTabUrl })).findings || [];
    securityFindings = mergeSecurityFindings(storedFindings, liveFindings);
    pageRisk = window.ProxyRisk.analyzePageRisk({
      url: activeTabUrl,
      state,
      profile: activeProfile,
      securityFindings,
      t
    });
  } catch (error) {
    pageRisk = {
      level: "unknown",
      url: t("noActivePage"),
      reasons: [t("noActivePage")],
      groups: {}
    };
  }

  renderRisk();
  if (visible) showMessage(t("riskUpdated"), "good");
}

async function clearRiskTimeline() {
  if (activeTabId !== null) {
    await sendMessage({
      type: "CLEAR_SECURITY_FINDINGS",
      tabId: activeTabId,
      url: activeTabUrl
    });
  }

  securityFindings = [];
  pageRisk = window.ProxyRisk.analyzePageRisk({
    url: activeTabUrl,
    state,
    profile: activeProfile,
    securityFindings,
    t
  });
  renderRisk();
  showMessage(t("riskCleared"), "good");
}

async function scanActivePage(tabId, url) {
  if (tabId === null || !/^https?:\/\//i.test(url || "")) return [];

  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "SCAN_PAGE_SECURITY" });
    const findings = Array.isArray(response?.findings) ? response.findings : [];
    if (!findings.length) return [];

    await sendMessage({
      type: "PAGE_SECURITY_SCAN",
      tabId,
      url: response.url || url,
      findings
    });

    return findings.map((code) => ({
      code,
      url: response.url || url,
      count: 1,
      lastSeen: Date.now()
    }));
  } catch (error) {
    return [];
  }
}

function mergeSecurityFindings(storedFindings, liveFindings) {
  const merged = new Map();

  [...storedFindings, ...liveFindings].forEach((finding) => {
    const code = typeof finding === "string" ? finding : finding.code;
    if (!code) return;

    const current = merged.get(code);
    const count = typeof finding === "object" ? finding.count || 1 : 1;
    merged.set(code, {
      code,
      url: typeof finding === "object" ? finding.url || "" : "",
      count: current ? Math.max(current.count, count) : count,
      lastSeen: Math.max(current?.lastSeen || 0, typeof finding === "object" ? finding.lastSeen || 0 : 0)
    });
  });

  return Array.from(merged.values());
}

async function updateHeaderHistory() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTabId = tab?.id ?? null;
    activeTabUrl = tab?.url || "";

    if (activeTabId === null) {
      headerRecords = [];
      headerStats = { tabRecordCount: 0, globalRecordCount: 0, lastCapturedAt: null };
      renderHeaders();
      renderHeaderDiagnostics();
      showMessage(t("headersEmptyHint"), "bad");
      return;
    }

    const response = await sendMessage({
      type: "GET_HEADER_HISTORY",
      tabId: activeTabId,
      url: activeTabUrl
    });
    headerRecords = response.ok ? response.records || [] : [];
    headerStats = {
      tabRecordCount: response.tabRecordCount || 0,
      globalRecordCount: response.globalRecordCount || 0,
      lastCapturedAt: response.lastCapturedAt || null
    };

    showMessage(headerRecords.length ? `${t("headersUpdated")}: ${headerRecords.length}` : t("headersEmptyHint"), headerRecords.length ? "good" : "bad");
  } catch (error) {
    headerRecords = [];
    headerStats = { tabRecordCount: 0, globalRecordCount: 0, lastCapturedAt: null };
    showMessage(t("headersEmptyHint"), "bad");
  }

  renderHeaders();
  renderHeaderDiagnostics();
}

async function clearHeaderHistory() {
  if (activeTabId !== null) {
    await sendMessage({
      type: "CLEAR_HEADER_HISTORY",
      tabId: activeTabId,
      url: activeTabUrl
    });
  }

  headerRecords = [];
  headerStats = { tabRecordCount: 0, globalRecordCount: 0, lastCapturedAt: null };
  renderHeaders();
  renderHeaderDiagnostics();
  showMessage(t("headersCleared"), "good");
}

function applyLanguage() {
  document.documentElement.lang = state.language;
  elements.langRu.classList.toggle("active", state.language === "ru");
  elements.langEn.classList.toggle("active", state.language === "en");

  setText("statusTab", t("statusTab"));
  setText("headersTab", t("headersTab"));
  setText("settingsTab", t("settingsTab"));
  setText("statusEyebrow", t("currentState"));
  setText("statProfileLabel", t("profile"));
  setText("statServerLabel", t("server"));
  setText("statModeLabel", t("mode"));
  setText("statAuthLabel", t("auth"));
  setText("checkLabel", t("connectionCheck"));
  setText("runCheck", t("check"));
  setText("checkIpLabel", t("visibleIp"));
  setText("checkControlLabel", t("chromeControl"));
  setText("checkLatencyLabel", t("latency"));
  setText("checkRouteLabel", t("expectedRoute"));
  setText("riskLabel", t("pageRisk"));
  setText("riskDetailsLabel", t("riskDetails"));
  setText("riskTimelineLabel", t("riskTimeline"));
  setText("refreshRisk", t("refreshRisk"));
  setText("clearRisk", t("clearRisk"));
  setText("openSettings", t("openSettings"));
  setText("headersTitle", t("requestHeaders"));
  setText("headersSubtitle", t("requestHeadersSubtitle"));
  setText("refreshHeaders", t("refresh"));
  setText("clearHeaders", t("clear"));
  setText("diagTabLabel", t("diagTab"));
  setText("diagTabRecordsLabel", t("diagTabRecords"));
  setText("diagGlobalRecordsLabel", t("diagGlobalRecords"));
  setText("diagLastCaptureLabel", t("diagLastCapture"));
  setText("labelProfileName", t("profileName"));
  setText("labelType", t("type"));
  setText("labelPort", t("port"));
  setText("labelHost", t("host"));
  setText("labelUsername", t("username"));
  setText("labelPassword", t("password"));
  setText("modeAllExcept", t("modeAllExcept"));
  setText("modeOnlySelected", t("modeOnlySelected"));
  setText("labelBypassList", t("bypassList"));
  setText("bypassHintTitle", t("bypassHintTitle"));
  setText("bypassHintText", t("bypassHintText"));
  setText("labelDomainList", t("domainList"));
  setText("domainHintTitle", t("domainHintTitle"));
  setText("domainHintText", t("domainHintText"));
  setText("routeTestLabel", t("routeTester"));
  setText("routeTestHint", t("routeTesterHint"));
  setText("routeTestInputLabel", t("routeTestInput"));
  setText("saveProfile", t("save"));
  setText("exportSettings", t("export"));
  elements.importLabel.childNodes[0].textContent = `${t("import")}\n            `;

  elements.toggleProxy.title = t("enableDisable");
  elements.toggleProxy.setAttribute("aria-label", t("enableDisable"));
  elements.addProfile.title = t("addProfile");
  elements.addProfile.setAttribute("aria-label", t("addProfile"));
  elements.deleteProfile.title = t("deleteProfile");
  elements.deleteProfile.setAttribute("aria-label", t("deleteProfile"));
  elements.bypassHelp.title = t("bypassHelp");
  elements.bypassHelp.setAttribute("aria-label", t("bypassHelp"));
  elements.domainHelp.title = t("domainHelp");
  elements.domainHelp.setAttribute("aria-label", t("domainHelp"));
  elements.profileName.placeholder = t("profilePlaceholder");
  elements.proxyUsername.placeholder = t("optional");
  elements.proxyPassword.placeholder = t("optional");
  elements.routeTestInput.placeholder = "example.com";
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function textNode(tagName, className, value) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = value || "";
  return element;
}

function riskGroupLabel(group) {
  const labels = {
    certificate: "riskGroupCertificate",
    clientCertificate: "riskGroupClientCertificate",
    mixed: "riskGroupMixed",
    http: "riskGroupHttp",
    cipher: "riskGroupCipher",
    proxy: "riskGroupProxy",
    url: "riskGroupUrl"
  };

  return t(labels[group] || "riskGroupUrl");
}

function riskSignalKind(code) {
  if (code.startsWith("certificate:") || isNamedSignal(code, "certificate")) return "cert";
  if (code.startsWith("client-certificate:") || isNamedSignal(code, "client")) return "client";
  if (code.startsWith("cipher:") || isNamedSignal(code, "cipher")) return "tls";
  if (code.startsWith("mixed")) return "mixed";
  if (code.startsWith("http")) return "http";
  return "url";
}

function isNamedSignal(code, group) {
  const groups = {
    certificate: [
      "expired",
      "wrong.host",
      "self-signed",
      "untrusted-root",
      "revoked",
      "pinning-test",
      "no-common-name",
      "no-subject",
      "incomplete-chain"
    ],
    client: ["client", "client-cert-missing", "certificate-downloads"],
    cipher: ["cbc", "rc4-md5", "rc4", "3des", "null", "mozilla-old", "mozilla-intermediate", "mozilla-modern"]
  };

  return groups[group]?.includes(code);
}

function appendHeaderSection(container, title, headers, emptyText) {
  container.appendChild(textNode("div", "header-section-title", title));

  if (!headers.length) {
    const empty = document.createElement("div");
    empty.className = "header-row";
    empty.append(
      textNode("span", "header-name", "-"),
      textNode("span", "header-value", emptyText)
    );
    container.appendChild(empty);
    return;
  }

  headers.forEach((header) => {
    const row = document.createElement("div");
    row.className = "header-row";
    row.append(
      textNode("span", "header-name", header.name),
      textNode("span", "header-value", header.value)
    );
    container.appendChild(row);
  });
}

function statusLabel(record) {
  if (record.error) return "ERR";
  return record.statusCode ? String(record.statusCode) : "...";
}

function statusClass(record) {
  const status = Number(record.statusCode);
  if (record.error || status >= 500) return "header-status bad";
  if (status >= 300) return "header-status warn";
  if (status >= 200) return "header-status ok";
  return "header-status";
}

function toggleHint(element) {
  element.hidden = !element.hidden;
}

function showMessage(message, tone = "") {
  elements.messageText.textContent = message;
  elements.footer.className = "footer" + (tone ? ` ${tone}` : "");
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => {
    elements.messageText.textContent = "";
    elements.footer.className = "footer";
  }, 2600);
}

function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}
