// Context menu + keyboard shortcut entry points.
//
// Both hand the work to the island in the target tab. If the tab isn't a
// supported site (e.g. right-clicking a Spotify link on Reddit) the content
// script isn't there yet, so it is injected on demand. The menu click /
// shortcut grants activeTab for exactly that.

const api = globalThis.browser ?? globalThis.chrome;
const { findApp, matchPatterns } = globalThis.ODA;

const MENU_PAGE = "oda-page";
const MENU_LINK = "oda-link";

async function createMenus() {
  await api.contextMenus.removeAll();
  const patterns = matchPatterns();
  api.contextMenus.create({
    id: MENU_PAGE,
    title: "Open Desktop App",
    contexts: ["page", "selection", "image", "video", "audio"],
    documentUrlPatterns: patterns,
  });
  api.contextMenus.create({
    id: MENU_LINK,
    title: "Open link in desktop app",
    contexts: ["link"],
    targetUrlPatterns: patterns,
  });
}

async function launchInTab(tabId, href) {
  if (!tabId || !findApp(href)) return { ok: false, reason: "unsupported" };
  const msg = { type: "oda:launch", href };
  try {
    return await api.tabs.sendMessage(tabId, msg, { frameId: 0 });
  } catch {
    await api.scripting.executeScript({
      target: { tabId },
      files: ["icons.js", "apps.js", "content.js"],
    });
    return api.tabs.sendMessage(tabId, msg, { frameId: 0 });
  }
}

api.runtime.onInstalled.addListener(async ({ reason }) => {
  await createMenus();
  const origins = api.runtime.getManifest().host_permissions ?? [];
  if (reason === "install" && !(await api.permissions.contains({ origins }))) {
    api.tabs.create({ url: api.runtime.getURL("popup/popup.html?welcome=1") });
  }
});
api.runtime.onStartup.addListener(createMenus);

// Access just granted: bring the island to tabs that are already open.
api.permissions.onAdded.addListener(async ({ origins = [] }) => {
  if (!origins.length) return;
  const tabs = await api.tabs.query({ url: origins }).catch(() => []);
  for (const tab of tabs) {
    api.scripting
      .executeScript({ target: { tabId: tab.id }, files: ["icons.js", "apps.js", "content.js"] })
      .catch(() => {});
  }
});

api.contextMenus.onClicked.addListener((info, tab) => {
  const href = info.menuItemId === MENU_LINK ? info.linkUrl : info.pageUrl ?? tab?.url;
  launchInTab(tab?.id, href).catch((e) => console.warn("[open-desktop-app]", e));
});

api.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "open-desktop-app") return;
  tab ??= (await api.tabs.query({ active: true, currentWindow: true }))[0];
  launchInTab(tab?.id, tab?.url).catch((e) => console.warn("[open-desktop-app]", e));
});

// From the toolbar popup.
api.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "oda:launchTab") return launchInTab(msg.tabId, msg.href);
  return undefined;
});
