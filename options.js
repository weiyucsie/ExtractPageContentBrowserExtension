const STORAGE_KEY_V3 = "customModesV3";
const STORAGE_KEY_V2 = "customModesV2";
const LEGACY_STORAGE_KEY = "customModes";

const modeList = document.getElementById("modeList");
const newBtn = document.getElementById("newBtn");
const deleteBtn = document.getElementById("deleteBtn");
const saveBtn = document.getElementById("saveBtn");
const statusText = document.getElementById("statusText");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const jsonBox = document.getElementById("jsonBox");

const modeNameInput = document.getElementById("modeName");
const modeTypeSelect = document.getElementById("modeType");
const urlPatternsInput = document.getElementById("urlPatterns");

const singleFields = document.getElementById("singleFields");
const singleSelectorInput = document.getElementById("singleSelector");
const singleExtractTypeSelect = document.getElementById("singleExtractType");
const singleOutputFormatSelect = document.getElementById("singleOutputFormat");
const singleRemoveSelectorsInput = document.getElementById("singleRemoveSelectors");
const singleTemplateInput = document.getElementById("singleTemplate");

const listFields = document.getElementById("listFields");
const listItemSelectorInput = document.getElementById("listItemSelector");
const listFieldsContainer = document.getElementById("listFieldsContainer");
const addListFieldBtn = document.getElementById("addListFieldBtn");
const listOutputFormatSelect = document.getElementById("listOutputFormat");
const listItemTemplateInput = document.getElementById("listItemTemplate");
const listJoinWithInput = document.getElementById("listJoinWith");

let modes = [];
let selectedModeId = null;

function setStatus(text, isError = false) {
  statusText.textContent = text;
  statusText.style.color = isError ? "#d1242f" : "#57606a";
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

function normalizeListFields(fields) {
  const source = Array.isArray(fields) ? fields : [];
  return source
    .map((field) => ({
      key: String((field && field.key) || "").trim(),
      selector: String((field && field.selector) || "").trim()
    }))
    .filter((field) => field.key.length > 0);
}

function normalizeListRule(listRule) {
  const source = listRule && typeof listRule === "object" ? listRule : {};
  const legacyFields = [
    { key: "title", selector: String(source.titleSelector || "").trim() },
    { key: "price", selector: String(source.priceSelector || "").trim() }
  ].filter((field) => field.selector.length > 0);

  return {
    itemSelector: String(source.itemSelector || "").trim(),
    fields:
      normalizeListFields(source.fields).length > 0
        ? normalizeListFields(source.fields)
        : legacyFields,
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

function escapeSpecialChars(text) {
  return String(text).replace(/\n/g, "\\n").replace(/\t/g, "\\t");
}

function unescapeSpecialChars(text) {
  return String(text).replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

function getDefaultListFields() {
  return [
    { key: "title", selector: "" },
    { key: "price", selector: "" }
  ];
}

function createBlankMode(name = "新模式") {
  return normalizeMode({
    id: createId(),
    name,
    modeType: "single",
    urlPatterns: [],
    single: {},
    list: {
      fields: getDefaultListFields()
    }
  });
}

async function saveModes() {
  await browser.storage.local.set({ [STORAGE_KEY_V3]: modes });
}

async function loadModes() {
  const data = await browser.storage.local.get([
    STORAGE_KEY_V3,
    STORAGE_KEY_V2,
    LEGACY_STORAGE_KEY
  ]);

  if (Array.isArray(data[STORAGE_KEY_V3])) {
    modes = data[STORAGE_KEY_V3].map(normalizeMode).filter((mode) => mode.name);
    return;
  }

  if (Array.isArray(data[STORAGE_KEY_V2])) {
    modes = data[STORAGE_KEY_V2].map(normalizeMode).filter((mode) => mode.name);
    await saveModes();
    return;
  }

  const legacy = Array.isArray(data[LEGACY_STORAGE_KEY]) ? data[LEGACY_STORAGE_KEY] : [];
  modes = legacy.map(migrateLegacyMode).filter((mode) => mode.name);
  await saveModes();
}

function renderModeList(preferredId = null) {
  modeList.innerHTML = "";

  for (const mode of modes) {
    const option = document.createElement("option");
    option.value = mode.id;
    option.textContent = mode.name;
    modeList.appendChild(option);
  }

  if (modes.length === 0) {
    selectedModeId = null;
    fillForm(null);
    deleteBtn.disabled = true;
    return;
  }

  const targetId =
    preferredId && modes.some((mode) => mode.id === preferredId)
      ? preferredId
      : modes[0].id;
  modeList.value = targetId;
  selectedModeId = targetId;
  fillForm(modes.find((mode) => mode.id === targetId));
  deleteBtn.disabled = false;
}

function createFieldRow(field = { key: "", selector: "" }) {
  const row = document.createElement("div");
  row.className = "mini-row";

  const keyInput = document.createElement("input");
  keyInput.className = "field-key";
  keyInput.type = "text";
  keyInput.placeholder = "欄位 key";
  keyInput.value = field.key || "";

  const selectorInput = document.createElement("input");
  selectorInput.className = "field-selector";
  selectorInput.type = "text";
  selectorInput.placeholder = "CSS selector";
  selectorInput.value = field.selector || "";

  const deleteFieldBtn = document.createElement("button");
  deleteFieldBtn.type = "button";
  deleteFieldBtn.textContent = "刪除";
  deleteFieldBtn.addEventListener("click", () => {
    row.remove();
  });

  row.appendChild(keyInput);
  row.appendChild(selectorInput);
  row.appendChild(deleteFieldBtn);
  return row;
}

function renderListFieldsEditor(fields) {
  listFieldsContainer.innerHTML = "";
  const safeFields = fields && fields.length > 0 ? fields : getDefaultListFields();
  for (const field of safeFields) {
    listFieldsContainer.appendChild(createFieldRow(field));
  }
}

function collectListFieldsFromEditor() {
  const rows = Array.from(listFieldsContainer.querySelectorAll(".mini-row"));
  return rows
    .map((row) => ({
      key: (row.querySelector(".field-key") || { value: "" }).value.trim(),
      selector: (row.querySelector(".field-selector") || { value: "" }).value.trim()
    }))
    .filter((field) => field.key.length > 0);
}

function fillForm(mode) {
  if (!mode) {
    modeNameInput.value = "";
    modeTypeSelect.value = "single";
    urlPatternsInput.value = "";
    singleSelectorInput.value = "";
    singleExtractTypeSelect.value = "text";
    singleOutputFormatSelect.value = "raw";
    singleRemoveSelectorsInput.value = "script, style, noscript";
    singleTemplateInput.value = "";
    listItemSelectorInput.value = "";
    listOutputFormatSelect.value = "template";
    listItemTemplateInput.value = "{{title}} - {{price}}";
    listJoinWithInput.value = "\\n";
    renderListFieldsEditor(getDefaultListFields());
    updateModeTypeVisibility();
    return;
  }

  modeNameInput.value = mode.name;
  modeTypeSelect.value = mode.modeType;
  urlPatternsInput.value = mode.urlPatterns.join("\n");
  singleSelectorInput.value = mode.single.selector;
  singleExtractTypeSelect.value = mode.single.extract;
  singleOutputFormatSelect.value = mode.single.outputFormat;
  singleRemoveSelectorsInput.value = mode.single.removeSelectors;
  singleTemplateInput.value = mode.single.template;
  listItemSelectorInput.value = mode.list.itemSelector;
  listOutputFormatSelect.value = mode.list.outputFormat;
  listItemTemplateInput.value = mode.list.itemTemplate;
  listJoinWithInput.value = escapeSpecialChars(mode.list.joinWith);
  renderListFieldsEditor(mode.list.fields);
  updateModeTypeVisibility();
}

function updateModeTypeVisibility() {
  const isSingle = modeTypeSelect.value !== "list-fields";
  singleFields.style.display = isSingle ? "flex" : "none";
  listFields.style.display = isSingle ? "none" : "flex";
}

function buildModeFromForm(existingId) {
  const name = modeNameInput.value.trim();
  if (!name) {
    throw new Error("請填寫模式名稱。");
  }

  const modeType = modeTypeSelect.value === "list-fields" ? "list-fields" : "single";
  const urlPatterns = urlPatternsInput.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const mode = normalizeMode({
    id: existingId,
    name,
    modeType,
    urlPatterns,
    single: {
      selector: singleSelectorInput.value,
      extract: singleExtractTypeSelect.value,
      outputFormat: singleOutputFormatSelect.value,
      removeSelectors: singleRemoveSelectorsInput.value,
      template: singleTemplateInput.value
    },
    list: {
      itemSelector: listItemSelectorInput.value,
      fields: collectListFieldsFromEditor(),
      outputFormat: listOutputFormatSelect.value,
      itemTemplate: listItemTemplateInput.value,
      joinWith: unescapeSpecialChars(listJoinWithInput.value)
    }
  });

  if (mode.modeType === "list-fields") {
    if (!mode.list.itemSelector) {
      throw new Error("清單欄位模式需要 item selector。");
    }
    if (mode.list.fields.length === 0) {
      throw new Error("清單欄位模式至少要一個欄位 key。");
    }
  }

  return mode;
}

async function createMode() {
  const mode = createBlankMode(`新模式 ${modes.length + 1}`);
  modes.push(mode);
  await saveModes();
  renderModeList(mode.id);
  setStatus("已新增模式。");
}

async function deleteMode() {
  if (!selectedModeId) {
    setStatus("請先選擇要刪除的模式。", true);
    return;
  }

  const deletingMode = modes.find((mode) => mode.id === selectedModeId);
  modes = modes.filter((mode) => mode.id !== selectedModeId);
  await saveModes();
  renderModeList();
  setStatus(`已刪除模式：${deletingMode ? deletingMode.name : selectedModeId}`);
}

async function saveCurrentMode() {
  if (!selectedModeId) {
    setStatus("請先選擇模式。", true);
    return;
  }

  const updated = buildModeFromForm(selectedModeId);
  const index = modes.findIndex((mode) => mode.id === selectedModeId);
  if (index < 0) {
    throw new Error("找不到要儲存的模式。");
  }

  modes[index] = updated;
  await saveModes();
  renderModeList(selectedModeId);
  setStatus(`已儲存：${updated.name}`);
}

function getExportPayload() {
  return {
    version: 3,
    modes
  };
}

async function exportModes() {
  const payload = JSON.stringify(getExportPayload(), null, 2);
  jsonBox.value = payload;

  try {
    await navigator.clipboard.writeText(payload);
    setStatus("已匯出 JSON（並複製到剪貼簿）。");
  } catch (error) {
    setStatus("已匯出 JSON 到文字框。");
  }
}

async function importModes() {
  const raw = jsonBox.value.trim();
  if (!raw) {
    throw new Error("請先貼上要匯入的 JSON。");
  }

  const parsed = JSON.parse(raw);
  const incoming = Array.isArray(parsed) ? parsed : parsed.modes;
  if (!Array.isArray(incoming)) {
    throw new Error("JSON 格式錯誤：需要陣列或 { modes: [...] }。");
  }

  const normalized = incoming.map(normalizeMode).filter((mode) => mode.name);
  modes = normalized;
  await saveModes();
  renderModeList();
  setStatus(`匯入完成，共 ${modes.length} 個模式。`);
}

async function init() {
  await loadModes();
  if (modes.length === 0) {
    modes = [createBlankMode()];
    await saveModes();
  }
  renderModeList();
  updateModeTypeVisibility();
}

modeList.addEventListener("change", () => {
  selectedModeId = modeList.value || null;
  fillForm(modes.find((mode) => mode.id === selectedModeId) || null);
});

modeTypeSelect.addEventListener("change", updateModeTypeVisibility);

addListFieldBtn.addEventListener("click", () => {
  listFieldsContainer.appendChild(createFieldRow({ key: "", selector: "" }));
});

newBtn.addEventListener("click", () => {
  createMode().catch(() => setStatus("新增模式失敗。", true));
});

deleteBtn.addEventListener("click", () => {
  deleteMode().catch(() => setStatus("刪除模式失敗。", true));
});

saveBtn.addEventListener("click", () => {
  saveCurrentMode().catch((error) => {
    const message = error && error.message ? error.message : "儲存失敗。";
    setStatus(message, true);
  });
});

exportBtn.addEventListener("click", () => {
  exportModes().catch(() => setStatus("匯出失敗。", true));
});

importBtn.addEventListener("click", () => {
  importModes().catch((error) => {
    const message = error && error.message ? error.message : "匯入失敗。";
    setStatus(message, true);
  });
});

init().catch(() => setStatus("初始化失敗。", true));
