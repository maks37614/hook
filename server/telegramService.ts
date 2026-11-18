import { normalizeLanguage, telegramText, type SupportedLanguage } from '../src/locales';
import { formatTelegramMessages, telegramPlainText } from './telegramFormat';

// Check Telegram Bot Info
export async function getTelegramBotInfo(token?: string): Promise<{ ok: boolean; username?: string; error?: string }> {
  const effectiveToken = token?.trim();
  if (!effectiveToken) {
    return { ok: false, error: 'Спільний Telegram-бот не налаштований на сервері' };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${effectiveToken}/getMe`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    if (data.ok && data.result) {
      return { ok: true, username: data.result.username };
    }
    return { ok: false, error: data.description || 'Спільний Telegram-бот недоступний' };
  } catch (err: any) {
    return { ok: false, error: err.message?.replaceAll(effectiveToken, '[redacted]') || 'Помилка з\'єднання з Telegram API' };
  }
}

// Human-friendly Telegram error translator
export function formatTelegramErrorMessage(rawError: string, botUsername?: string, botId?: string, targetChatId?: string): string {
  const err = rawError.toLowerCase();

  if (err.includes("can't send messages to the bot") || err.includes("can't send message to bot") || (botId && targetChatId && botId === targetChatId)) {
    return `❌ Не вдалося визначити особистий чат для сповіщень. Відкрийте спільного бота${botUsername ? ` @${botUsername}` : ''} та натисніть «START».`;
  }

  if (err.includes('bot was blocked by the user')) {
    return `❌ Сповіщення від спільного бота вимкнені. Відкрийте${botUsername ? ` @${botUsername}` : ' Telegram-бота H00K'} та натисніть /start.`;
  }

  if (err.includes('chat not found')) {
    return `❌ Чат Telegram не знайдено. Відкрийте спільного бота${botUsername ? ` @${botUsername}` : ''} за посиланням підключення та натисніть «START».`;
  }

  if (err.includes('unauthorized') || err.includes('invalid token')) {
    return `❌ Спільний Telegram-бот недоступний. Адміністратор сайту має перевірити налаштування бота на сервері.`;
  }

  return rawError;
}

export interface TelegramSendResult {
  success: boolean;
  error?: string;
  messageIds: number[];
  chatId?: string;
  retryable?: boolean;
  retryAfterSeconds?: number;
}

interface TelegramTarget { botToken?: string; chatId?: string; parseMode?: 'HTML' | 'Markdown'; startPart?: number }

function validateTarget(options: TelegramTarget): string | undefined {
  if (!options.botToken?.trim() || !options.chatId?.trim()) return 'Сповіщення Telegram не підключені. Підключіть свій чат у профілі.';
  if (options.botToken.split(':')[0] === options.chatId.trim()) return formatTelegramErrorMessage("the bot can't send messages to the bot");
}

async function telegramRequest(method: string, botToken: string, body: Record<string, unknown>) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json();
    return { ...data, httpStatus: response.status };
  } catch (error) {
    return { ok: false, networkError: true, description: error instanceof Error ? error.message.replaceAll(botToken, '[redacted]') : 'Telegram недоступний' };
  }
}

/** Every call must provide one complete destination. Global settings are never a fallback. */
export async function sendTelegramMessage(text: string, options: TelegramTarget = {}): Promise<TelegramSendResult> {
  const error = validateTarget(options);
  if (error) return { success: false, error, messageIds: [] };
  const botToken = options.botToken!.trim();
  const chatId = options.chatId!.trim();
  const parts = formatTelegramMessages(text);
  const messageIds: number[] = [];
  let deliveredChatId = chatId;
  for (let index = options.startPart || 0; index < parts.length; index++) {
    const body = { chat_id: chatId, text: parts[index], parse_mode: 'HTML', disable_web_page_preview: true };
    let data = await telegramRequest('sendMessage', botToken, body);
    if (!data.ok && /can't parse entities/i.test(data.description || '')) {
      const { parse_mode: _, ...plainBody } = body;
      data = await telegramRequest('sendMessage', botToken, { ...plainBody, text: telegramPlainText(parts[index]) });
    }
    if (!data.ok) return {
      success: false, messageIds, chatId: deliveredChatId,
      // If the network timed out, Telegram may already have accepted this part.
      // Retrying an ambiguous send can duplicate a delivered notification.
      error: data.networkError
        ? 'Не вдалося підтвердити відповідь Telegram. Автоматичне повторення вимкнено, щоб не надіслати дубль.'
        : formatTelegramErrorMessage(data.description || 'Telegram відхилив повідомлення'),
      retryable: Boolean(!data.networkError && (data.error_code === 429 || data.httpStatus >= 500 || data.error_code >= 500)),
      retryAfterSeconds: Number(data.parameters?.retry_after) || undefined,
    };
    if (Number.isSafeInteger(data.result?.message_id)) messageIds.push(data.result.message_id);
    deliveredChatId = data.result?.chat?.id === undefined ? deliveredChatId : String(data.result.chat.id);
  }
  return { success: true, messageIds, chatId: deliveredChatId };
}

export async function editTelegramMessage(messageId: number, htmlText: string, options: TelegramTarget): Promise<{ success: boolean; error?: string }> {
  const error = validateTarget(options);
  if (error) return { success: false, error };
  const data = await telegramRequest('editMessageText', options.botToken!.trim(), {
    chat_id: options.chatId!.trim(), message_id: messageId, text: htmlText,
    parse_mode: 'HTML', disable_web_page_preview: true,
  });
  return data.ok || /message is not modified/i.test(data.description || '')
    ? { success: true }
    : { success: false, error: formatTelegramErrorMessage(data.description || 'Не вдалося змінити повідомлення') };
}

export async function testTelegramConnection(token?: string, chatId?: string, language: SupportedLanguage = 'uk') {
  if (!token?.trim() || !chatId?.trim()) return { success: false, error: 'Спільний Telegram-бот або особистий чат не налаштовано' };
  const botInfo = await getTelegramBotInfo(token.trim());
  if (!botInfo.ok) return { success: false, error: botInfo.error };
  const selectedLanguage = normalizeLanguage(language);
  const locale = { en: 'en-US', ru: 'ru-RU', pl: 'pl-PL', uk: 'uk-UA' }[selectedLanguage];
  const message = telegramText(selectedLanguage, 'connectionTest', {
    bot: botInfo.username ? `@${botInfo.username}` : '',
    time: new Date().toLocaleString(locale, { timeZone: 'Europe/Kyiv' }),
  });
  const result = await sendTelegramMessage(message, { botToken: token.trim(), chatId: chatId.trim() });
  // The authenticated API saves this user's configuration; testing never changes global settings.
  return { ...result, botUsername: botInfo.username, messageText: message };
}
