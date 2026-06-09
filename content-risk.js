function collectPageSecurityFindings() {
  const findings = new Set();
  const protocol = window.location.protocol;

  if (protocol === "http:") {
    findings.add("http");

    if (document.querySelector("textarea")) {
      findings.add("http-textarea");
    }

    if (document.querySelector('input[type="password"]')) {
      findings.add("http-password");
    }

    if (document.querySelector('input[type="password"], input[name*="login" i], input[name*="user" i], input[name*="email" i]')) {
      findings.add("http-login");
    }

    if (document.querySelector('input[name*="card" i], input[autocomplete="cc-number"], input[inputmode="numeric"][maxlength="16"]')) {
      findings.add("http-credit-card");
    }
  }

  if (protocol === "https:") {
    document.querySelectorAll("form[action]").forEach((form) => {
      try {
        const action = new URL(form.getAttribute("action"), window.location.href);
        if (action.protocol === "http:") findings.add("mixed-form");
      } catch (error) {
        // Ignore malformed form actions.
      }
    });
  }

  return Array.from(findings);
}

function reportPageSecurity() {
  const findings = collectPageSecurityFindings();
  if (!findings.length) return;

  chrome.runtime.sendMessage({
    type: "PAGE_SECURITY_SCAN",
    url: window.location.href,
    findings
  }).catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "SCAN_PAGE_SECURITY") return false;

  sendResponse({
    ok: true,
    url: window.location.href,
    findings: collectPageSecurityFindings()
  });
  return false;
});

reportPageSecurity();
