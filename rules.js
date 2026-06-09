function isValidPort(port) {
  const value = Number(port);
  return Number.isInteger(value) && value > 0 && value <= 65535;
}

function splitRules(value) {
  return String(value || "")
    .split(/[\n,;]/)
    .map((item) => normalizeRule(item.trim()))
    .filter(Boolean);
}

function normalizeRule(rule) {
  if (!rule) return "";
  if (rule === "<local>") return rule;

  const wildcardPrefix = rule.startsWith("*.") ? "*." : "";
  const dotPrefix = !wildcardPrefix && rule.startsWith(".") ? "." : "";
  const body = rule.slice(wildcardPrefix.length || dotPrefix.length);

  try {
    const host = new URL(`http://${body.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/:\d+$/, "")}`).hostname;
    return `${wildcardPrefix}${dotPrefix}${host.toLowerCase()}`;
  } catch (error) {
    return rule.toLowerCase();
  }
}

function matchesAnyRule(host, rules) {
  return rules.some((rule) => matchesRule(host, rule));
}

function matchesRule(host, rule) {
  if (rule === "<local>") return !host.includes(".");
  let normalized = rule;
  if (normalized.startsWith("*.")) normalized = normalized.slice(2);
  if (normalized.startsWith(".")) normalized = normalized.slice(1);
  return host === normalized || host.endsWith(`.${normalized}`);
}

function pageUsesProxy(host, profile) {
  if (!profile) return false;

  const bypass = splitRules(profile.bypassList);
  const selected = splitRules(profile.domainList);

  if (matchesAnyRule(host, bypass)) return false;
  if (profile.mode !== "onlySelected") return true;
  return matchesAnyRule(host, selected);
}

window.ProxyRules = {
  isValidPort,
  normalizeRule,
  splitRules,
  matchesAnyRule,
  matchesRule,
  pageUsesProxy
};
