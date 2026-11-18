import type { Express, Request, Response, NextFunction } from 'express';
import { normalizeLanguage, telegramText } from '../src/locales';
import { getAlertHistory } from './alertService';
import { reformatUserTelegramMessages, sendUserTelegramMessage } from './telegramDelivery';
import { beginSharedTelegramLink, disconnectSharedTelegram, getSharedTelegramStatus } from './telegramLinkService';
import { getUserTelegram, saveUserTelegram } from './userTelegram';
export function installTelegramRoutes(app: Express) {
  app.use('/api/telegram', (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    const owns = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
    if (['botToken', 'chatId', 'telegramBotToken', 'telegramChatId'].some(key => owns(req.body || {}, key) || owns(req.query, key))) {
      return res.status(400).json({ success: false, errorCode: 'credentials_not_allowed' });
    }
    next();
  });
  app.get('/api/telegram/status', (_req, res) => {
    try { res.json(getSharedTelegramStatus(res.locals.userId)); }
    catch { res.status(500).json({ success: false, errorCode: 'request_failed' }); }
  });
  app.post('/api/telegram/config', (req, res) => {
    try {
      const userId = res.locals.userId, current = getUserTelegram(userId);
      saveUserTelegram(userId, { language: req.body.language === undefined ? current?.language : normalizeLanguage(req.body.language) });
      res.json(getSharedTelegramStatus(userId));
    } catch { res.status(500).json({ success: false, errorCode: 'request_failed' }); }
  });
  app.post('/api/telegram/link', async (req, res) => {
    try {
      const result = await beginSharedTelegramLink(res.locals.userId, req.body.language);
      res.status(result.success ? 200 : result.errorCode === 'try_later' ? 429 : 503).json(result);
    } catch { res.status(500).json({ success: false, errorCode: 'request_failed' }); }
  });
  app.post('/api/telegram/disconnect', (req, res) => {
    try { const userId = res.locals.userId; disconnectSharedTelegram(userId); res.json(getSharedTelegramStatus(userId)); }
    catch { res.status(500).json({ success: false, errorCode: 'request_failed' }); }
  });
  app.post('/api/telegram/test', async (req, res) => {
    try {
      const userId = res.locals.userId, target = getUserTelegram(userId);
      if (!target?.botToken || !target.chatId || !target.confirmedAt) return res.status(409).json({ success: false, errorCode: 'connect_first' });
      const language = normalizeLanguage(req.body.language || target.language);
      saveUserTelegram(userId, { language });
      const locale = { en: 'en-US', ru: 'ru-RU', pl: 'pl-PL', uk: 'uk-UA' }[language];
      const time = new Date().toLocaleString(locale, { timeZone: 'Europe/Kyiv' });
      const text = telegramText(language, 'connectionTest', { bot: 'h00k.top', time });
      const result = await sendUserTelegramMessage(userId, text);
      if (!result.success && !result.queued) return res.status(502).json({ ...result, errorCode: 'request_failed' });
      res.json(result);
    } catch { res.status(500).json({ success: false, errorCode: 'request_failed' }); }
  });
  app.post('/api/telegram/reformat-messages', async (_req, res) => {
    try {
      const userId = res.locals.userId, result = await reformatUserTelegramMessages(userId);
      const legacyWithoutIds = getAlertHistory(userId).filter(item => item.telegramSent && !item.telegramDeliveryId).length;
      res.json({ ...result, legacyWithoutIds });
    } catch { res.status(400).json({ success: false, errorCode: 'connect_first' }); }
  });
  app.post('/api/telegram/detect-chat-id', (_req, res) => res.status(410).json({ success: false, errorCode: 'credentials_not_allowed' }));
}
