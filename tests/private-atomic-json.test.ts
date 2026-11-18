import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writePrivateJsonAtomic } from '../server/privateAtomicJson';

test('private atomic JSON never follows an insecure legacy temp symlink', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'h00k-private-atomic-'));
  const destination=path.join(dir,'alerts.json');
  const legacy=`${destination}.tmp`;
  const victim=path.join(dir,'unrelated.txt');
  const originalWrite=fs.writeFileSync;
  const originalRename=fs.renameSync;
  const originalFsync=fs.fsyncSync;
  let fileWrites=0, fileWasSynced=false, directoryWasSynced=false;
  try {
    fs.writeFileSync(victim,'do not overwrite');
    fs.symlinkSync(victim, legacy);
    fs.writeFileSync=((fd: fs.PathOrFileDescriptor,...args:any[])=>{
      if (typeof fd === 'number') {
        fileWrites++;
        assert.equal(fs.fstatSync(fd).mode & 0o777,0o600,
          'file must be 0600 before first byte');
      }
      return (originalWrite as any)(fd,...args);
    }) as typeof fs.writeFileSync;
    fs.fsyncSync=((fd)=>{
      if (fs.fstatSync(fd).isFile()) fileWasSynced=true;
      if (fs.fstatSync(fd).isDirectory()) directoryWasSynced=true;
      return originalFsync(fd);
    }) as typeof fs.fsyncSync;
    fs.renameSync=((src,dst)=>{
      if (String(dst) === destination) {
        assert.equal(fileWasSynced,true,'file fsync must precede rename');
        assert.notEqual(String(src),legacy);
        assert.equal(fs.statSync(src).mode & 0o777,0o600);
      }
      return originalRename(src,dst);
    }) as typeof fs.renameSync;

    writePrivateJsonAtomic(destination,JSON.stringify({active:true}));
    assert.equal(fs.readFileSync(victim,'utf8'),'do not overwrite');
    assert.equal(fs.existsSync(legacy),false);
    assert.equal(fs.statSync(destination).mode & 0o777,0o600);
    assert.deepEqual(JSON.parse(fs.readFileSync(destination,'utf8')),{active:true});
    assert.equal(fileWrites,1);
    assert.equal(fileWasSynced,true);
    assert.equal(directoryWasSynced,true);
  } finally {
    fs.writeFileSync=originalWrite;
    fs.renameSync=originalRename;
    fs.fsyncSync=originalFsync;
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('a failed fsync or rename preserves published private JSON and cleans temp', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'h00k-atomic-failure-'));
  const dest=path.join(dir,'alerts.json');
  const originalFsync=fs.fsyncSync;
  const originalRename=fs.renameSync;
  try {
    writePrivateJsonAtomic(dest,'{"old":true}');
    fs.fsyncSync=((fd)=>{
      if (fs.fstatSync(fd).isFile()) throw new Error('injected temp fsync failure');
      return originalFsync(fd);
    }) as typeof fs.fsyncSync;
    assert.throws(()=>writePrivateJsonAtomic(dest,'{"new":true}'),/injected temp fsync failure/);
    fs.fsyncSync=originalFsync;
    assert.equal(fs.readFileSync(dest,'utf8'),'{"old":true}');
    assert.deepEqual(fs.readdirSync(dir),['alerts.json']);

    fs.renameSync=((src,dst)=>{
      if (String(dst) === dest) throw new Error('injected rename failure');
      return originalRename(src,dst);
    }) as typeof fs.renameSync;
    assert.throws(()=>writePrivateJsonAtomic(dest,'{"new":true}'),/injected rename failure/);
    assert.equal(fs.readFileSync(dest,'utf8'),'{"old":true}');
    assert.deepEqual(fs.readdirSync(dir),['alerts.json']);
  } finally {
    fs.fsyncSync=originalFsync;
    fs.renameSync=originalRename;
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
