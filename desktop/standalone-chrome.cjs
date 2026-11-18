'use strict';

// The remote h00k.top page never receives privileged Electron APIs.
// Keep native Desktop controls on a separate local WebContentsView and give
// every site page (including fixed Terminal and chart dialogs) a safe top row.
const { supportsOverlay } = require('./os-compat.cjs');
const WINDOW_BUTTONS_WIDTH = 0; // Frameless standalone windows have no native caption controls.
const CHROME_HEIGHT = 20; // Ultra-compact standalone Windows title bar.

function standaloneWindowChrome(platform,release = '10.0',electronVersion = '45.0.0') {
  if (!supportsOverlay(platform,release,electronVersion)) return {};
  return {
    frame: false,
    thickFrame: true, // Retain Windows resizing / snap without native captions.
    backgroundColor: '#070d18',
  };
}
function standaloneToolbarInset() {
  return 0; // The toolbar is positioned entirely inside its reserved top row.
}
function standaloneHeaderCSS() {
  // The isolated local toolbar owns all dragging and controls. The untrusted
  // website is shifted below it and never becomes a draggable hit target.
  // Both normal pages and fixed inset-0 workspaces must be shifted: body
  // padding alone does not move position:fixed elements such as Terminal.
  return `
    :root { --h00k-desktop-chrome-height: ${CHROME_HEIGHT}px; }
    body {
      padding-top: var(--h00k-desktop-chrome-height) !important;
      box-sizing: border-box !important;
    }
    body > #root > .min-h-screen {
      min-height: calc(100dvh - var(--h00k-desktop-chrome-height)) !important;
    }
    .app-header { top: var(--h00k-desktop-chrome-height) !important; }
    [role="region"].fixed.inset-0,
    [role="dialog"].fixed.inset-0 {
      top: var(--h00k-desktop-chrome-height) !important;
      height: calc(100dvh - var(--h00k-desktop-chrome-height)) !important;
      min-height: calc(100dvh - var(--h00k-desktop-chrome-height)) !important;
      max-height: calc(100dvh - var(--h00k-desktop-chrome-height)) !important;
    }
    /* The page's own buttons, including timeframe selection and Back, must
       always receive pointer events rather than dragging the native window. */
    .app-header, [role="region"] > header, [role="dialog"] > header {
      -webkit-app-region: no-drag !important;
    }

  `;
}
// The attached frameless windows otherwise have no visual lower boundary.
// Inject only in local Desktop presentation; the public website is unchanged.
// The overlay does not receive pointer input or take space from the chart.
function dockedWindowEdgeCSS() {
  return `
    body::after {
      content: "";
      position: fixed;
      inset: 0;
      box-sizing: border-box;
      border: 1px solid rgba(89, 224, 216, .3);
      border-bottom: 2px solid rgba(89, 224, 216, .85);
      pointer-events: none !important;
      z-index: 2147483000;
    }
  `;
}
module.exports = {
  WINDOW_BUTTONS_WIDTH, CHROME_HEIGHT,
  standaloneWindowChrome, standaloneToolbarInset, standaloneHeaderCSS,
  dockedWindowEdgeCSS,
};
