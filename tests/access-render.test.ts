import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { terminate } from 'firebase/firestore';
import { db } from '../src/firebase';
import { AuthProvider } from '../src/context/AuthContext';
import { AccessProvider } from '../src/context/AccessContext';
import { RegistrationGate } from '../src/components/AccessPanel';
import { AuthModal } from '../src/components/AuthModal';

test.after(() => terminate(db));
test('a guest must still sign in before entering the application', () => {
  const html = renderToString(React.createElement(AuthProvider, { children:
    React.createElement(AccessProvider, { children:
      React.createElement(RegistrationGate, { children: React.createElement('main', null, 'PRIVATE_PAGE_MARKER') }),
    }),
  }));
  assert.ok(html.includes('Завантаження акаунта'));
  assert.ok(!html.includes('PRIVATE_PAGE_MARKER'));
});
test('registration requires email and password, not trial, invitation or activation codes', () => {
  const html = renderToString(React.createElement(AuthProvider, { children:
    React.createElement(AuthModal, { isOpen: true, initialMode: 'signup', isRestrictedMode: true, onClose() {} }),
  }));
  assert.ok(html.includes('type="email"'));
  assert.ok(html.includes('type="password"'));
  assert.ok(html.includes('Зареєструватися'));
  assert.ok(!html.includes('3 дні повного доступу'));
  assert.ok(!html.includes('Пробний період'));
  assert.ok(!html.includes('inviteCode'));
  assert.ok(!html.includes('Персональний код доступу'));
  assert.ok(!html.includes('aria-label="Закрити"'));
});
