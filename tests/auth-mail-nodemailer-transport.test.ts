import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';

// Real Nodemailer MIME/transport smoke, but no SMTP server, DNS or network.
// Complements the PostgreSQL integration test that captures actual auth mails
// by mocking only the SMTP transport.
test('current Nodemailer composes the real verify/reset email format offline', async () => {
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const info = await transport.sendMail({
    from: 'h00k <auth@example.invalid>',
    to: 'trader@example.invalid',
    subject: 'h00k — підтвердження email',
    text: 'Підтвердіть email для h00k: https://h00k.top/?verifyEmail=example',
  });
  const message = (info as { message?: unknown }).message;
  assert.ok(Buffer.isBuffer(message), 'stream transport must yield a local MIME buffer');
  const mime = message.toString('utf8');
  assert.match(mime, /To: trader@example\.invalid/);
  assert.match(mime, /From: h00k <auth@example\.invalid>/);
  // Nodemailer encodes UTF-8 text as quoted-printable and folds long lines.
  // Undo only soft breaks and '=' encoding before checking the action URL.
  const unfolded = mime.replace(/=\r?\n/g, '').replace(/=3D/gi, '=');
  assert.match(unfolded, /h00k\.top\/\?verifyEmail=example/);
  assert.match(mime, /Content-Transfer-Encoding:/);
});

test('auth mail transport cannot fetch a local path as message content', async () => {
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  // The application only sends plain text. Even an accidentally introduced
  // external-content object must not be allowed to read files.
  const unsafeContent = {
    from: 'h00k <auth@example.invalid>',
    to: 'trader@example.invalid',
    subject: 'blocked-file-check',
    text: { path: '/etc/passwd' },
  };
  await assert.rejects(
    transport.sendMail(unsafeContent as unknown as Parameters<typeof transport.sendMail>[0]),
    /file|access|reject|not allowed/i,
  );
});
