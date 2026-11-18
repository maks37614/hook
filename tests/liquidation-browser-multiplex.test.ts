import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMultiplexBrowserLiquidations} from '../src/components/hookchart/liquidationMultiplexClient';

class FakeClient {
  static OPEN=1;
  readyState=0;
  onopen: (()=>void)|null=null;
  onmessage: ((event:{data:string})=>void)|null=null;
  onerror: (()=>void)|null=null;
  onclose: (()=>void)|null=null;
  sent: Array<Record<string, unknown>>=[];
  constructor(readonly url:string){}
  open(){this.readyState=1;this.onopen?.();}
  send(text:string){this.sent.push(JSON.parse(text));}
  deliver(packet:unknown){this.onmessage?.({data:JSON.stringify(packet)});}
  close(){this.readyState=3;this.onclose?.();}
}

test('optional browser Liq multiplex shares ONE socket for distinct coins without mixing data', () => {
  const savedWindow=(globalThis as any).window;
  const savedSocket=(globalThis as any).WebSocket;
  (globalThis as any).window={location:{origin:'https://h00k.top'}};
  (globalThis as any).WebSocket=FakeClient;
  try {
    const connections:FakeClient[]=[];
    const bridge=createMultiplexBrowserLiquidations(url=>{
      const ws=new FakeClient(url);
      connections.push(ws);
      return ws as unknown as WebSocket;
    });
    const received: Record<string, number>={BTC:0,ETH:0};
    const statuses:boolean[]=[];
    const a=bridge.subscribe({
      exchange:'binance',symbol:'BTCUSDT',
      onSnapshot:rows=>{received.BTC+=rows.length;},
      onLiquidation:()=>{received.BTC++;},
      onStatus:x=>statuses.push(x),
    });
    const b=bridge.subscribe({
      exchange:'bybit',symbol:'ETHUSDT',
      onSnapshot:rows=>{received.ETH+=rows.length;},
      onLiquidation:()=>{received.ETH++;},
      onStatus:()=>{},
    });
    assert.equal(connections.length,1);
    assert.equal(bridge.activeScopes(),2);
    const ws=connections[0];
    assert.match(ws.url,/\/api\/hookchart\/liquidations-multi$/);
    ws.open();
    assert.equal(ws.sent.length,2);
    assert.deepEqual(ws.sent.map(x=>x.symbol),['BTCUSDT','ETHUSDT']);
    const event={id:'e1',side:'LONG',t:Date.now(),p:70000,q:2,usd:140000};
    ws.deliver({type:'snapshot',exchange:'binance',symbol:'BTCUSDT',events:[event],connected:true});
    ws.deliver({type:'snapshot',exchange:'bybit',symbol:'ETHUSDT',events:[],connected:true});
    ws.deliver({type:'liquidation',exchange:'bybit',symbol:'ETHUSDT',event});
    ws.deliver({type:'liquidation',exchange:'binance',symbol:'DOGEUSDT',event});
    assert.deepEqual(received,{BTC:1,ETH:1});
    assert.deepEqual(statuses,[false]);
    a();
    assert.equal(ws.sent.at(-1)?.type,'unsubscribe');
    assert.equal(connections.length,1);
    b();
    assert.equal(bridge.activeScopes(),0);
    assert.equal(ws.readyState,3);
  } finally {
    (globalThis as any).window=savedWindow;
    (globalThis as any).WebSocket=savedSocket;
  }
});

test('late-subscription Liq snapshot gets a deadline and reconnects if missing', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_800_000_000_000 });
  const savedWindow = (globalThis as any).window;
  const savedSocket = (globalThis as any).WebSocket;
  (globalThis as any).window = { location: { origin: 'https://h00k.top' } };
  (globalThis as any).WebSocket = FakeClient;
  try {
    const clients: FakeClient[] = [];
    const bridge = createMultiplexBrowserLiquidations(url => {
      const client = new FakeClient(url);
      clients.push(client);
      return client as unknown as WebSocket;
    });
    const listener = (symbol: string) => ({
      exchange: 'binance' as const, symbol,
      onSnapshot: (_events: unknown[]) => {},
      onLiquidation: (_event: unknown) => {},
      onStatus: (_connected: boolean) => {},
    });
    const stopBtc = bridge.subscribe(listener('BTCUSDT'));
    const first = clients[0];
    first.open();
    first.deliver({ type: 'snapshot', exchange: 'binance',
      symbol: 'BTCUSDT', events: [], connected: true });
    t.mock.timers.tick(15_001);
    assert.equal(first.readyState, 1, 'an already synchronized socket must stay open');
    const stopEth = bridge.subscribe(listener('ETHUSDT'));
    assert.equal(clients.length, 1, 'new market shares the existing socket');
    assert.equal(first.sent.at(-1)?.symbol, 'ETHUSDT');
    t.mock.timers.tick(15_001);
    assert.equal(first.readyState, 3, 'missing the new market snapshot closes the stale socket');
    t.mock.timers.tick(1500);
    assert.equal(clients.length, 2, 'all subscribed markets are resynchronized on reconnect');
    const second = clients[1];
    second.open();
    assert.deepEqual(second.sent.map(packet => packet.symbol), ['BTCUSDT','ETHUSDT']);
    second.deliver({ type: 'snapshot', exchange: 'binance',
      symbol: 'BTCUSDT', events: [], connected: true });
    second.deliver({ type: 'snapshot', exchange: 'binance',
      symbol: 'ETHUSDT', events: [], connected: true });
    t.mock.timers.tick(15_001);
    assert.equal(second.readyState, 1, 'successful snapshots cancel the watchdog');
    stopBtc();
    stopEth();
    assert.equal(second.readyState, 3);
  } finally {
    (globalThis as any).window = savedWindow;
    (globalThis as any).WebSocket = savedSocket;
  }
});

test('capacity denial does not restart healthy Liq markets', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_800_000_000_000 });
  const savedWindow = (globalThis as any).window;
  const savedSocket = (globalThis as any).WebSocket;
  (globalThis as any).window = { location: { origin: 'https://h00k.top' } };
  (globalThis as any).WebSocket = FakeClient;
  try {
    const clients: FakeClient[] = [];
    const statuses: Record<string, boolean[]> = { BTC: [], ALT: [] };
    const bridge = createMultiplexBrowserLiquidations(url => {
      const socket = new FakeClient(url);
      clients.push(socket);
      return socket as unknown as WebSocket;
    });
    const listen = (symbol: string, target: 'BTC' | 'ALT') => bridge.subscribe({
      exchange: 'binance', symbol,
      onSnapshot: () => {},
      onLiquidation: () => {},
      onStatus: value => statuses[target].push(value),
    });
    const stopBtc = listen('BTCUSDT', 'BTC');
    const stopAlt = listen('ALTUSDT', 'ALT');
    const socket = clients[0];
    socket.open();
    socket.deliver({ type: 'snapshot', exchange: 'binance',
      symbol: 'BTCUSDT', events: [], connected: true });
    socket.deliver({ type: 'status', exchange: 'binance', symbol: 'ALTUSDT',
      connected: false, capacity: true });
    t.mock.timers.tick(31_000);
    assert.equal(socket.readyState, 1, 'healthy markets keep the existing shared socket');
    assert.equal(clients.length, 1, 'capacity limit must not cause reconnection storms');
    assert.equal(statuses.ALT.at(-1), false);
    stopBtc();
    stopAlt();
  } finally {
    (globalThis as any).window = savedWindow;
    (globalThis as any).WebSocket = savedSocket;
  }
});

test('partial market resync preserves exponential backoff instead of reconnecting every second', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_800_000_000_000 });
  const savedWindow = (globalThis as any).window;
  const savedSocket = (globalThis as any).WebSocket;
  (globalThis as any).window = { location: { origin: 'https://h00k.top' } };
  (globalThis as any).WebSocket = FakeClient;
  try {
    const clients: FakeClient[] = [];
    const bridge = createMultiplexBrowserLiquidations(url => {
      const client = new FakeClient(url);
      clients.push(client);
      return client as unknown as WebSocket;
    });
    const subscribe = (symbol: string) => bridge.subscribe({
      exchange: 'binance', symbol,
      onSnapshot: () => {},
      onLiquidation: () => {},
      onStatus: () => {},
    });
    const offBtc = subscribe('BTCUSDT');
    const offAlt = subscribe('ALTUSDT');
    const first = clients[0];
    first.open();
    first.deliver({ type: 'snapshot', exchange: 'binance', symbol: 'BTCUSDT',
      events: [], connected: true });
    t.mock.timers.tick(15_001);
    assert.equal(first.readyState, 3);
    t.mock.timers.tick(1_500);
    assert.equal(clients.length, 2, 'first retry can occur after one second');
    const second = clients[1];
    second.open();
    second.deliver({ type: 'snapshot', exchange: 'binance', symbol: 'BTCUSDT',
      events: [], connected: true });
    t.mock.timers.tick(15_001);
    assert.equal(second.readyState, 3);
    t.mock.timers.tick(1_500);
    assert.equal(clients.length, 2,
      'one healthy BTC snapshot must not reset the retry budget for missing ALT');
    t.mock.timers.tick(1_000);
    assert.equal(clients.length, 3, 'second retry uses increased backoff');
    offBtc(); offAlt();
  } finally {
    (globalThis as any).window = savedWindow;
    (globalThis as any).WebSocket = savedSocket;
  }
});
