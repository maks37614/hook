import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

test('surveillance temp is exclusive and 0600 before it is renamed', async () => {
  const cwd=process.cwd();
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'h00k-private-surv-'));
  const rename=fs.renameSync;
  process.chdir(temp);
  try {
    const service=await import('../server/surveillanceService');
    const dataDir=path.join(temp,'server/data');
    fs.mkdirSync(dataDir,{recursive:true});
    const legacy=path.join(dataDir,'surveillance.json.tmp');
    fs.writeFileSync(legacy,'legacy temporary data',{mode:0o644});
    fs.chmodSync(legacy,0o644);
    let checked=false;
    fs.renameSync=((from,to)=>{
      if(String(to).endsWith('surveillance.json')) {
        assert.notEqual(from,legacy,'old predictable temp must not be opened');
        assert.equal(fs.statSync(from).mode & 0o777,0o600);
        checked=true;
      }
      return rename(from,to);
    }) as typeof fs.renameSync;
    assert.equal(service.saveSurveillanceStore({guest:[]}),true);
    assert.equal(checked,true);
    assert.equal(fs.existsSync(legacy),false,'insecure stale temp must be unlinked');
  } finally {
    fs.renameSync=rename;
    process.chdir(cwd);
    fs.rmSync(temp,{recursive:true,force:true});
  }
});
