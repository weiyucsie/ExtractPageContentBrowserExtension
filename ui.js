const modeSelect = document.getElementById("modeSelect");
const extractBtn = document.getElementById("extractBtn");
const copyBtn = document.getElementById("copyBtn");
const resultBox = document.getElementById("resultBox");
const statusText = document.getElementById("statusText");
const targetInfo = document.getElementById("targetInfo");

let sourceTabId = null;

function setStatus(text, isError = false) {
  statusText.textContent = text;
  statusText.style.color = isError ? "#d1242f" : "#57606a";
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

async function resolveSourceTabId() {
  const fromQuery = getQuerySourceTabId();
  if (typeof fromQuery === "number") {
    return fromQuery;
  }

  const response = await browser.runtime.sendMessage({
    type: "getSourceTabId"
  });
  return response && typeof response.sourceTabId === "number"
    ? response.sourceTabId
    : null;
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
    mode: modeSelect.value
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

async function init() {
  try {
    sourceTabId = await resolveSourceTabId();
    targetInfo.textContent =
      typeof sourceTabId === "number"
        ? `目標分頁 ID：${sourceTabId}`
        : "目標分頁：找不到";
  } catch (error) {
    setStatus("初始化失敗。", true);
  }
}

extractBtn.addEventListener("click", () => {
  extract().catch(() => setStatus("擷取失敗。", true));
});

copyBtn.addEventListener("click", () => {
  copyResult().catch(() => setStatus("複製失敗。", true));
});

init().catch(() => setStatus("初始化失敗。", true));
