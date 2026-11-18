'use strict';
// Electron 22 is the last Win7/8/8.1-compatible engine, but is UNSUPPORTED.
const LEGACY_ELECTRON_VERSION = '22.3.27';
function major(version) {
  const match = String(version || '').match(/^(\d+)/);
  return match ? Number(match[1]) : 0;
}
function isLegacyWindows(platform,release) {
  if (platform !== 'win32') return false;
  const match = String(release || '').match(/^(\d+)\.(\d+)/);
  return Boolean(match && Number(match[1]) === 6 &&
    Number(match[2]) >= 1 && Number(match[2]) <= 3);
}
function supportsOverlay(platform,release,electronVersion) {
  return platform === 'win32' && major(electronVersion) >= 30 &&
    Number(String(release || '').split('.')[0]) >= 10;
}
function isUnmaintainedElectron(electronVersion) {
  const version=major(electronVersion);
  return version > 0 && version <= 22;
}
function legacyBrowserWarning() {
  return {
    type:'warning',
    title:'h00k Desktop Legacy — застарілий браузер',
    message:'Electron 22 більше не отримує виправлень безпеки.',
    detail:'Ця експериментальна версія для Windows 7/8/8.1 не перевірена на всіх функціях h00k.top. Не використовуйте її для входу в особисті чи фінансові акаунти або з API-ключами. Для безпечнішої роботи потрібні сучасні Windows та оновлюваний браузер.',
    buttons:['Закрити','Продовжити тестування'],
    defaultId:0,
    cancelId:0,
    noLink:true,
  };
}
module.exports={LEGACY_ELECTRON_VERSION,major,isLegacyWindows,
  supportsOverlay,isUnmaintainedElectron,legacyBrowserWarning};
