import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src=readFileSync(new URL('../scripts/benchmark-surveillance.mjs',import.meta.url),'utf8');
test('load testing defaults to synthetic local in-process mode without exchange network activity',()=>{
 assert.match(src,/NO exchange\/API traffic/);
 assert.match(src,/hasExternalRequests:false/);
 assert.match(src,/watchers<1\|\|watchers>10_000/);
 assert.match(src,/markets<1\|\|markets>watchers/);
 assert.doesNotMatch(src,/fetch\(|WebSocket\(|https?:\/\//);
});
