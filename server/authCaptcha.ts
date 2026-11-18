import type { Request } from 'express';
import { AuthFailure } from './pgIdentity';
import { AUTH_CAPTCHA_ACTION } from '../src/utils/captchaAction';

// The public key is used only by the browser; the secret must never leave the server.
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 5_000;
const MAX_CONCURRENT_VERIFICATIONS = 12;
let inFlightVerifications = 0;

const isCloudflareTestKey = (value: string) => /^[123]x0{10,}/.test(value);

export function captchaConfig() {
  const siteKey = (process.env.TURNSTILE_SITE_KEY || '').trim();
  const secret = (process.env.TURNSTILE_SECRET_KEY || '').trim();
  const configured = Boolean(siteKey && secret) &&
    !(process.env.NODE_ENV === 'production' &&
      (isCloudflareTestKey(siteKey) || isCloudflareTestKey(secret)));
  return { provider: 'turnstile' as const, required: true, configured, siteKey: configured ? siteKey : null };
}

export async function verifyAuthCaptcha(req: Request): Promise<void> {
  const config = captchaConfig();
  const secret = (process.env.TURNSTILE_SECRET_KEY || '').trim();
  if (!config.configured) {
    throw new AuthFailure(503, 'Захист входу ще не налаштовано. Зверніться до адміністратора.', 'CAPTCHA_NOT_CONFIGURED');
  }
  const token = req.body?.captchaToken;
  // Cloudflare limits its tokens to 2048 characters. Never send arbitrary blobs to Siteverify.
  if (typeof token !== 'string' || !token.trim() || token.length > 2048) {
    throw new AuthFailure(400, 'Підтвердіть, що ви не робот.', 'CAPTCHA_REQUIRED');
  }
  if (inFlightVerifications >= MAX_CONCURRENT_VERIFICATIONS) {
    throw new AuthFailure(429, 'Забагато перевірок. Повторіть спробу пізніше.', 'CAPTCHA_BUSY');
  }

  inFlightVerifications++;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (req.ip) body.set('remoteip', req.ip);
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new AuthFailure(503, 'Перевірка CAPTCHA тимчасово недоступна.', 'CAPTCHA_UNAVAILABLE');
    }
    const result = await response.json() as {
      success?: boolean;
      hostname?: string;
      action?: string;
    };
    // A successful token for another hostname or action must never authorize this site.
    const expectedHost = new URL(process.env.PUBLIC_BASE_URL || 'https://h00k.top').hostname;
    if (result.success !== true || result.hostname !== expectedHost || result.action !== AUTH_CAPTCHA_ACTION) {
      throw new AuthFailure(403, 'CAPTCHA недійсна або застаріла. Пройдіть перевірку ще раз.', 'CAPTCHA_FAILED');
    }
  } catch (error) {
    if (error instanceof AuthFailure) throw error;
    // Do not log submitted tokens, Cloudflare responses or client IP addresses.
    console.error('[Auth CAPTCHA] verification transport unavailable');
    throw new AuthFailure(503, 'Не вдалося перевірити CAPTCHA. Спробуйте ще раз.', 'CAPTCHA_UNAVAILABLE');
  } finally {
    inFlightVerifications--;
  }
}
