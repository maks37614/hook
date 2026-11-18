'use strict';
// Native (Windows) labels share the same four UI languages as the installer.
// This file contains no site-side code and never runs inside h00k.top.
const LANGUAGES=Object.freeze(['uk','en','pl','ru']);
const rows={
  settingsTitle:['Налаштування прикріплення','Docking settings','Ustawienia dokowania','Настройки прикрепления'],
  dockMenu:['⚙ Налаштування прикріплення…','⚙ Docking settings…','⚙ Ustawienia dokowania…','⚙ Настройки прикрепления…'],
  configure:['Налаштувати ','Configure ','Skonfiguruj ','Настроить '],
  browser:['Відкрити h00k.top у браузері','Open h00k.top in browser','Otwórz h00k.top w przeglądarce','Открыть h00k.top в браузере'],
  position:['Розташування','Position','Położenie','Расположение'],
  mode:['Режим','Mode','Tryb','Режим'],
  automatic:['Автоматично (де більше місця)','Automatic (most free space)','Automatycznie (więcej miejsca)','Автоматически (где больше места)'],
  right:['Праворуч','Right','Po prawej','Справа'],
  left:['Ліворуч','Left','Po lewej','Слева'],
  top:['Зверху','Top','U góry','Сверху'],
  bottom:['Знизу','Bottom','Na dole','Снизу'],
  full:['Увесь h00k','Entire h00k','Cały h00k','Весь h00k'],
  blocks:['Вибрані блоки','Selected sections','Wybrane sekcje','Выбранные разделы'],
  floating:['Плаваючі вікна','Floating windows','Pływające okna','Плавающие окна'],
  multi:['Мультивікна','Multi-window','Wiele okien','Мультиокна'],
  detach:['Відкріпити від ','Detach from ','Odłącz od ','Открепить от '],
  toolbarDocking:['Прикріплення','Docking','Dokowanie','Прикрепление'],
  toolbarBrowser:['Сайт','Website','Strona','Сайт'],
  toolbarEcoMenu:['ECO: економія ресурсів','ECO: save resources','ECO: oszczędzanie zasobów','ECO: экономия ресурсов'],
  toolbarEcoEnable:['Увімкнути ECO: менше фонових вікон і перевірок Windows','Enable ECO: fewer background views and Windows scans','Włącz ECO: mniej okien w tle i skanowań Windows','Включить ECO: меньше фоновых окон и проверок Windows'],
  toolbarEcoDisable:['Вимкнути ECO: відновити всі вибрані панелі','Disable ECO: restore all selected panes','Wyłącz ECO: przywróć wszystkie wybrane panele','Выключить ECO: восстановить все выбранные панели'],
  toolbarTitle:['Налаштування прикріплення h00k (Ctrl+,)','h00k docking settings (Ctrl+,)','Ustawienia dokowania h00k (Ctrl+,)','Настройки прикрепления h00k (Ctrl+,)'],
  toolbarAria:['Налаштування прикріплення','Docking settings','Ustawienia dokowania','Настройки прикрепления'],
  toolbarMinimize:['Згорнути вікно','Minimize window','Minimalizuj okno','Свернуть окно'],
  toolbarFullscreen:['На весь екран','Fullscreen','Pełny ekran','На весь экран'],
  toolbarExitFullscreen:['Вийти з повного екрана','Exit fullscreen','Wyjdź z pełnego ekranu','Выйти из полноэкранного режима'],
  toolbarClose:['Закрити вікно h00k','Close h00k window','Zamknij okno h00k','Закрыть окно h00k'],
};
function nativeT(key,language='uk'){
  const translations=rows[key];
  if(!translations)throw new Error('Unknown Desktop UI key: '+key);
  const index=LANGUAGES.indexOf(language);
  return translations[index<0?0:index];
}
module.exports={LANGUAGES,nativeT,rows};
