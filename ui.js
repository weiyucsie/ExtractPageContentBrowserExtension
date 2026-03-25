const modeSelect = document.getElementById("modeSelect");
const extractBtn = document.getElementById("extractBtn");
const copyBtn = document.getElementById("copyBtn");
const refreshModesBtn = document.getElementById("refreshModesBtn");
const manageModesBtn = document.getElementById("manageModesBtn");
const resultBox = document.getElementById("resultBox");
const statusText = document.getElementById("statusText");
const targetInfo = document.getElementById("targetInfo");

const STORAGE_KEY_V3 = "customModesV3";
const STORAGE_KEY_V2 = "customModesV2";
const LEGACY_STORAGE_KEY = "customModes";
const BUILTIN_MODES = [
  { id: "selection", label: "1. 目前選取文字" },
  { id: "main-text", label: "2. 頁面主要文字內容" },
  { id: "main-html", label: "3. 頁面主要 HTML 結構" }
];

let sourceTabId = null;
let sourceTabUrl = "";
let customModes = [];
let visibleCustomModes = [];

function setStatus(text, isError = false) {
  statusText.textContent = text;
  statusText.style.color = isError ? "#d1242f" : "#57606a";
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getQuerySourceTabId() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("sourceTabId");
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeSingleRule(single) {
  const source = single && typeof single === "object" ? single : {};
  return {
    selector: String(source.selector || "").trim(),
    extract: source.extract === "html" ? "html" : "text",
    outputFormat:
      source.outputFormat === "json" || source.outputFormat === "template"
        ? source.outputFormat
        : "raw",
    removeSelectors: String(
      source.removeSelectors || "script, style, noscript"
    ).trim(),
    template: String(source.template || "")
  };
}

function normalizeListRule(listRule) {
  const source = listRule && typeof listRule === "object" ? listRule : {};
  const normalizedFields = Array.isArray(source.fields)
    ? source.fields
        .map((field) => ({
          key: String((field && field.key) || "").trim(),
          selector: String((field && field.selector) || "").trim()
        }))
        .filter((field) => field.key)
    : [];

  return {
    itemSelector: String(source.itemSelector || "").trim(),
    fields: normalizedFields,
    titleSelector: String(source.titleSelector || "").trim(),
    priceSelector: String(source.priceSelector || "").trim(),
    outputFormat: source.outputFormat === "json" ? "json" : "template",
    itemTemplate: String(source.itemTemplate || "{{title}} - {{price}}"),
    joinWith:
      typeof source.joinWith === "string" && source.joinWith.length > 0
        ? source.joinWith
        : "\n"
  };
}

function normalizeMode(mode) {
  const source = mode && typeof mode === "object" ? mode : {};
  const modeType = source.modeType === "list-fields" ? "list-fields" : "single";
  const urlPatterns = Array.isArray(source.urlPatterns)
    ? source.urlPatterns.map((p) => String(p || "").trim()).filter(Boolean)
    : [];

  return {
    id: String(source.id || createId()),
    name: String(source.name || "").trim(),
    modeType,
    urlPatterns,
    single: normalizeSingleRule(source.single || source),
    list: normalizeListRule(source.list || source)
  };
}

function migrateLegacyMode(oldMode) {
  return normalizeMode({
    id: oldMode.id || createId(),
    name: oldMode.name || "未命名模式",
    modeType: "single",
    urlPatterns: [],
    single: {
      selector: oldMode.selector,
      extract: oldMode.extract,
      outputFormat: oldMode.outputFormat,
      removeSelectors: oldMode.removeSelectors,
      template: oldMode.template
    }
  });
}

async function loadCustomModes() {
  const data = await browser.storage.local.get([
    STORAGE_KEY_V3,
    STORAGE_KEY_V2,
    LEGACY_STORAGE_KEY
  ]);

  if (Array.isArray(data[STORAGE_KEY_V3])) {
    customModes = data[STORAGE_KEY_V3].map(normalizeMode).filter((mode) => mode.name);
    return;
  }

  if (Array.isArray(data[STORAGE_KEY_V2])) {
    customModes = data[STORAGE_KEY_V2].map(normalizeMode).filter((mode) => mode.name);
    await browser.storage.local.set({ [STORAGE_KEY_V3]: customModes });
    return;
  }

  const legacy = Array.isArray(data[LEGACY_STORAGE_KEY]) ? data[LEGACY_STORAGE_KEY] : [];
  customModes = legacy.map(migrateLegacyMode).filter((mode) => mode.name);
  await browser.storage.local.set({ [STORAGE_KEY_V3]: customModes });
}

function parseCustomModeId(value) {
  if (typeof value !== "string" || !value.startsWith("custom:")) {
    return null;
  }
  return value.slice("custom:".length);
}

function createCustomModeValue(id) {
  return `custom:${id}`;
}

function wildcardToRegExp(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function doesPatternMatchUrl(urlString, pattern) {
  if (!pattern) {
    return true;
  }
  if (!urlString) {
    return true;
  }

  const trimmed = pattern.trim();
  if (!trimmed) {
    return true;
  }

  if (trimmed.includes("*")) {
    return wildcardToRegExp(trimmed).test(urlString);
  }

  let parsed = null;
  try {
    parsed = new URL(urlString);
  } catch (error) {
    parsed = null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return urlString.startsWith(trimmed);
  }

  if (parsed) {
    if (parsed.hostname === trimmed || parsed.hostname.endsWith(`.${trimmed}`)) {
      return true;
    }
  }

  return urlString.includes(trimmed);
}

function isModeApplicableToUrl(mode, urlString) {
  if (!Array.isArray(mode.urlPatterns) || mode.urlPatterns.length === 0) {
    return true;
  }
  return mode.urlPatterns.some((pattern) => doesPatternMatchUrl(urlString, pattern));
}

function renderModeOptions(selectedValue = "main-text") {
  modeSelect.innerHTML = "";

  for (const mode of BUILTIN_MODES) {
    const option = document.createElement("option");
    option.value = mode.id;
    option.textContent = mode.label;
    modeSelect.appendChild(option);
  }

  visibleCustomModes = customModes.filter((mode) =>
    isModeApplicableToUrl(mode, sourceTabUrl)
  );

  if (visibleCustomModes.length > 0) {
    const group = document.createElement("optgroup");
    group.label = "自訂模式";
    for (const mode of visibleCustomModes) {
      const option = document.createElement("option");
      option.value = createCustomModeValue(mode.id);
      option.textContent = mode.name;
      group.appendChild(option);
    }
    modeSelect.appendChild(group);
  }

  const allowedValues = new Set([
    ...BUILTIN_MODES.map((mode) => mode.id),
    ...visibleCustomModes.map((mode) => createCustomModeValue(mode.id))
  ]);
  modeSelect.value = allowedValues.has(selectedValue) ? selectedValue : "main-text";
}

function getSelectedModePayload() {
  const customModeId = parseCustomModeId(modeSelect.value);
  if (!customModeId) {
    return modeSelect.value;
  }

  const customMode = visibleCustomModes.find((mode) => mode.id === customModeId);
  if (!customMode) {
    return "main-text";
  }

  return {
    kind: "custom",
    modeType: customMode.modeType,
    single: customMode.single,
    list: customMode.list
  };
}

async function resolveSourceTabContext() {
  const fromQuery = getQuerySourceTabId();
  const message = { type: "getSourceTabId" };
  if (typeof fromQuery === "number") {
    message.preferredTabId = fromQuery;
  }
  const response = await browser.runtime.sendMessage(message);
  return {
    tabId: response && typeof response.sourceTabId === "number" ? response.sourceTabId : null,
    url: response && typeof response.sourceTabUrl === "string" ? response.sourceTabUrl : "",
    title:
      response && typeof response.sourceTabTitle === "string" ? response.sourceTabTitle : ""
  };
}

async function extract() {
  if (typeof sourceTabId !== "number") {
    setStatus("找不到目標分頁，請回到網頁再點一次工具列按鈕。", true);
    return;
  }

  setStatus("擷取中...");
  const response = await browser.runtime.sendMessage({
    type: "extractFromTab",
    tabId: sourceTabId,
    mode: getSelectedModePayload()
  });

  if (!response || response.ok !== true) {
    setStatus((response && response.error) || "擷取失敗。", true);
    return;
  }

  resultBox.value = response.content || "";
  setStatus(`完成：共 ${resultBox.value.length} 個字元。`);
}

async function copyResult() {
  const text = resultBox.value || "";
  if (!text) {
    setStatus("目前沒有內容可複製。", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    resultBox.focus();
    resultBox.select();
    document.execCommand("copy");
  }
  setStatus("已複製到剪貼簿。");
}

async function refreshModes() {
  const prev = modeSelect.value;
  await loadCustomModes();
  renderModeOptions(prev);
  setStatus(`模式已重新載入（顯示 ${visibleCustomModes.length} 個自訂模式）。`);
}

async function init() {
  const context = await resolveSourceTabContext();
  sourceTabId = context.tabId;
  sourceTabUrl = context.url;
  targetInfo.textContent =
    typeof sourceTabId === "number"
      ? `目標分頁 ID：${sourceTabId} ${sourceTabUrl ? `| ${sourceTabUrl}` : ""}`
      : "目標分頁：找不到";

  await loadCustomModes();
  renderModeOptions("main-text");
}

extractBtn.addEventListener("click", () => {
  extract().catch(() => setStatus("擷取失敗。", true));
});

copyBtn.addEventListener("click", () => {
  copyResult().catch(() => setStatus("複製失敗。", true));
});

refreshModesBtn.addEventListener("click", () => {
  refreshModes().catch(() => setStatus("重新載入模式失敗。", true));
});

manageModesBtn.addEventListener("click", () => {
  browser.runtime.openOptionsPage().catch(() => setStatus("無法開啟模式管理頁。", true));
});

init().catch(() => setStatus("初始化失敗。", true));
