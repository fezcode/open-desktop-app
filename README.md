# Open Desktop App

A Firefox WebExtension that offers to open the current website in its desktop
app (Spotify, Steam, Discord, …) through a dynamic-island style prompt that
takes on each app's own colors.

## How it works

On a supported site, a small pill drops in at the top of the page and expands
into an **Open in Spotify** prompt, styled in that app's colors (black and green
for Spotify, navy and sky blue for Steam, blurple for Discord, …).

- **Open:** the island changes to *Opening Spotify…* (spinning ring and
  equalizer bars), sends the app's deep link (`spotify:track:…`,
  `steam://openurl/…`), shows a check mark that draws itself, then collapses
  and disappears.
- **Ignore it:** a thin countdown line runs along the bottom and the island
  closes itself after ~9 s. Hovering pauses the countdown. **×** or `Esc`
  closes it right away.
- Once you've dismissed or used the island, it won't come back for that app
  for the rest of the tab session.

The extension does **not** check whether the app is installed (Firefox has no
API for that). It just tries the deep link. If the app is installed, Firefox
asks once (*"Allow this site to open the spotify link?"*) and then hands over.

Other ways to trigger it:

- **Toolbar popup:** shows the current page's app and deep link, with a
  one-click button.
- **Right-click** a page → *Open Desktop App*, or right-click a link to a
  supported site anywhere on the web → *Open link in desktop app*.
- **Shortcut:** `Alt+Shift+O`.

The popup also has a switch to turn off the automatic island, plus a grid for
muting it per app.

## Supported apps

| App | Sites | Deep link |
| --- | --- | --- |
| Spotify | `open.spotify.com` | `spotify:<type>:<id>` |
| Steam | `store.steampowered.com`, `steamcommunity.com`, `help.steampowered.com` | `steam://openurl/<url>` |
| Discord | `discord.com`, `discord.gg` | `discord://-/channels/…`, `discord://-/invite/…` |
| Slack | `*.slack.com` | `slack://channel?team=…&id=…` |
| Zoom | `*.zoom.us` (meeting links only) | `zoommtg://…/join?confno=…&pwd=…` |
| Microsoft Teams | `teams.microsoft.com`, `teams.live.com` | `msteams:/l/…` |
| Figma | `figma.com` (files only) | `figma://design/…` |
| Notion | `notion.so`, `*.notion.site` | `notion://www.notion.so/…` |
| Telegram | `t.me`, `web.telegram.org` | `tg://resolve?domain=…` |
| WhatsApp | `wa.me`, `web.whatsapp.com` | `whatsapp://send?phone=…` |
| Epic Games | `store.epicgames.com` | `com.epicgames.launcher://store/p/…` |
| Linear | `linear.app` (workspace pages only) | `linear://…` |

To add an app, add an entry to [`apps.js`](apps.js) (hosts, theme, `toApp(url)`),
add its glyph to [`icons.js`](icons.js), and add its hosts to
`content_scripts.matches` in [`manifest.json`](manifest.json).

## Privacy

There is no data collection and no network requests. Content scripts only run
on the supported sites listed above. The only things stored (in
`storage.local`) are your auto-show and per-app mute choices.

## Install (temporary)

**Firefox** (142+)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `manifest.json` in this folder.
3. Temporary add-ons are removed when Firefox restarts; reload it the same way.

## Packaging for release

```powershell
npx web-ext lint
npx web-ext build --overwrite-dest --ignore-files "*.stackdump"
```

Then upload `web-ext-artifacts/open_desktop_app-<version>.zip` to
[addons.mozilla.org](https://addons.mozilla.org/developers/).

## Credits

Brand glyphs come from [Simple Icons](https://simpleicons.org) (CC0). All brand
names and logos are trademarks of their respective owners; this extension isn't
affiliated with any of them.
