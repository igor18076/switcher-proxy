function analyzePageRisk({ url, state, profile, securityFindings = [], t }) {
  const reasons = [];
  const groups = createRiskGroups();
  let score = 0;

  if (!url) {
    addRisk(groups, "url", t("noActivePage"));
    return { level: "unknown", score: 0, url: t("noActivePage"), reasons: [t("noActivePage")], groups };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    addRisk(groups, "url", t("noActivePage"));
    return { level: "unknown", score: 0, url, reasons: [t("noActivePage")], groups };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    addRisk(groups, "url", t("reasonChromePage"));
    return { level: "low", score: 0, url, reasons: [t("reasonChromePage")], groups };
  }

  const host = parsed.hostname.toLowerCase();
  const labels = host.split(".").filter(Boolean);

  if (parsed.protocol === "http:") {
    score += 45;
    reasons.push(t("reasonHttp"));
    addRisk(groups, "http", t("reasonHttp"));
  }

  if (isIpAddress(host)) {
    score += 25;
    reasons.push(t("reasonIp"));
    addRisk(groups, "url", t("reasonIp"));
  }

  if (host.includes("xn--")) {
    score += 30;
    reasons.push(t("reasonPunycode"));
    addRisk(groups, "url", t("reasonPunycode"));
  }

  if (host.length > 45) {
    score += 15;
    reasons.push(t("reasonLongDomain"));
    addRisk(groups, "url", t("reasonLongDomain"));
  }

  if (labels.length > 4) {
    score += 15;
    reasons.push(t("reasonManySubdomains"));
    addRisk(groups, "url", t("reasonManySubdomains"));
  }

  if ((host.match(/-/g) || []).length >= 3) {
    score += 10;
    reasons.push(t("reasonManyHyphens"));
    addRisk(groups, "url", t("reasonManyHyphens"));
  }

  if (!state.enabled) {
    score += 10;
    reasons.push(t("reasonProxyOff"));
    addRisk(groups, "proxy", t("reasonProxyOff"));
  } else if (!window.ProxyRules.pageUsesProxy(host, profile)) {
    score += 10;
    reasons.push(t("reasonDirectRoute"));
    addRisk(groups, "proxy", t("reasonDirectRoute"));
  }

  const signalResult = scoreSecurityFindings(securityFindings);
  score += signalResult.score;
  reasons.push(...signalResult.reasons);
  mergeRiskGroups(groups, signalResult.groups);

  const level = score >= 45 ? "high" : score >= 20 ? "medium" : "low";
  return { level, score, url, reasons, groups };
}

function scoreSecurityFindings(findings) {
  const reasons = [];
  const groups = createRiskGroups();
  let score = 0;

  findings.forEach((finding) => {
    const code = typeof finding === "string" ? finding : finding.code;
    const count = typeof finding === "object" ? finding.count || 1 : 1;
    const weight = securitySignalWeight(code, count);

    if (weight === null) return;

    score += weight;
    const formatted = formatSecuritySignal(code, count);
    reasons.push(formatted);
    addRisk(groups, securitySignalGroup(code), formatted);
  });

  return { score, reasons, groups };
}

function securitySignalWeight(code, count) {
  if (!code) return null;
  if (code.startsWith("certificate:")) return 55;
  if (isCertificateSignal(code)) return certificateSignalWeight(code);
  if (code.startsWith("client-certificate:") || isClientCertificateSignal(code)) return code.includes("missing") ? 35 : 12;
  if (code.startsWith("cipher:")) return cipherSignalWeight(code.slice("cipher:".length));
  if (isCipherSignal(code)) return cipherSignalWeight(code);
  if (code === "mixed-script") return 45;
  if (code === "mixed-form") return 40;
  if (code === "mixed") return count >= 8 ? 30 : 15;
  if (code === "mixed-favicon") return 8;
  if (code === "http-password" || code === "http-credit-card") return 55;
  if (code === "http-login" || code === "http-dynamic-login") return 45;
  if (code === "http-textarea") return 30;
  if (code === "http") return 35;
  return null;
}

function formatSecuritySignal(code, count) {
  const suffix = count > 1 ? ` (${count})` : "";
  if (code.startsWith("certificate:")) return `Certificate: ${code.slice("certificate:".length)}${suffix}`;
  if (isCertificateSignal(code)) return `Certificate: ${code}${suffix}`;
  if (code.startsWith("client-certificate:")) return `Client Certificate: ${code.slice("client-certificate:".length)}${suffix}`;
  if (code.startsWith("cipher:")) return `Cipher Suite: ${code.slice("cipher:".length)}${suffix}`;
  if (isClientCertificateSignal(code)) return `Client Certificate: ${code}${suffix}`;
  if (isCipherSignal(code)) return `Cipher Suite: ${code}${suffix}`;
  if (code.startsWith("mixed")) return `Mixed Content: ${code}${suffix}`;
  if (code.startsWith("http")) return `HTTP: ${code}${suffix}`;
  return `${code}${suffix}`;
}

function createRiskGroups() {
  return {
    certificate: [],
    clientCertificate: [],
    mixed: [],
    http: [],
    cipher: [],
    proxy: [],
    url: []
  };
}

function addRisk(groups, group, reason) {
  if (!groups[group]) groups[group] = [];
  if (!groups[group].includes(reason)) groups[group].push(reason);
}

function mergeRiskGroups(target, source) {
  Object.entries(source).forEach(([group, reasons]) => {
    reasons.forEach((reason) => addRisk(target, group, reason));
  });
}

function securitySignalGroup(code) {
  if (code.startsWith("certificate:") || isCertificateSignal(code)) return "certificate";
  if (code.startsWith("client-certificate:") || isClientCertificateSignal(code)) return "clientCertificate";
  if (code.startsWith("cipher:") || isCipherSignal(code)) return "cipher";
  if (code.startsWith("mixed")) return "mixed";
  if (code.startsWith("http")) return "http";
  return "url";
}

function isCertificateSignal(code) {
  return [
    "expired",
    "wrong.host",
    "self-signed",
    "untrusted-root",
    "revoked",
    "pinning-test",
    "no-common-name",
    "no-subject",
    "incomplete-chain",
    "sha256",
    "sha384",
    "sha512",
    "1000-sans",
    "10000-sans",
    "ecc256",
    "ecc384",
    "rsa2048",
    "rsa4096",
    "rsa8192",
    "extended-validation"
  ].includes(code);
}

function certificateSignalWeight(code) {
  if ([
    "expired",
    "wrong.host",
    "self-signed",
    "untrusted-root",
    "revoked",
    "pinning-test",
    "no-common-name",
    "no-subject",
    "incomplete-chain"
  ].includes(code)) return 55;
  if (["1000-sans", "10000-sans"].includes(code)) return 20;
  return 0;
}

function isClientCertificateSignal(code) {
  return [
    "client",
    "client-cert-missing",
    "certificate-downloads"
  ].includes(code);
}

function isCipherSignal(code) {
  return [
    "cbc",
    "rc4-md5",
    "rc4",
    "3des",
    "null",
    "mozilla-old",
    "mozilla-intermediate",
    "mozilla-modern"
  ].includes(code);
}

function cipherSignalWeight(code) {
  if (["null", "rc4-md5", "rc4", "3des"].includes(code)) return 55;
  if (["cbc", "mozilla-old"].includes(code)) return 30;
  if (code === "mozilla-intermediate") return 10;
  if (code === "mozilla-modern") return 0;
  return null;
}

function isIpAddress(host) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(":");
}

window.ProxyRisk = {
  analyzePageRisk
};
