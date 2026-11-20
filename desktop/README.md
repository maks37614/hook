# h00k Desktop — програма для Windows

This is a separate Electron application for the existing https://h00k.top website.
It does not execute exchange scanners on the user's computer or change VPS deployment.

## Current capabilities

- User-selectable MetaScalp, Tiger.Trade, and Vataga, each with an independent persisted profile.
- Several terminals can be enabled at once.
- Full h00k website, selected h00k page panels, or independent floating windows.
- Attach left, right, top, or bottom **outside** the selected terminal's top-level window.
- Gapless seam: zero dock-to-terminal spacing and Win32 DWM visible-frame bounds
  eliminate invisible resize-border gaps; docked h00k panels are frameless and shadowless.
- A persistent ⚙ gear on every attached h00k panel opens a secure native quick menu
  (position, mode, full settings, detach); Ctrl+, also opens the settings for that terminal.
- Native window position tracking (~250ms), with layout recalculation only when window geometry changes or on a bounded recovery check.
- Follow terminal movement and resizing, hide docked views when it is minimized.
- Manual OS window selector if a terminal executable has an unexpected name.
- Per-terminal dock size, automatic attach, follow and always-on-top settings.
- A shared h00k web login session. h00k Desktop never asks for exchange API keys.
- An independent full h00k browser window accessible from the settings window.

**Scope:** The selectable panels are real h00k pages: Screener, Formations, Early W/M,
HookChart Terminal, Surveillance and Replay. Individual OI, liquidations, quality-score
and density micro-widgets are not yet isolated as independent components. An
actual native child window embedded *inside* the terminal is not implemented:
these are independent Windows top-level windows arranged by h00k Desktop.

**Vataga:** Vataga docking uses Win32 window detection or manual selection.
Vataga's third-party screener integration is publicly documented but its
command protocol is not. Ticker-linking is intentionally not claimed or attempted
until a verified API specification is available. The existing website MetaScalp
and Tiger local integrations are kept untouched.

## MetaScalp linking from a tablet (opt-in)

1. On Windows, start MetaScalp and h00k Desktop. In MetaScalp, assign the
   order book, trade feed and charts to one **named link group**, for example
   **002**. Check the MetaScalp version: the `Active window` binding is
   different from a named link group and is not notified by this API.
2. In h00k Desktop click **Separate window**, sign in to your h00k.top
   account (email/password), then enable **Receive ticker selections from
   tablet** in Desktop settings. The remote-control feature is off by default.
3. Sign into the **same** account at h00k.top on the tablet. In Profile →
   Terminal linking select MetaScalp and the matching group (e.g. 002).
   Turn on **Send to h00k Desktop instead of local MetaScalp** on that tablet.
4. Select a coin via an existing site ticker-link action. The tablet uses
   a protected account route, and the Electron main process forwards only
   `tickerPattern` and `binding` to `127.0.0.1:17845..17855/api/change-ticker`.

The tablet web browser cannot safely access the Windows process's localhost.
For browser compatibility this design uses h00k.top HTTPS as a lightweight
**control-only relay**: a single 20-second long-poll per enabled Desktop
(maximum two per user on the backend), plus one brief POST for each clicked
symbol. It is not LAN peer-to-peer even when both devices share Wi-Fi.
No exchange market streams, orders, API keys, or local-server ports are
exposed. Desktop gets its h00k login via the existing Electron website
session partition; a login in an unrelated Windows browser does not count.
The server keeps only a recent, at-most-one ticker command per account in
memory; it is not a durable queue. The accepted status means queued for
delivery, not independently verified in MetaScalp. On Windows, run a real
end-to-end acceptance check with live MetaScalp before relying on this link.

## Installer size, disk usage and resource safety

There are **two different Windows downloads**:

- `h00k Desktop Setup <version>.exe`: the direct **NSIS** installer. It
  includes the actual h00k Desktop app and **one** Electron browser runtime.
  Prefer this when download size is the priority.
- `h00k Setup <version>.exe`: the animated robot installer. Its friendly
  animated setup GUI is a separate Electron launcher **containing the NSIS
  installer**, so the download includes **two Electron runtimes**. The
  launcher runs during installation, not as another background trading client.

Both installers preserve four languages (English, Ukrainian, Polish and
Russian) and all supported terminal window modes. Builder configurations
retain only the corresponding system Electron locale packs and use normal
compression; app source assets use explicit packaging allowlists.
Do **not** delete development tests, documentation or scripts from the
repository to make the download smaller: they are already excluded from
the installed runtime.

The `h00k Desktop installer size audit` GitHub Actions workflow builds
both installers on packaging PRs and uploads
`h00k-desktop-package-size-report` with measured installer bytes,
installed file count / disk bytes, ASAR size and retained language packs.
The installer file's download size is **not** the application's live RAM
usage. Each actively docked h00k page can separately connect to h00k.top;
up to four multi-windows per terminal family and six in total are allowed.
CPU, RAM, WebSocket count and actual VPS traffic require an instrumented
Windows load test, not a packaging audit.

## Build on a Windows 10/11 (64-bit) developer machine

~~~powershell
cd desktop
npm install
npm test
npm start
~~~

Build a Windows NSIS installer:

~~~powershell
cd desktop
npm install
npm run dist
~~~

Installer output is in desktop/dist/. GitHub Actions includes a separate
"h00k Desktop Windows" workflow with a manual dispatch trigger and
artifact upload on successful builds. It does not deploy to h00k's VPS.

## Windows and security constraints

The native discovery agent is a single persistent PowerShell process reading
visible top-level window metadata via Win32 EnumWindows and GetWindowRect.
It never injects code, touches the keyboard/mouse, accesses positions, or sends
trades. Window coordinates are converted to Electron logical DPI coordinates.

The h00k remote website is isolated with sandbox, contextIsolation and no
Node integration/preload. Only the local settings page exposes a narrow,
sender-checked IPC bridge.

If the trading terminal is maximized and no space exists beyond the selected
edge, docked views are hidden instead of overlapping the trading controls.
For a maximized terminal use a second monitor, a smaller terminal window,
or manually positioned floating panes.

## Manual acceptance tests still required

Verify on real Windows 10/11, multiple monitors, 100/125/150% DPI,
moving/resizing/minimizing each supported terminal, elevated/UAC terminals,
fullscreen and reconnect behavior, and website login persistence.
MetaScalp and Tiger localhost ticker routing must be validated separately.
Passing Node unit tests is not a substitute for end-to-end Windows tests.

The h00k website query desktopPanel changes presentation only. It does not
grant access to locked sections or expose desktop IPC.

## v0.1.1 quick control and seam verification

The gear is an isolated local WebContentsView with a minimal IPC preload. The
remote h00k.top website cannot invoke toolbar commands. Settings opened from
the gear automatically select the correct provider, including after the settings
window was closed. Switching from docked to floating recreates a decorated
movable window; switching back recreates a frameless dock panel.

Verify that the target edge and h00k panel physically meet at 100%, 125%, and
150% Windows scaling and on a mixed-DPI second monitor. Windows DWM visible
bounds are used when available, while GetWindowRect remains a fallback.
A screenshot alone cannot guarantee every OS decoration/theme is pixel-perfect.

For an already-installed copy, use a new Windows installer from this branch's
successful **h00k Desktop Windows** Actions artifact. Desktop files are not
replaced by updating the Linux VPS.

## v0.1.2 audit fixes

- Saved per-panel floating bounds are validated, retained independently for
  MetaScalp/Tiger/Vataga, and restored when their original monitor is connected.
  An unplugged/off-screen display falls back to a visible work area.
- Explicit changes to floating mode, side or dimensions reposition existing
  windows even if Follow is disabled. New users can choose the initial side
  without needing a running trading terminal.
- Web pages are lazy-loaded **only after** the window has sufficient display
  space and is first displayed. A docked panel hidden for over 30 seconds due
  to a missing/minimized terminal or no free space is destroyed, releasing
  timers/network activity until the terminal returns. The website server itself
  continues handling its ordinary traffic.
- "Автоматично знайти" now clears the manually stored target. A chosen
  executable is found again if its window title changes and there is exactly
  one matching running window.
- The local window picker no longer re-creates its options on every tracker
  tick (especially when PnL/price titles update).

**Authentication limitation:** This version embeds h00k.top in Electron.
Email/password sign-in remains the practical option in the embedded view.
Google OAuth through embedded webviews is not guaranteed (Google restricts
embedded user-agents); this version does not claim to solve external-browser
OAuth callback/session transfer. Do not enter exchange API keys in h00k Desktop.

**Vataga limitation:** Public integration instructions exist (enable application
integration in Settings > General > Other, and select orderbook > Bind to
window > Screener), but the command protocol used by partners is not published.
No unverified API traffic is sent. References:
https://liner.scalpsecta.com/docs
https://vataga.trading/ru/news/releases/obnovlenie-terminala-vataga-terminal-5-13-3

These audit changes need real Windows validation (multi-monitor DPI, actual
trading terminal executables, drag/resize behavior, Google auth experience).

## v0.1.3: branded Windows installer

- The Windows executable, taskbar and its desktop shortcut use a **multi-resolution
  h00k robot-eyes icon** (16 through 256 px) instead of the Electron placeholder.
  The graphic is generated from the original existing `public/h00k-robot-logo.svg`
  with no external image files.
- The assisted NSIS install/uninstall wizard includes dark-navy h00k-themed
  sidebar illustrations and a cyan-on-dark header (true 24-bit BMP graphics);
  standard Windows wizard controls retain the native Windows theme.
- The setup wizard now offers a **real "Створити ярлик h00k на робочому столі"
  checkbox**. It defaults to checked; uncheck it to omit the shortcut. The
  Start menu shortcut remains available. During re-installation the explicit
  unchecked choice also clears an old desktop link.
- `desktop/build/installer.nsh` extends the existing electron-builder NSIS
  script rather than replacing the install/uninstall implementation.
- Branding assets are generated locally during `npm test` and `npm run dist`
  via `npm run brand-assets`. They are intentionally ignored by Git because
  the robot source SVG remains the single source of truth.
- New tests verify the robot ICO structure, its multi-resolution PNG frames,
  24-bit bitmap dimensions, and the optional shortcut script.

Run on Windows:
```powershell
cd desktop
npm install
npm test
npm run dist
```
Download the installer from the **h00k Desktop Windows** GitHub Actions
artifact. No Linux VPS deployment is needed. If you previously pinned the
old Electron icon on the Windows taskbar, unpin it and pin the newly installed
h00k Desktop again to refresh the taskbar cache.

## v0.1.4 — installer upgrade / shortcut QA

- The **Create h00k desktop shortcut** checkbox remains optional, and now its
  explicit choice is saved in the installer's registry key. Silent upgrades do
  not unexpectedly recreate a shortcut that the user previously declined.
- Unchecking deletes both old and new desktop links; rechecking restores the
  current link with the correct AppUserModelID, preserving the h00k robot icon
  even if electron-builder's upgrade logic kept old shortcuts.
- IT administrators may control shortcuts in a silent installation:
  `"h00k Desktop Setup 0.1.4.exe" /S /NO_DESKTOP_SHORTCUT` or
  `"h00k Desktop Setup 0.1.4.exe" /S /DESKTOP_SHORTCUT`.
  Without either switch, the user's last explicit choice is preserved.
  Start Menu shortcuts are unaffected.
- GitHub Actions now **runs the generated installer on Windows**, tests
  unchecked / silent-upgrade / checked cases and checks that the resulting
  desktop link points to an installed application carrying a Windows icon.
  It also publishes a companion `SHA256SUMS.txt` in the same artifact ZIP.

### Verify the downloaded setup file

After extracting the GitHub Actions artifact in PowerShell:

```powershell
Get-FileHash '.\h00k Desktop Setup 0.1.4.exe' -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

The two SHA-256 values should match. The current development installer is
**not Authenticode code-signed**; Windows SmartScreen may warn for this reason.
Do not bypass warnings from unknown sources. Publisher signing should be
configured only after a suitable certificate is available. The changes above
do not involve production VPS deployment.

## v0.1.5 — exact h00k robot icon in Windows setup

- The Windows **installer .exe** now uses a dedicated
  `desktop/build/h00k-installer.ico` resource generated from the original
  `public/h00k-robot-logo.svg` eyes and robot bezel only. No letter h/k,
  decorative background tile, extra frame, or stripe is added.
- The **app EXE / desktop and Start menu shortcuts** use the same clean
  transparent robot artwork (`desktop/build/h00k.ico`) in 16, 24, 32, 48,
  64, 128 and 256 pixel sizes. This keeps Windows Explorer, taskbar and installer
  branding consistent.
- Both icons are generated directly from the repository's vector source;
  static PNG preview `h00k-robot-preview.png` accompanies the GitHub Actions
  installer artifact ZIP for visual verification.
- CI now extracts the **actual embedded icon from the NSIS setup .exe** and
  compares its visible pixels against the generated h00k source icon. This
  detects cases where the package config points to the right .ico but the setup
  executable ends up with a default NSIS/Electron icon.
- Desktop tests validate transparency, cyan eyes, dark bezel, .ico frame sizes
  and the generated preview. The installer upgrade/shortcut tests remain intact.

Windows may cache old icons after upgrading. If Windows Explorer or an existing
pinned taskbar shortcut still shows an old image, unpin the old shortcut, remove
the existing desktop shortcut if needed, and pin the new h00k Desktop executable
after installing v0.1.5. That is a Windows icon cache behavior, not a reason
to overwrite or restart the h00k VPS.

## v0.1.7 — four-language Windows installer and translated first-run guide

The real NSIS setup (not just the design mockup) now offers a first-page
language selector: **English (default), Polski, Русский, Українська**.
English is the initial choice even on non-English Windows installations.
Choosing a language changes the native NSIS wizard labels, h00k welcome,
desktop-shortcut prompt, and the post-install onboarding pages. The installer
remembers the explicit selection for later upgrades; the uninstaller uses
that language too.

After the application files install, three translated onboarding pages explain:

1. Starting h00k Desktop and selecting a MetaScalp, Tiger.Trade or Vataga window.
2. Full-site / selected page / floating window modes, placement on all sides,
   automatic follow, and the gear shortcut for quick settings.
3. Existing MetaScalp/Tiger symbol linking, current limits of the Vataga API,
   and safe read-only exchange API keys (when used in supported h00k features).

**Security:** h00k Desktop does **not** need API keys; never give trading
or withdrawal permissions to a read-only connection. Docking Vataga windows
is supported, but automatic ticker linking over a Vataga API has not been
implemented because the external protocol has not been confirmed.

The translations are maintained centrally in
`desktop/i18n/installer.json`. Run `npm run installer-locales` to regenerate
`desktop/build/installer-locales.nsh`; `npm test` and `npm run dist` regenerate
it automatically. Silent installations support an explicit
`/H00K_LANG=en`, `/H00K_LANG=pl`, `/H00K_LANG=ru`, or `/H00K_LANG=uk`.
Without a previous choice, silent installs also default to English.
Windows CI smoke-tests English default, Polish, Russian and Ukrainian choices
and persisted registry language, while preserving the shortcut preference.

## Animated compact Windows setup (v0.1.9)

The preferred download is **h00k-animated-windows-setup**, not the fallback
NSIS installer. The graphical launcher is a separate Windows executable,
approximately **720 × 320 logical pixels** (user-requested height 320px),
with a charcoal-blue h00k surface, English initially selected and Polish,
Russian and Ukrainian also available. It uses the original blinking robot
eyes from `public/h00k-robot-logo.svg`, adds two animated legs and makes
pupils follow the pointer **inside the installer only**.

The welcome screen shows h00k's wordmark without the walking robot. The
robot emerges on the **real installation-folder picker**. During installation,
its position follows the fraction of expected application bytes that have
actually been observed written to the destination. The progress meter is
therefore a file-writing estimate, **not an artificial timer or a precise
measure of every NSIS setup step**. It remains capped at 96% until the silent
NSIS worker exits successfully and the desktop executable is found. When no
new bytes are observed, the robot stops walking but can blink.

The animated UI **does not replace NSIS package management**. It bundles
the ordinary h00k Desktop NSIS installer as a checked internal worker,
runs it with `/S`, the selected `/H00K_LANG` and shortcut choice, and
passes the chosen folder via the final unquoted `/D=` argument. The NSIS
worker continues to own Windows uninstall registration, Start menu and
desktop shortcut creation, upgrade behavior and installation of the actual
h00k application. The launcher verifies the worker's SHA-256 before execution.

After installation, it opens a **separate h00k Quick Start window** with
instructions in the selected language for window docking, panel modes,
MetaScalp/Tiger symbol linking, Vataga's currently unconfirmed ticker API,
and read-only exchange API best practices. No private API keys are required
by h00k Desktop. The installer is currently unsigned.

### Build on a Windows x64 development environment

```powershell
cd desktop
npm install
npm test
npm run dist
node installer/prepare.cjs
npm test --prefix installer
# GitHub Actions stages the launcher outside the parent npm project
# and runs installer/build-isolated.ps1 on Windows.
```

GitHub Actions performs these steps, verifies the original NSIS installer
via an actual unattended installation, checks that the portable launcher
contains a non-corrupted worker and publishes an SHA-256 checksum. The
fallback **h00k-desktop-windows** artifact remains available until the
animated launcher passes real on-device GUI testing.

If a custom installation folder is protected by Windows permissions, use
a writable per-user location (recommended under LocalAppData/Programs).
This launcher does not silently elevate privileges or intercept credentials.

**Manual verification remaining:** actual pointer/eye motion and walking
frame pacing on Windows 10 and 11 with high-DPI screens; unplugged/secondary
monitors, reopening Quick Start and visual line wrapping in all languages.

**Build isolation:** the animated setup is staged in RUNNER_TEMP before
packaging because electron-builder otherwise includes a nested copy of the
parent h00k project and a duplicate NSIS executable. CI rejects duplicate
workers and a launcher app.asar larger than 30MB. Use the Windows CI workflow
for this reproducible packaging path; do not run electron-builder from the
nested installer folder in an unisolated checkout.

## Unreleased: unified dark desktop surfaces and first-run experience

- A first installation opens the local h00k settings with a cyan-accented three-step
  welcome panel. Docking remains paused until the user saves/attaches settings.
- Legacy smartdock.json profiles are treated as already configured; their existing
  automatic attachment is preserved without requiring a new onboarding step.
- A full standalone h00k Desktop window now has the same isolated top-right gear
  as attached panels. Its native menu opens general or terminal-specific settings.
- The settings window uses the existing robot logo, a dark graphite/cyan palette,
  accessible keyboard focus, and responsive controls. Assets are packaged locally.
- No desktop changes in this feature branch update the website or VPS, and the
  final Windows installer has not been built or merged.

Manual checks remaining: first launch on Windows, caption/theme under light-mode
Windows, toolbar overlay against actual h00k pages, focus and DPI at 100–150%,
and re-launch from a pre-existing smartdock.json file.

## Windows 7/8/8.1 experimental compatibility (November 2026)

| OS | Runtime | Status |
|---|---|---|
| Windows 10/11 x64 | Modern Electron | Main supported Windows target |
| Windows 7 SP1 / 8 / 8.1 (x86 and x64) | Electron 22.3.27 | **Experimental EOL preview, not a supported release** |
| Future Windows | Modern Electron | Verification after OS release required |

Electron 22 was the last runtime for Windows 7/8/8.1, but support ended
in October 2023. The Chromium 108 engine is not safe for authenticated
financial accounts or API keys. The preview displays a mandatory warning
before running. Upgrade to an actively supported operating system.

The current online h00k.top is built with Vite 8, whose default target
begins at Chrome 111; Electron 22 contains Chromium 108. The legacy app
window may start, but HookChart, login and live WebSocket data are **not
guaranteed to work**. Additional website compatibility/polyfill work and
real device testing will be needed before any release claims are possible.

Modern animated h00k Setup (Electron 45) cannot run on Windows 7/8.
Legacy uses a separate native NSIS installer for x86/x64 and a distinct
application ID, shortcut, and output folder; it never replaces modern setup.

To compile the preview, manually start the GitHub Actions workflow
`h00k Desktop Windows` with `legacy_preview: true`. By default this
job is disabled and **does not** publish an unsupported preview.
Validate on actual Windows 7 SP1, 8 and 8.1, including PowerShell/.NET,
DPI, 32-bit setup, docked panels, chart rendering and uninstallation.

On Windows 7 with PowerShell 2.0, the read-only Win32 window agent
uses the built-in .NET Framework `System.Web.Extensions` JSON serializer
because `ConvertTo-Json` only exists in newer PowerShell versions. This
fallback avoids requiring Windows Management Framework updates solely for
window discovery. The availability of the relevant .NET Framework
components still must be verified on Windows 7 SP1 test machines.

## Compact 20 px Windows title bar and precise top docking (November 2026)

- Standalone h00k Desktop window uses a 20 DIP high local title bar. Left-side
  docking, MetaScalp, Tiger.Trade, Vataga and browser actions remain direct;
  minimize, fullscreen and close remain on the right. All controls are 18 DIP
  high, so this is intended for precise mouse input rather than touch.
- A short h00k pane docked **above** a terminal now reserves just 2 DIP for
  a clear lower border and slight separation from the DWM caption/shadow.
  Both manual and automatic docking use the same calculation. Other sides
  remain flush. No terminal resizing or forced always-on-top occurs.
- This is a visual geometry fix. Windows itself controls third-party window
  shadows and Z-order, so validate the actual seam on Windows at 100%, 125%
  and 150% DPI. If a terminal applies an unusually large shadow, the seam
  may require an OS-specific adjustment.

## Resizing a top-docked h00k pane from its upper edge

In Windows 10/11, a frameless h00k pane docked **above** MetaScalp,
Tiger.Trade or Vataga exposes a thin 10 DIP cyan hover grip along its
upper edge (excluding the existing gear button). Drag vertically to change
panel height; the lower edge stays 2 DIP above the trading terminal. The
site content remains sandboxed and is not reloaded during a resize. The
height is saved in the terminal profile on release, from 140 to 1000 DIP
(subject to available monitor space). If AUTO chose the top edge, a manual
resize pins that side to **top** to avoid switching edges mid-drag.

Dragging this handle never resizes or moves the third-party terminal.
Attached panes on left/right/bottom and standalone windows retain their
existing sizing/placement behavior. This handle requires the modern
WebContentsView runtime; the experimental unsupported Electron 22 preview
remains unchanged. Check pointer capture across the Windows boundary and
mixed-DPI secondary monitors on a real Windows desktop.

## ECO mode (Windows h00k Desktop)

The compact **ECO** toggle is next to `h00k.top` in the standalone 20 DIP
Desktop top bar; attached-panel gear menus also expose a checked ECO action.
ECO is saved as `ecoMode` in `smartdock.json` (off by default).

When enabled, h00k Desktop keeps the primary live page and **at most one**
WebContents pane per configured terminal profile. Extra independent panels
and extra multi-windows are closed promptly (not just hidden), which releases
their renderer processes and socket clients. When ECO is disabled, all
previously chosen panel configurations are restored. The active page's live
prices, charts, exchange WebSockets and notifications are *not* intentionally
slowed or disabled. Other independent websites or terminal apps are untouched.

The read-only Win32 window detector polls at 1250 ms in ECO instead of 250 ms.
The detector is replaced safely without clearing the last snapshot, and
settings/caption updates are reduced to every 5 s (except real window geometry
changes). Hidden panes are reclaimed after 5 s rather than 30 s. ECO does
not promise lower CPU for a single still-visible heavy HookChart page; its
benefit is mostly from reducing additional webviews and native window scanning.

Turning off ECO restores the ordinary 250 ms tracking and all user-configured
panels; panel settings themselves are not overwritten. Active pages are reused
when possible; restoring closed panels can re-establish their connections.
Windows 10/11 smoke testing and Task Manager CPU/RAM measurement still needed.
