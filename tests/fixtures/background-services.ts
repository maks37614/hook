// Real application process, with external services replaced only at the network boundary.
import './mock-exchange';

const localFetch = globalThis.fetch;
const fixtureOrigin = process.env.BACKGROUND_FIXTURE_ORIGIN!;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(fixtureOrigin)) throw new Error('Loopback fixture is required');
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.hostname === 'api.telegram.org' || url.hostname.endsWith('binance.com') || url.hostname === 'data-api.binance.vision') {
    return localFetch(`${fixtureOrigin}/?upstream=${encodeURIComponent(url.toString())}`, options);
  }
  return Promise.resolve(new Response('{}', { status: 503 }));
};
