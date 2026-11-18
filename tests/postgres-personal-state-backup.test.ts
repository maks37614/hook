import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createPersonalStateBackup, verifyPersonalStateBackup } from '../server/pgStateBackup';

test('migration backup starts private, remains immutable, detects damaged contents', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'h00k-pg-backup-'));
  try {
    const snapshot = { surveillance:{'user-1':[]}, alerts:[], history:[] };
    const backup = createPersonalStateBackup(snapshot as any,path.join(directory,'copies'));
    assert.equal(fs.statSync(path.dirname(backup.file)).mode & 0o777,0o700);
    assert.equal(fs.statSync(backup.file).mode & 0o777,0o600);
    assert.equal(verifyPersonalStateBackup(backup.file).sha256,backup.sha256);
    const second = createPersonalStateBackup(snapshot as any,path.join(directory,'copies'));
    assert.notEqual(backup.file,second.file);
    const damaged = JSON.parse(fs.readFileSync(backup.file,'utf8'));
    damaged.snapshot.alerts.push({id:'tampered'});
    fs.writeFileSync(backup.file,JSON.stringify(damaged));
    assert.throws(()=>verifyPersonalStateBackup(backup.file),/checksum mismatch/);
  } finally {
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
