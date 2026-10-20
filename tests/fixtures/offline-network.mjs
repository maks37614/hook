import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';

// Persistence/restart tests launch child processes; apply the guard there too.
const preload = `--import=${import.meta.url}`;
if (!process.env.NODE_OPTIONS?.includes(preload)) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} ${preload}`.trim();
}

// Unit tests use in-memory exchange responses; HTTP tests use loopback servers.
// Prevent imported clients (including Firebase) from contacting live services.
const local = host => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const values = Array.isArray(args[0]) ? args[0] : args;
  const first = values[0];
  const options = typeof first === 'object' && first !== null ? first : {};
  const host = options.host || (typeof values[1] === 'string' ? values[1] : 'localhost');
  if (!local(host)) throw new Error('External network disabled for tests');
  return originalConnect.apply(this, args);
};
syncBuiltinESMExports();

const localFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!local(url.hostname)) return Promise.reject(new Error('External network disabled for tests'));
  return localFetch(input, options);
};
