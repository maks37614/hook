import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopPollCursor, parseDesktopTickerCommand } from '../server/desktopLinkRelay';

test('Desktop ticker relay accepts only market data selection fields', () => {
  assert.deepEqual(parseDesktopTickerCommand({
    symbol: 'btcusdt', exchange: 'binance', marketType: 'futures', binding: '1',
  }), {
    symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures', binding: '001',
  });
  assert.deepEqual(parseDesktopTickerCommand({
    symbol: 'ETHUSDT', exchange: 'bybit', marketType: 'spot', binding: '500',
  }), {
    symbol: 'ETHUSDT', exchange: 'bybit', marketType: 'spot', binding: '500',
  });
});
test('Desktop channel rejects market orders, invalid group, URL and code injection', () => {
  const good = { symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures', binding: '001' };
  for (const bad of [
    null, [], {}, { ...good, symbol: 'BTCUSDT; BUY' },
    { ...good, symbol: 'https://evil.example' },
    { ...good, binding: '0' }, { ...good, binding: '501' }, { ...good, binding: '001;DROP' },
    { ...good, exchange: 'unknown' }, { ...good, marketType: 'margin' },
  ]) assert.equal(parseDesktopTickerCommand(bad), null);
  // Even if the browser sends unrelated trading keys, they are never forwarded.
  assert.deepEqual(parseDesktopTickerCommand({ ...good, orderType:'MARKET', quantity: 999 }), good);
});

test('Desktop poll rejects previous VPS epoch cursor immediately',()=>{
  assert.equal(desktopPollCursor('8000','old-vps','new-vps'),0);
  assert.equal(desktopPollCursor('8000','','new-vps'),0);
  assert.equal(desktopPollCursor('8','new-vps','new-vps'),8);
  assert.equal(desktopPollCursor('-1','new-vps','new-vps'),0);
  assert.equal(desktopPollCursor('1234567890123','new-vps','new-vps'),0);
});
