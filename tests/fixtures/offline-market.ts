// Integration tests exercise HTTP/persistence without reaching exchanges or Telegram.
import { ExchangeStreamClient } from '../../server/surveillance/exchangeStream';
globalThis.fetch = async input => {
  if (String(input).includes('/metadata/x509/securetoken@') && process.env.H00K_TEST_AUTH_PUBLIC_KEY) {
    return Response.json({ 'offline-fixture': process.env.H00K_TEST_AUTH_PUBLIC_KEY }, { headers: { 'cache-control': 'max-age=3600' } });
  }
  return new Response('{}', { status: 503 });
};
(ExchangeStreamClient.prototype as any).connect = function() { this.status = 'SYNCING'; };
(ExchangeStreamClient.prototype as any).startWatchdog = function() {};
