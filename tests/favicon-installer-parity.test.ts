import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
test('website uses seven-frame h00k installer favicon and matching browser PNG', () => {
  const ico = fs.readFileSync(path.join(root,'public/favicon.ico'));
  const png = fs.readFileSync(path.join(root,'public/favicon.png'));
  const otherPng = fs.readFileSync(path.join(root,'favicon.png'));
  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.equal(ico.readUInt16LE(0),0);
  assert.equal(ico.readUInt16LE(2),1);
  assert.equal(ico.readUInt16LE(4),7);
  const sizes=[16,24,32,48,64,128,256];
  for(let i=0;i<sizes.length;i++){
    const entry=6+i*16;
    const width=ico.readUInt8(entry)||256;
    const height=ico.readUInt8(entry+1)||256;
    assert.equal(width,sizes[i]);
    assert.equal(height,sizes[i]);
    const size=ico.readUInt32LE(entry+8),offset=ico.readUInt32LE(entry+12);
    assert.ok(offset>0&&size>64&&offset+size<=ico.length);
    assert.equal(ico.subarray(offset,offset+8).toString('hex'),'89504e470d0a1a0a');
  }
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16),256);
  assert.equal(png.readUInt32BE(20),256);
  assert.deepEqual(otherPng,png);
  assert.match(html,/rel="icon" type="image\/x-icon" href="\/favicon\.ico\?v=5"/);
  assert.match(html,/rel="icon" type="image\/png" href="\/favicon\.png\?v=5"/);
});
