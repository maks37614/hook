import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const code = readFileSync(new URL('../server/replayProfileRoutes.ts',import.meta.url),'utf8');

test('Replay revision zero creates once; stale client cannot recreate missing data', () => {
  assert.match(code, /expected === 0/);
  assert.match(code, /VALUES \(\$1,1,\$2::jsonb,now\(\)\) ON CONFLICT\(user_id\) DO NOTHING RETURNING revision/);
  assert.match(code, /UPDATE auth_replay_state SET revision=revision\+1,payload=\$2::jsonb,updated_at=now\(\) WHERE user_id=\$1 AND revision=\$3::bigint RETURNING revision/);
  assert.match(code, /if \(!rows\[0\]\) throw new AuthFailure\(409/);
});
test('Replay userId comes only from authenticated session not body data', () => {
  assert.match(code, /requireUserAuth/);
  assert.match(code, /\[res\.locals\.userId, serialized, expected\]/);
  assert.match(code, /SELECT revision, payload FROM auth_replay_state WHERE user_id = \$1/);
});
