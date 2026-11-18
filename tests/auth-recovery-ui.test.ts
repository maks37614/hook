import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthContext } from '../src/context/AuthContext';
import { AuthModal } from '../src/components/AuthModal';

function view(mode: 'signup' | 'signin', resetToken: string | null = null) {
  const noop = async () => {};
  const auth: NonNullable<React.ContextType<typeof AuthContext>> = {
    user: null, profile: null, loading: false,
    signInWithEmail: noop, registerWithEmail: noop, resendVerification: noop,
    requestPasswordReset: noop, resetPassword: noop, updateProfileData: noop, updateTerminalWorkspace: async () => null,
    logout: noop, logoutAll: noop, listSessions: async () => [], revokeSession: noop,
    resetToken, authError: null, authErrorCode: null, authNotice: null, clearAuthError: () => {},
  };
  return renderToStaticMarkup(React.createElement(AuthContext.Provider, { value: auth },
    React.createElement(AuthModal, { isOpen: true, initialMode: mode, onClose: () => {} })));
}

test('signup and emailed password reset include matching password confirmation, mobile-friendly form', () => {
  const signup = view('signup');
  const reset = view('signin', 'valid-reset-token-is-provided-by-email');
  const signin = view('signin');

  for (const markup of [signup, reset]) {
    assert.match(markup, /Повторіть пароль/, 'password confirmation must be visible');
    assert.match(markup, /autocomplete="new-password"/i, 'password manager must understand new password input');
    assert.match(markup, /maxLength="128"/, 'confirmed password stays within backend length limit');
  }
  assert.doesNotMatch(signin, /Повторіть пароль/);
  assert.doesNotMatch(signin, /Безкоштовний акаунт|Захищені сесії|Підтвердження email|CAPTCHA ·/,
    'the sign-in page must not bring back the removed promotional footer');
  assert.match(signin, />Увійти<\/button>/, 'the sign-in action remains available');
  assert.match(signup, />Реєстрація<\/button>/, 'signup submit button has a concise label');
  assert.doesNotMatch(signup, /Зареєструватися безкоштовно|Безкоштовний акаунт · CAPTCHA/,
    'old submit text and footer caption must be removed');
  assert.match(reset, /Змінити пароль/);
  assert.doesNotMatch(reset, /Захист від ботів/, 'secure emailed reset tokens do not need a second CAPTCHA');
  assert.match(signin, /Захист від ботів/);
});

test('reset and verification email tokens cannot leak through document referrers', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<meta\s+name="referrer"\s+content="no-referrer"/);
  assert.ok(html.indexOf('name="referrer"') < html.indexOf('fonts.googleapis.com'),
    'protect token-bearing URLs before loading any third-party resources');
});

test('successful password reset state change does not clear success notification', () => {
  const source = readFileSync(new URL('../src/components/AuthModal.tsx', import.meta.url), 'utf8');
  assert.match(source, /\}, \[isOpen, initialMode\]\);/,
    'do not re-run the modal bootstrapping effect when resetToken clears');
  assert.match(source, /if \(isOpen && resetToken\) setMode\('reset'\)/,
    'valid new email tokens should still open the reset form');
});

test('auth input icons stay vertically centered when mobile font sizes change', () => {
  const signup = view('signup');
  const signin = view('signin');
  const reset = view('signin', 'valid-reset-token-is-provided-by-email');
  const leftIcon = /class="[^"]*\bpointer-events-none absolute left-3 top-1\/2 -translate-y-1\/2 text-slate-500\b[^"]*"/g;

  assert.equal((signup.match(leftIcon) || []).length, 4, 'all signup field icons must be centered');
  assert.equal((signin.match(leftIcon) || []).length, 2, 'email and password icons must be centered');
  assert.equal((reset.match(leftIcon) || []).length, 2, 'reset password icons must be centered');
  for (const markup of [signup, signin, reset]) {
    assert.match(markup, /class="absolute right-2 top-1\/2 -translate-y-1\/2 rounded-lg p-1\.5/,
      'password visibility toggle must be centered');
    assert.doesNotMatch(markup, /top-2\.5 text-slate-500|top-1\.5 rounded-lg/,
      'fixed top offsets drift when iOS increases input text size');
  }
});

test('password recovery forms have no copy or navigation below the submit button', () => {
  const reset = view('signin', 'valid-reset-token-is-provided-by-email');
  const belowSubmit = reset.slice(reset.indexOf('</form>'));
  assert.ok(belowSubmit.length > 0, 'reset form must render');
  assert.doesNotMatch(belowSubmit, /Повернутися до входу|Безкоштовний акаунт|Підтвердження email/,
    'nothing should appear below the password reset button');
  const authModal = readFileSync(new URL('../src/components/AuthModal.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(authModal, /\(mode === 'forgot' \|\| mode === 'reset'\) && \(/,
    'forgot-password and new-password states must both be free of footer controls');
  assert.match(authModal, /\(mode === 'signin' \|\| mode === 'signup'\) &&/,
    'verification resend action must never appear below the recovery form');
  assert.match(authModal, /mode === 'forgot' \? 'Надіслати посилання'/,
    'the password recovery submit action must remain available');
  assert.match(authModal, /mode === 'reset' \? 'Змінити пароль'/,
    'the new-password submit action must remain available');
});
