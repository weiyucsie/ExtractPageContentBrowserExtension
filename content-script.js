function getPreferredRoot() {
  return (
    document.querySelector("main") ||
    document.querySelector("article") ||
    document.querySelector('[role="main"]') ||
    document.body
  );
}

function sanitizeHtml(element, removeSelectors = "script, style, noscript") {
  const clone = element.cloneNode(true);
  let removableNodes = [];
  try {
    removableNodes = clone.querySelectorAll(removeSelectors);
  } catch (error) {
    removableNodes = clone.querySelectorAll("script, style, noscript");
  }
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

function resolveRootBySelector(selector) {
  if (typeof selector === "string" && selector.trim()) {
    try {
      const found = document.querySelector(selector.trim());
      if (found) {
        return found;
      }
    } catch (error) {
      return getPreferredRoot();
    }
  }
  return getPreferredRoot();
}

function extractCustomMode(modeConfig) {
  const root = resolveRootBySelector(modeConfig.selector);
  if (!root) {
    return "";
  }

  const extractType = modeConfig.extract === "html" ? "html" : "text";
  const baseContent =
    extractType === "html"
      ? sanitizeHtml(root, modeConfig.removeSelectors || "script, style, noscript")
      : (root.innerText || root.textContent || "").trim();

  const outputFormat = modeConfig.outputFormat || "raw";
  if (outputFormat === "json") {
    return JSON.stringify({ content: baseContent }, null, 2);
  }

  if (outputFormat === "template") {
    const template =
      typeof modeConfig.template === "string" && modeConfig.template.length > 0
        ? modeConfig.template
        : "{{content}}";
    return template.split("{{content}}").join(baseContent);
  }

  return baseContent;
}

function safeQueryAll(selector, root = document) {
  if (!selector || !String(selector).trim()) {
    return [];
  }
  try {
    return Array.from(root.querySelectorAll(String(selector).trim()));
  } catch (error) {
    return [];
  }
}

function getNodeText(node) {
  if (!node) {
    return "";
  }
  return (node.innerText || node.textContent || "").trim();
}

function safeQuery(selector, root = document) {
  if (!selector || !String(selector).trim()) {
    return null;
  }
  try {
    return root.querySelector(String(selector).trim());
  } catch (error) {
    return null;
  }
}

function applyTemplate(template, values) {
  const rawTemplate =
    typeof template === "string" && template.length > 0 ? template : "{{content}}";
  return rawTemplate.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : "";
  });
}

function extractListFieldsMode(modeConfig) {
  const itemSelector = modeConfig.itemSelector || "";
  const items = safeQueryAll(itemSelector);
  if (items.length === 0) {
    return "";
  }

  const configuredFields = Array.isArray(modeConfig.fields)
    ? modeConfig.fields
        .map((field) => ({
          key: String((field && field.key) || "").trim(),
          selector: String((field && field.selector) || "").trim()
        }))
        .filter((field) => field.key.length > 0)
    : [];

  const fallbackFields =
    configuredFields.length > 0
      ? configuredFields
      : [
          { key: "title", selector: String(modeConfig.titleSelector || "").trim() },
          { key: "price", selector: String(modeConfig.priceSelector || "").trim() }
        ];

  const rows = items.map((item) => {
    const row = {};
    for (const field of fallbackFields) {
      const node = safeQuery(field.selector, item);
      row[field.key] = node ? getNodeText(node) : getNodeText(item);
    }
    return row;
  });

  if (modeConfig.outputFormat === "json") {
    return JSON.stringify(rows, null, 2);
  }

  const itemTemplate =
    modeConfig.itemTemplate ||
    fallbackFields.map((field) => `{{${field.key}}}`).join(" - ");
  const joinWith =
    typeof modeConfig.joinWith === "string" && modeConfig.joinWith.length > 0
      ? modeConfig.joinWith
      : "\n";

  return rows.map((row) => applyTemplate(itemTemplate, row)).join(joinWith);
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
  } else if (mode && typeof mode === "object" && mode.kind === "custom") {
    if (mode.modeType === "list-fields") {
      content = extractListFieldsMode(mode.list || {});
    } else {
      content = extractCustomMode(mode.single || {});
    }
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
