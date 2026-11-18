import assert from 'node:assert/strict';
import test from 'node:test';
import { copyTextToClipboard } from '../src/utils/copyTextToClipboard';

test('copies the exact displayed BTC/USDT pair', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const values: string[] = [];
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { clipboard: { writeText: async (value: string) => { values.push(value); } } },
  });
  try {
    assert.equal(await copyTextToClipboard('BTC/USDT'), true);
    assert.deepEqual(values, ['BTC/USDT']);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});

test('clipboard failures return false when no DOM fallback is available', async () => {
  const previousNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const previousDoc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { clipboard: { writeText: async () => { throw Error('denied'); } } },
  });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: undefined });
  try {
    assert.equal(await copyTextToClipboard('BTC/USDT'), false);
    assert.equal(await copyTextToClipboard(''), false);
  } finally {
    if (previousNav) Object.defineProperty(globalThis, 'navigator', previousNav);
    else Reflect.deleteProperty(globalThis, 'navigator');
    if (previousDoc) Object.defineProperty(globalThis, 'document', previousDoc);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
