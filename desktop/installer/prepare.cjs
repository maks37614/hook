'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const here = __dirname;
const desktop = path.resolve(here, '..');
const assets = path.join(here, 'assets');
const config = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'));
const worker = path.join(desktop, 'dist', 'h00k Desktop Setup ' + config.version + '.exe');
const installed = path.join(desktop, 'dist', 'win-unpacked');

function accurateSize(dir) {
  let total = 0, files = 0;
  const visit = current => {
    for (const entry of fs.readdirSync(current,{withFileTypes:true})) {
      const name=path.join(current,entry.name);
      if (entry.isDirectory()) visit(name);
      else if (entry.isFile()) {total+=fs.statSync(name).size; files++;}
    }
  };
  visit(dir);
  return {total,files};
}

async function main() {
  if (!fs.existsSync(worker) || !fs.existsSync(installed)) {
    throw new Error('First build desktop NSIS: npm run dist in desktop/. Missing ' + worker);
  }
  fs.mkdirSync(assets,{recursive:true});
  const svg = fs.readFileSync(path.resolve(desktop, '..', 'public', 'h00k-robot-logo.svg'), 'utf8');
  if (!svg.includes('class="robot-eye"') || !svg.includes('robot-pupil')) {
    throw new Error('The original h00k blinking eyes logo is required');
  }
  const robot = svg
    .replace(/<svg\b[^>]*>/, '<svg id="robotHead" xmlns="http://www.w3.org/2000/svg" viewBox="23 2 50 39" role="img" aria-label="h00k robot eyes">')
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/, '')
    .replace(/<style>[\s\S]*?<\/style>/, ''); // animation is controlled by the local CSP-safe CSS
  const template = fs.readFileSync(path.join(here,'ui.template.html'),'utf8');
  if (!template.includes('<!-- ROBOT_FACE_FROM_H00K_TOP -->')) throw new Error('Missing robot placeholder');
  fs.writeFileSync(path.join(here,'ui.html'),
    template.replace('<!-- ROBOT_FACE_FROM_H00K_TOP -->',robot));
  const guide = JSON.parse(fs.readFileSync(path.join(desktop,'i18n','installer.json'),'utf8'));
  for (const key of ['en','pl','ru','uk']) if (!guide[key]?.guide1 || !guide[key]?.api5) {
    throw new Error('Missing ' + key + ' first-run instructions');
  }
  fs.writeFileSync(path.join(assets,'guide.json'),JSON.stringify(guide));
  fs.copyFileSync(path.join(desktop,'build','h00k-installer.ico'),path.join(assets,'h00k.ico'));
  fs.copyFileSync(worker,path.join(assets,'h00k-worker.exe'));
  const h=crypto.createHash('sha256');
  await new Promise((resolve,reject)=>{
    const stream=fs.createReadStream(worker);
    stream.on('data',chunk=>h.update(chunk));stream.on('end',resolve);stream.on('error',reject);
  });
  const counts=accurateSize(installed);
  const meta={
    version:config.version,
    worker:'h00k-worker.exe',
    workerSha256:h.digest('hex'),
    workerBytes:fs.statSync(worker).size,
    expectedInstalledBytes:counts.total,
    expectedInstalledFiles:counts.files,
    appExecutable:'h00k Desktop.exe',
  };
  if (counts.total < 10_000_000 || meta.workerBytes < 10_000_000) throw new Error('Unreasonably small application payload');
  fs.writeFileSync(path.join(assets,'manifest.json'),JSON.stringify(meta,null,2));
  console.log('Prepared animated h00k installer for',meta.version,'files',counts.files,'installed bytes',counts.total);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
