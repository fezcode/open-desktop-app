// Dynamic-island prompt that hands the current page off to its desktop app.
//
// Runs on supported sites (see apps.js). It does not try to detect whether
// the app is installed: it offers, tries to open the deep link, then gets
// out of the way. The UI lives in a closed shadow root so page CSS can't
// leak in and ours can't leak out.

(() => {
  if (globalThis.__odaIsland) return;
  globalThis.__odaIsland = true;

  const api = globalThis.browser ?? globalThis.chrome;
  const { findApp } = globalThis.ODA;
  const ICONS = globalThis.ODA_ICONS;

  const SESSION_KEY = "oda:dismissed";
  const OFFER_MS = 9000; // auto-dismiss if ignored (paused while hovered)

  let settings = { autoShow: true, disabled: [] };
  let current = null; // { app, link }
  let lastHref = location.href;
  let ui = null;
  let busy = false;
  const timers = new Set();

  // ---- helpers --------------------------------------------------------

  const wait = (ms) =>
    new Promise((r) => {
      const t = setTimeout(() => {
        timers.delete(t);
        r();
      }, ms);
      timers.add(t);
    });

  const clearTimers = () => {
    timers.forEach(clearTimeout);
    timers.clear();
  };

  const dismissed = () => {
    try {
      return new Set(JSON.parse(sessionStorage.getItem(SESSION_KEY) || "[]"));
    } catch {
      return new Set();
    }
  };

  const markDismissed = (id) => {
    try {
      const s = dismissed();
      s.add(id);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify([...s]));
    } catch {
      /* storage blocked: fine, we just may re-offer on reload */
    }
  };

  const shouldAutoShow = (m) =>
    m &&
    settings.autoShow &&
    !settings.disabled.includes(m.app.id) &&
    !dismissed().has(m.app.id);

  // Navigates to the custom scheme. If the OS has a handler, Firefox hands it
  // over (after its one-time "Allow this site to open…" prompt) and the page
  // stays put.
  function openLink(link) {
    try {
      window.location.assign(link);
    } catch {
      const a = document.createElement("a");
      a.href = link;
      a.style.display = "none";
      (document.body || document.documentElement).appendChild(a);
      a.click();
      a.remove();
    }
  }

  // ---- DOM --------------------------------------------------------------

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }

    .wrap {
      position: fixed; top: 12px; left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      pointer-events: none;
      font: 500 14px/1.2 system-ui, -apple-system, "Segoe UI Variable Text", "Segoe UI", Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    .island {
      --spring: cubic-bezier(.34, 1.42, .64, 1);
      --smooth: cubic-bezier(.32, .72, 0, 1);
      position: relative;
      pointer-events: auto;
      width: 44px; height: 44px;
      max-width: calc(100vw - 24px);
      border-radius: 999px;
      overflow: hidden;
      color: var(--fg);
      background:
        radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 55%),
        linear-gradient(135deg, var(--bg), var(--bg2));
      box-shadow:
        0 12px 32px -8px rgba(0, 0, 0, .55),
        0 2px 6px rgba(0, 0, 0, .3),
        inset 0 0 0 1px rgba(255, 255, 255, .07),
        0 0 0 0 transparent;
      opacity: 0;
      transform: translateY(-72px) scale(.5);
      transition:
        width .62s var(--spring),
        height .62s var(--spring),
        transform .62s var(--spring),
        opacity .28s ease,
        box-shadow .5s ease;
    }
    .island.in { opacity: 1; transform: none; }
    .island.out {
      opacity: 0;
      transform: translateY(-64px) scale(.55);
      transition: transform .45s var(--smooth), opacity .3s ease .05s, width .4s var(--smooth), height .4s var(--smooth);
    }

    .island[data-state="peek"]      { width: 44px;  height: 44px; }
    .island[data-state="offer"]     { width: 392px; height: 64px; }
    .island[data-state="launching"] { width: 300px; height: 58px; animation: glow 1.4s ease-in-out infinite; }
    .island[data-state="done"]      { width: 248px; height: 50px; }

    @keyframes glow {
      0%, 100% {
        box-shadow: 0 12px 32px -8px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,255,255,.07),
                    0 0 0 0 color-mix(in srgb, var(--accent) 0%, transparent);
      }
      50% {
        box-shadow: 0 12px 32px -8px rgba(0,0,0,.55), inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent),
                    0 0 34px 2px color-mix(in srgb, var(--accent) 45%, transparent);
      }
    }

    /* Sheen that sweeps once when the island opens up. */
    .island::after {
      content: ""; position: absolute; inset: 0; pointer-events: none;
      background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.14) 50%, transparent 65%);
      transform: translateX(-120%);
    }
    .island[data-state="offer"]::after { animation: sheen 1.1s var(--smooth) .35s 1 both; }
    @keyframes sheen { to { transform: translateX(120%); } }

    /* Each state is a stacked view; they cross-fade with a slight blur. */
    .view {
      position: absolute; inset: 0;
      display: flex; align-items: center; gap: 12px;
      padding: 0 12px 0 14px;
      white-space: nowrap;
      opacity: 0; filter: blur(8px); transform: scale(.94);
      pointer-events: none;
      transition: opacity .2s ease, filter .3s ease, transform .45s var(--spring);
    }
    .island[data-state="peek"]      .v-peek,
    .island[data-state="offer"]     .v-offer,
    .island[data-state="launching"] .v-launching,
    .island[data-state="done"]      .v-done {
      opacity: 1; filter: none; transform: none; pointer-events: auto;
      transition-delay: .14s;
    }
    .v-peek { justify-content: center; padding: 0; }

    .logo { width: 24px; height: 24px; flex: none; fill: var(--accent);
            filter: drop-shadow(0 0 8px color-mix(in srgb, var(--accent) 55%, transparent)); }
    .v-offer .logo { width: 32px; height: 32px; }
    .v-peek .logo { animation: breathe 1.6s ease-in-out infinite; }
    @keyframes breathe { 50% { transform: scale(1.12); } }

    .text { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
    .title { font-weight: 650; font-size: 14px; letter-spacing: -.01em; overflow: hidden; text-overflow: ellipsis; }
    .sub { font-size: 12px; font-weight: 450; opacity: .62; overflow: hidden; text-overflow: ellipsis; }

    button {
      all: unset; cursor: pointer; flex: none;
      display: inline-flex; align-items: center; justify-content: center;
      transition: transform .25s var(--spring), background-color .2s ease, filter .2s ease;
    }
    button:active { transform: scale(.92); }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

    .open {
      position: relative; overflow: hidden;
      height: 36px; padding: 0 18px; border-radius: 999px;
      font-weight: 700; font-size: 13px; letter-spacing: .01em;
      background: var(--accent); color: var(--accent-fg);
      box-shadow: 0 6px 18px -6px color-mix(in srgb, var(--accent) 80%, transparent);
    }
    .open:hover { filter: brightness(1.1); transform: scale(1.04); }
    .open svg { width: 14px; height: 14px; margin-left: 6px; stroke: currentColor; fill: none; stroke-width: 2.4;
                stroke-linecap: round; stroke-linejoin: round; transition: transform .3s var(--spring); }
    .open:hover svg { transform: translate(2px, -2px); }

    .close {
      width: 30px; height: 30px; border-radius: 50%;
      background: rgba(255, 255, 255, .08); color: var(--fg);
    }
    .close:hover { background: rgba(255, 255, 255, .16); }
    .close svg { width: 12px; height: 12px; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; fill: none; }

    /* Launching: logo inside a spinning accent ring + equalizer bars. */
    .ring {
      position: relative; width: 38px; height: 38px; flex: none;
      display: grid; place-items: center; border-radius: 50%;
    }
    .ring::before {
      content: ""; position: absolute; inset: 0; border-radius: 50%;
      background: conic-gradient(from 0deg, transparent 0 55%, var(--accent));
      -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px));
              mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px));
      animation: spin .9s linear infinite;
    }
    .ring .logo { width: 20px; height: 20px; }
    @keyframes spin { to { transform: rotate(1turn); } }

    .eq { display: flex; align-items: flex-end; gap: 3px; height: 18px; margin-right: 6px; }
    .eq i { width: 3px; height: 100%; border-radius: 2px; background: var(--accent);
            transform-origin: bottom; animation: eq 0.9s ease-in-out infinite; }
    .eq i:nth-child(2) { animation-delay: -.6s; }
    .eq i:nth-child(3) { animation-delay: -.3s; }
    .eq i:nth-child(4) { animation-delay: -.75s; }
    @keyframes eq { 0%, 100% { transform: scaleY(.25); } 50% { transform: scaleY(1); } }

    /* Done: self-drawing check. */
    .v-done { justify-content: center; gap: 10px; padding: 0 18px; }
    .check { width: 26px; height: 26px; flex: none; fill: none; stroke: var(--accent);
             stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
    .check circle { stroke-dasharray: 64; stroke-dashoffset: 64; opacity: .45; }
    .check path { stroke-dasharray: 16; stroke-dashoffset: 16; stroke-width: 2.6; }
    .island[data-state="done"] .check circle { animation: draw .5s var(--smooth) .15s forwards; }
    .island[data-state="done"] .check path { animation: draw .35s var(--smooth) .45s forwards; }
    @keyframes draw { to { stroke-dashoffset: 0; } }

    /* Countdown hairline for the auto-dismiss; hovering pauses it. */
    .timer {
      position: absolute; left: 22px; right: 22px; bottom: 0; height: 2px; border-radius: 2px;
      background: var(--accent); opacity: 0; transform-origin: left; transform: scaleX(0);
    }
    .island[data-state="offer"] .timer {
      opacity: .55; animation: countdown var(--offer-ms) linear .6s forwards;
    }
    .island[data-state="offer"]:hover .timer,
    .island[data-state="offer"]:focus-within .timer { animation-play-state: paused; }
    @keyframes countdown { from { transform: scaleX(1); } to { transform: scaleX(0); } }

    @media (prefers-reduced-motion: reduce) {
      .island, .view, button { transition-duration: .01ms !important; }
      .island::after, .v-peek .logo, .ring::before, .eq i { animation: none !important; }
      .island[data-state="launching"] { animation: none; }
    }
  `;

  function build() {
    const host = document.createElement("open-desktop-app-island");
    const shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = CSS;
    shadow.appendChild(style);

    // Static markup only: dynamic bits (text, paths, colours) are set via DOM
    // APIs in theme(), never interpolated into HTML.
    const tpl = document.createElement("template");
    tpl.innerHTML = `
    <div class="wrap">
      <div class="island" data-state="peek" role="status" aria-live="polite">
        <div class="view v-peek"><svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><path/></svg></div>
        <div class="view v-offer">
          <svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><path/></svg>
          <div class="text">
            <div class="title t-offer"></div>
            <div class="sub">Continue in the desktop app</div>
          </div>
          <button class="open" type="button">Open<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg></button>
          <button class="close" type="button" aria-label="Dismiss"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        </div>
        <div class="view v-launching">
          <div class="ring"><svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><path/></svg></div>
          <div class="text">
            <div class="title t-launch"></div>
            <div class="sub">Handing off to the desktop app</div>
          </div>
          <div class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        </div>
        <div class="view v-done">
          <svg class="check" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>
          <div class="title t-done"></div>
        </div>
        <div class="timer"></div>
      </div>
    </div>
  `;
    shadow.appendChild(tpl.content.cloneNode(true));

    const island = shadow.querySelector(".island");
    const $ = (s) => shadow.querySelector(s);

    $(".open").addEventListener("click", () => current && launch(current));
    $(".close").addEventListener("click", () => dismiss(true));
    island.addEventListener("keydown", (e) => {
      if (e.key === "Escape") dismiss(true);
    });
    $(".timer").addEventListener("animationend", () => {
      if (island.dataset.state === "offer") dismiss(true);
    });

    document.documentElement.appendChild(host);
    return { host, shadow, island, $ };
  }

  function theme(m) {
    const { app } = m;
    const t = app.theme;
    const s = ui.island.style;
    s.setProperty("--bg", t.bg);
    s.setProperty("--bg2", t.bg2);
    s.setProperty("--fg", t.fg);
    s.setProperty("--accent", t.accent);
    s.setProperty("--accent-fg", t.accentFg);
    s.setProperty("--offer-ms", `${OFFER_MS}ms`);

    const d = ICONS[app.id] ?? "";
    ui.shadow.querySelectorAll(".logo path").forEach((p) => p.setAttribute("d", d));
    ui.$(".t-offer").textContent = `Open in ${app.name}`;
    ui.$(".t-launch").textContent = `Opening ${app.name}…`;
    ui.$(".t-done").textContent = `Sent to ${app.name}`;
    ui.$(".open").setAttribute("aria-label", `Open in ${app.name}`);
  }

  const setState = (s) => {
    if (ui) ui.island.dataset.state = s;
  };

  // Mount (or re-theme) the island as a dot dropping in from the top edge.
  async function mount(m) {
    clearTimers();
    current = m;
    if (!ui) ui = build();
    ui.island.classList.remove("out");
    theme(m);
    if (!ui.island.classList.contains("in")) {
      setState("peek");
      void ui.island.offsetWidth; // commit the hidden pose before animating
      ui.island.classList.add("in");
      await wait(420);
    }
  }

  async function offer(m) {
    if (busy) return;
    await mount(m);
    setState("offer");
  }

  async function launch(m) {
    if (busy) return;
    busy = true;
    try {
      await mount(m);
      setState("launching");
      markDismissed(m.app.id);

      // Let the morph start, then fire the deep link. Finish early if the
      // window loses focus (the app or Firefox's prompt took over).
      await wait(260);
      let blurred = false;
      const onBlur = () => (blurred = true);
      window.addEventListener("blur", onBlur, { once: true });
      openLink(m.link);
      for (let t = 0; t < 1600 && !blurred; t += 100) await wait(100);
      window.removeEventListener("blur", onBlur);

      setState("done");
      await wait(1500);
      await hide();
    } finally {
      busy = false;
    }
  }

  async function dismiss(byUser) {
    if (busy || !ui) return;
    if (byUser && current) markDismissed(current.app.id);
    await hide();
  }

  async function hide() {
    if (!ui) return;
    clearTimers();
    setState("peek");
    await wait(320);
    ui.island.classList.remove("in");
    ui.island.classList.add("out");
    await wait(480);
    ui.host.remove();
    ui = null;
  }

  // ---- wiring -------------------------------------------------------------

  api.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "oda:ping") return Promise.resolve({ ok: true });
    if (msg?.type === "oda:launch") {
      const m = findApp(msg.href || location.href);
      if (!m) return Promise.resolve({ ok: false, reason: "unsupported" });
      launch(m);
      return Promise.resolve({ ok: true, app: m.app.id });
    }
    return undefined;
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.autoShow) settings.autoShow = changes.autoShow.newValue ?? true;
    if (changes.disabled) settings.disabled = changes.disabled.newValue ?? [];
  });

  // Single-page apps (Spotify, Discord, Slack…) change URLs without reloads.
  setInterval(() => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    const m = findApp(lastHref);
    if (ui && ui.island.dataset.state === "offer") {
      if (m && m.app.id === current?.app.id) current = m;
      else if (!m) dismiss(false);
    } else if (!ui && shouldAutoShow(m)) {
      offer(m);
    }
  }, 800);

  api.storage.local
    .get({ autoShow: true, disabled: [] })
    .then((s) => {
      settings = s;
      const m = findApp(location.href);
      if (shouldAutoShow(m)) setTimeout(() => offer(m), 700);
    })
    .catch(() => {});
})();
