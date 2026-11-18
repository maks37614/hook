'use strict';
// EXPERIMENTAL EOL compatibility preview, not a supported release.
const source=require('./package.json').build;
const {LEGACY_ELECTRON_VERSION}=require('./os-compat.cjs');
module.exports={
  ...source,
  appId:'top.h00k.desktop.legacy',
  productName:'h00k Desktop Legacy',
  electronVersion:LEGACY_ELECTRON_VERSION,
  directories:{output:'dist-legacy'},
  win:{...source.win,target:['nsis']},
  nsis:{...source.nsis,
    shortcutName:'h00k Desktop Legacy',
    artifactName:'h00k Desktop LEGACY Win7-8 ${version}.${ext}',
  },
};
