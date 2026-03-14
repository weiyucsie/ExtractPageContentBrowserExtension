function getPreferredRoot() {
  return (
    document.querySelector("main") ||
    document.querySelector("article") ||
    document.querySelector('[role="main"]') ||
    document.body
  );
}

function sanitizeHtml(element) {
  const clone = element.cloneNode(true);
  const removableNodes = clone.querySelectorAll("script, style, noscript");
  for (const node of removableNodes) {
    node.remove();
  }
  return clone.outerHTML.trim();
}

function extractSelectedText() {
  const selection = window.getSelection();
  if (!selection) {
    return "";
  }
  return selection.toString().trim();
}

function extractMainText() {
  const root = getPreferredRoot();
  if (!root) {
    return "";
  }
  return (root.innerText || root.textContent || "").trim();
}

function extractMainHtml() {
  const root = getPreferredRoot();
  if (!root) {
    return "";
  }
  return sanitizeHtml(root);
}

browser.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== "extractContent") {
    return undefined;
  }

  const mode = message.mode;
  let content = "";

  if (mode === "selection") {
    content = extractSelectedText();
  } else if (mode === "main-text") {
    content = extractMainText();
  } else if (mode === "main-html") {
    content = extractMainHtml();
  } else {
    return Promise.resolve({
      ok: false,
      error: "不支援的擷取模式。"
    });
  }

  return Promise.resolve({
    ok: true,
    content
  });
});
