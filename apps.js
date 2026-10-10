// Registry of supported desktop apps.
//
// Each entry:
//   id        stable key (settings + icon lookup in ODA_ICONS)
//   name      display name
//   hosts     hostnames (exact, or ".suffix" for any subdomain)
//   theme     island palette: bg (surface), bg2 (gradient end), fg (text),
//             accent (button / glow), accentFg (text on accent)
//   toApp(u)  URL -> deep link string, or null when this page has nothing
//             meaningful to open in the desktop app.
//
// Shared by content.js, background.js and popup.js (loaded before them).

(() => {
  const seg = (u) => u.pathname.split("/").filter(Boolean);

  const APPS = [
    {
      id: "spotify",
      name: "Spotify",
      hosts: ["open.spotify.com"],
      theme: { bg: "#000000", bg2: "#121212", fg: "#ffffff", accent: "#1ed760", accentFg: "#000000" },
      toApp(u) {
        const m = u.pathname.match(
          /^\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(track|album|artist|playlist|show|episode|user|audiobook|chapter)\/([A-Za-z0-9]+)/i
        );
        return m ? `spotify:${m[1].toLowerCase()}:${m[2]}` : "spotify:";
      },
    },
    {
      id: "steam",
      name: "Steam",
      hosts: ["store.steampowered.com", "steamcommunity.com", "help.steampowered.com"],
      theme: { bg: "#171a21", bg2: "#1b2838", fg: "#c7d5e0", accent: "#66c0f4", accentFg: "#0e1a26" },
      // The Steam client renders any store/community URL in its own browser.
      toApp: (u) => `steam://openurl/${u.href}`,
    },
    {
      id: "discord",
      name: "Discord",
      hosts: ["discord.com", "ptb.discord.com", "canary.discord.com", "discord.gg"],
      theme: { bg: "#1e1f22", bg2: "#2b2d31", fg: "#f2f3f5", accent: "#5865f2", accentFg: "#ffffff" },
      toApp(u) {
        const p = seg(u);
        if (u.hostname === "discord.gg" && p[0]) return `discord://-/invite/${p[0]}`;
        if (p[0] === "invite" && p[1]) return `discord://-/invite/${p[1]}`;
        if (p[0] === "channels") return `discord://-${u.pathname}`;
        return "discord://";
      },
    },
    {
      id: "slack",
      name: "Slack",
      hosts: [".slack.com"],
      theme: { bg: "#3f0e40", bg2: "#4a154b", fg: "#ffffff", accent: "#ecb22e", accentFg: "#1d1c1d" },
      toApp(u) {
        const p = seg(u);
        if (u.hostname === "app.slack.com" && p[0] === "client" && p[1]) {
          return p[2]
            ? `slack://channel?team=${p[1]}&id=${p[2]}`
            : `slack://open?team=${p[1]}`;
        }
        // Marketing site has nothing to hand over.
        if (u.hostname === "slack.com" || u.hostname === "www.slack.com") return null;
        return "slack://open";
      },
    },
    {
      id: "zoom",
      name: "Zoom",
      hosts: ["zoom.us", ".zoom.us"],
      theme: { bg: "#0b1a3d", bg2: "#0e2a66", fg: "#ffffff", accent: "#0b5cff", accentFg: "#ffffff" },
      toApp(u) {
        const m = u.pathname.match(/^\/(?:j|s|w|wc(?:\/join)?)\/(\d{9,11})/);
        if (!m) return null; // only offer on meeting links
        const q = new URLSearchParams({ action: "join", confno: m[1] });
        const pwd = u.searchParams.get("pwd");
        if (pwd) q.set("pwd", pwd);
        return `zoommtg://${u.hostname}/join?${q}`;
      },
    },
    {
      id: "microsoftteams",
      name: "Microsoft Teams",
      hosts: ["teams.microsoft.com", "teams.live.com", "teams.cloud.microsoft"],
      theme: { bg: "#1f1f3a", bg2: "#2b2b52", fg: "#ffffff", accent: "#7b83eb", accentFg: "#ffffff" },
      toApp(u) {
        // Deep links (/l/meetup-join/…, /l/chat/…) map 1:1 onto msteams:.
        if (u.pathname.startsWith("/l/")) return `msteams:${u.pathname}${u.search}${u.hash}`;
        return "msteams:";
      },
    },
    {
      id: "figma",
      name: "Figma",
      hosts: ["figma.com", "www.figma.com"],
      theme: { bg: "#1e1e1e", bg2: "#2c2c2c", fg: "#ffffff", accent: "#a259ff", accentFg: "#ffffff" },
      toApp(u) {
        if (!/^\/(file|design|board|proto|slides|deck|files)(\/|$)/.test(u.pathname)) return null;
        return `figma:/${u.pathname}${u.search}`;
      },
    },
    {
      id: "notion",
      name: "Notion",
      hosts: ["notion.so", "www.notion.so", ".notion.site"],
      theme: { bg: "#191919", bg2: "#252525", fg: "#ffffff", accent: "#ffffff", accentFg: "#191919" },
      toApp(u) {
        const p = seg(u);
        if (!p.length) return null;
        // notion.site public pages live under the same page IDs on notion.so.
        return `notion://www.notion.so${u.pathname}${u.search}`;
      },
    },
    {
      id: "telegram",
      name: "Telegram",
      hosts: ["t.me", "telegram.me", "web.telegram.org"],
      theme: { bg: "#17212b", bg2: "#1e2c3a", fg: "#ffffff", accent: "#2aabee", accentFg: "#ffffff" },
      toApp(u) {
        if (u.hostname === "web.telegram.org") return "tg://";
        const p = seg(u);
        if (!p.length) return null;
        if (p[0] === "joinchat" && p[1]) return `tg://join?invite=${p[1]}`;
        if (p[0].startsWith("+")) return `tg://join?invite=${p[0].slice(1)}`;
        if (p[0] === "addstickers" && p[1]) return `tg://addstickers?set=${p[1]}`;
        if (p[0] === "s" && p[1]) return `tg://resolve?domain=${p[1]}`;
        const q = new URLSearchParams({ domain: p[0] });
        if (/^\d+$/.test(p[1] ?? "")) q.set("post", p[1]);
        return `tg://resolve?${q}`;
      },
    },
    {
      id: "whatsapp",
      name: "WhatsApp",
      hosts: ["web.whatsapp.com", "wa.me", "api.whatsapp.com"],
      theme: { bg: "#0b141a", bg2: "#111b21", fg: "#e9edef", accent: "#25d366", accentFg: "#0b141a" },
      toApp(u) {
        if (u.hostname === "wa.me") {
          const phone = seg(u)[0];
          if (!phone) return "whatsapp://";
          const q = new URLSearchParams({ phone });
          const text = u.searchParams.get("text");
          if (text) q.set("text", text);
          return `whatsapp://send?${q}`;
        }
        if (u.hostname === "api.whatsapp.com" && u.pathname.startsWith("/send")) {
          return `whatsapp://send${u.search}`;
        }
        return "whatsapp://";
      },
    },
    {
      id: "epicgames",
      name: "Epic Games",
      hosts: ["store.epicgames.com"],
      theme: { bg: "#101014", bg2: "#18181c", fg: "#ffffff", accent: "#26bbff", accentFg: "#101014" },
      toApp(u) {
        const m = u.pathname.match(/^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?p\/([^/?#]+)/);
        return m
          ? `com.epicgames.launcher://store/p/${m[1]}`
          : "com.epicgames.launcher://store";
      },
    },
    {
      id: "linear",
      name: "Linear",
      hosts: ["linear.app"],
      theme: { bg: "#08090a", bg2: "#151619", fg: "#f7f8f8", accent: "#5e6ad2", accentFg: "#ffffff" },
      toApp(u) {
        // Only workspace pages (/<workspace>/issue/…), not the marketing site.
        if (!/^\/[^/]+\/(issue|project|projects|team|view|views|inbox|my-issues|cycle|initiatives|settings)(\/|$)/.test(u.pathname)) {
          return null;
        }
        return `linear:/${u.pathname}${u.search}`;
      },
    },
  ];

  const hostMatches = (host, pattern) =>
    pattern.startsWith(".")
      ? host === pattern.slice(1) || host.endsWith(pattern)
      : host === pattern;

  function findApp(href) {
    let u;
    try {
      u = new URL(href);
    } catch {
      return null;
    }
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.hostname.toLowerCase();
    const app = APPS.find((a) => a.hosts.some((h) => hostMatches(host, h)));
    if (!app) return null;
    let link = null;
    try {
      link = app.toApp(u);
    } catch {
      link = null;
    }
    return link ? { app, link } : null;
  }

  // Match patterns for menus.create (documentUrlPatterns / targetUrlPatterns).
  const matchPatterns = () =>
    APPS.flatMap((a) =>
      a.hosts.map((h) => (h.startsWith(".") ? `*://*${h}/*` : `*://${h}/*`))
    );

  globalThis.ODA = { APPS, findApp, matchPatterns };
})();
