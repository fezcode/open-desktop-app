const api = globalThis.browser ?? globalThis.chrome;
const { APPS, findApp } = globalThis.ODA;
const ICONS = globalThis.ODA_ICONS;

const $ = (id) => document.getElementById(id);
const SVG_NS = "http://www.w3.org/2000/svg";

function logo(id, color) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICONS[id] ?? "");
  path.setAttribute("fill", color);
  svg.appendChild(path);
  return svg;
}

async function renderCurrent() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  const m = tab?.url ? findApp(tab.url) : null;
  const card = $("current");

  if (!m) {
    $("current-name").textContent = "No desktop app for this page";
    $("current-link").textContent = "Visit a supported site, or right-click a link to one.";
    return;
  }

  const t = m.app.theme;
  card.classList.remove("neutral");
  card.style.setProperty("--c-bg", t.bg);
  card.style.setProperty("--c-bg2", t.bg2);
  card.style.setProperty("--c-fg", t.fg);
  card.style.setProperty("--c-accent", t.accent);
  card.style.setProperty("--c-accent-fg", t.accentFg);
  $("current-logo").setAttribute("d", ICONS[m.app.id] ?? "");
  $("current-name").textContent = m.app.name;
  $("current-link").textContent = m.link;
  $("current-link").title = m.link;

  const btn = $("open");
  btn.hidden = false;
  btn.textContent = `Open in ${m.app.name}`;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      await api.runtime.sendMessage({ type: "oda:launchTab", tabId: tab.id, href: tab.url });
      window.close(); // let the island take over in the page
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "Couldn't reach this page";
      console.warn("[open-desktop-app]", e);
    }
  });
}

async function renderSettings() {
  let { autoShow, disabled } = await api.storage.local.get({ autoShow: true, disabled: [] });

  const auto = $("autoShow");
  auto.checked = autoShow;
  auto.addEventListener("change", () => api.storage.local.set({ autoShow: auto.checked }));

  const list = $("apps");
  for (const app of APPS) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.title = app.name;
    b.setAttribute("aria-pressed", String(!disabled.includes(app.id)));
    b.style.setProperty("--accent", app.theme.accent);
    // Notion's accent is white; keep every glyph readable on the dark grid.
    b.appendChild(logo(app.id, app.theme.accent));
    const label = document.createElement("span");
    label.textContent = app.name.replace("Microsoft ", "");
    b.appendChild(label);
    b.addEventListener("click", async () => {
      const on = b.getAttribute("aria-pressed") === "true";
      disabled = on ? [...disabled, app.id] : disabled.filter((x) => x !== app.id);
      b.setAttribute("aria-pressed", String(!on));
      await api.storage.local.set({ disabled });
    });
    li.appendChild(b);
    list.appendChild(li);
  }
}

// MV3 host permissions are user-revocable in Firefox and may start out off.
// Without them the content script never runs, so the island can't appear.
async function renderGrant() {
  const origins = api.runtime.getManifest().host_permissions ?? [];
  const banner = $("grant");
  if (await api.permissions.contains({ origins })) return;
  banner.hidden = false;
  $("grantBtn").addEventListener("click", async () => {
    // Must be the first await so it runs inside the click's user gesture.
    const ok = await api.permissions.request({ origins });
    if (ok) banner.hidden = true; // background injects into open tabs
  });
}

if (new URLSearchParams(location.search).has("welcome")) document.body.classList.add("page");

renderGrant().catch((e) => console.warn("[open-desktop-app]", e));
renderCurrent().catch((e) => console.warn("[open-desktop-app]", e));
renderSettings().catch((e) => console.warn("[open-desktop-app]", e));
