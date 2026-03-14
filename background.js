let lastClickedTabId = null;
let lastClickedWindowId = null;

browser.browserAction.onClicked.addListener(async (tab) => {
  if (!tab || typeof tab.id !== "number") {
    return;
  }

  lastClickedTabId = tab.id;
  lastClickedWindowId = typeof tab.windowId === "number" ? tab.windowId : null;

  try {
    await browser.sidebarAction.open();
  } catch (error) {
    const url = browser.runtime.getURL(`ui.html?sourceTabId=${tab.id}`);
    await browser.tabs.create({ url });
  }
});

async function getSourceTabId() {
  if (typeof lastClickedTabId === "number") {
    return lastClickedTabId;
  }

  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true
  });
  return activeTab && typeof activeTab.id === "number" ? activeTab.id : null;
}

browser.runtime.onMessage.addListener(async (message) => {
  if (!message || typeof message !== "object") {
    return null;
  }

  if (message.type === "getSourceTabId") {
    const sourceTabId = await getSourceTabId();
    return {
      sourceTabId,
      windowId: lastClickedWindowId
    };
  }

  if (message.type === "extractFromTab") {
    const tabId =
      typeof message.tabId === "number" ? message.tabId : await getSourceTabId();
    if (typeof tabId !== "number") {
      return {
        ok: false,
        error: "找不到可擷取的分頁。"
      };
    }

    try {
      const response = await browser.tabs.sendMessage(tabId, {
        type: "extractContent",
        mode: message.mode
      });

      if (!response || response.ok !== true) {
        return {
          ok: false,
          error: (response && response.error) || "content script 沒有回傳資料。"
        };
      }

      return response;
    } catch (error) {
      return {
        ok: false,
        error:
          "無法從該分頁擷取，可能是 Firefox 限制頁面（about:、addons、AMO）或頁面尚未注入 content script。"
      };
    }
  }

  return null;
});
