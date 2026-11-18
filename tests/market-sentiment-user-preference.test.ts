import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getMarketSentimentExpanded } from '../src/utils/marketSentimentPreferences';

test('new and older accounts start with market sentiment expanded', () => {
  assert.equal(getMarketSentimentExpanded('new-user', { uid: 'new-user' }), true);
  assert.equal(getMarketSentimentExpanded('new-user', { uid: 'new-user', marketSentimentExpanded: true }), true);
});

test('explicit per-account preference persists the collapsed state', () => {
  assert.equal(getMarketSentimentExpanded('anna', { uid: 'anna', marketSentimentExpanded: false }), false);
  assert.equal(getMarketSentimentExpanded('anna', { uid: 'anna', marketSentimentExpanded: true }), true);
});

test('preference does not leak to a different account or signed-out guest', () => {
  const firstAccount = { uid: 'anna', marketSentimentExpanded: false };
  assert.equal(getMarketSentimentExpanded('ben', firstAccount), true);
  assert.equal(getMarketSentimentExpanded(null, firstAccount), true);
  assert.equal(getMarketSentimentExpanded('anna', null), true);
});

test('the screener writes expansion changes to its account profile', () => {
  const widget = readFileSync(new URL('../src/components/MarketSentimentWidget.tsx', import.meta.url), 'utf8');
  const auth = readFileSync(new URL('../src/context/AuthContext.tsx', import.meta.url), 'utf8');
  const identity = readFileSync(new URL('../server/pgIdentity.ts', import.meta.url), 'utf8');
  assert.match(widget, /const \{ user, profile, updateProfileData \} = useAuth\(\)/);
  assert.match(widget, /getMarketSentimentExpanded\(accountUid, profile\)/);
  assert.match(widget, /updateProfileData\(\{ marketSentimentExpanded: next \}\)/);
  assert.match(widget, /onClick=\{toggleExpanded\}/);
  assert.match(widget, /aria-expanded=\{expanded\}/);
  assert.match(widget, /\{expanded && \(/);
  assert.match(identity, /marketSentimentExpanded: true/);
  assert.match(identity, /'marketSentimentExpanded'/);
  assert.match(auth, /updateAccountProfile|\/api\/account\/profile/);
});

test('refreshing and polling sentiment does not save or reset expansion settings', () => {
  const widget = readFileSync(new URL('../src/components/MarketSentimentWidget.tsx', import.meta.url), 'utf8');
  assert.match(widget, /const interval = setInterval\(refreshVisible, 30000\)/);
  assert.match(widget, /sentimentRequestBusy\.current/);
  assert.match(widget, /lastSentimentRequestAt\.current/);
  const toggle = widget.slice(widget.indexOf('const toggleExpanded'), widget.indexOf('const fetchSentiment'));
  assert.match(toggle, /updateProfileData/);
  assert.doesNotMatch(widget.slice(widget.indexOf('const fetchSentiment'), widget.indexOf('if \(!data\)')), /setLocalExpansion/);
});
