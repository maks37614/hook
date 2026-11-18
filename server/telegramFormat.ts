const labelWidth = 15;
const valueWidth = 20;
const contentWidth = labelWidth + valueWidth + 3;

export function escapeTelegramHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function telegramPlainText(value: string): string {
  return value.replace(/\\r\\n|\\n|\\r/g, '\n').replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:b|strong|i|em|u|ins|s|strike|del|code|pre|a|span|blockquote|tg-spoiler|tg-emoji)\b[^>]*>/gi, '')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) => {
      const point = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    })
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/SIGNALHOOK/gi, 'h00k.top');
}

const segments = new Intl.Segmenter('uk', { granularity: 'grapheme' });
function width(value: string): number {
  return [...segments.segment(value)].reduce((total, { segment }) => {
    const point = segment.codePointAt(0)!;
    const wide = /\p{Extended_Pictographic}/u.test(segment) ||
      (point >= 0x1100 && (point <= 0x115f || point >= 0x2e80 && point <= 0xa4cf ||
        point >= 0xac00 && point <= 0xd7a3 || point >= 0xf900 && point <= 0xfaff || point >= 0xff01 && point <= 0xff60));
    return total + (wide ? 2 : 1);
  }, 0);
}

function wrap(value: string, size: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of value.trim().split(/\s+/u)) {
    if (line && width(`${line} ${word}`) <= size) { line += ` ${word}`; continue; }
    if (line) { lines.push(line); line = ''; }
    for (const { segment } of segments.segment(word)) {
      if (width(line + segment) > size) { lines.push(line); line = ''; }
      line += segment;
    }
  }
  lines.push(line);
  return lines;
}

const pad = (text: string, size: number) => text + ' '.repeat(Math.max(0, size - width(text)));
const border = (left: string, join: string, right: string) => `${left}${'─'.repeat(labelWidth + 2)}${join}${'─'.repeat(valueWidth + 2)}${right}`;

/** Fixed-width rows inside <pre> remain aligned in Telegram's mobile clients. */
export function formatTelegramMessages(source: string): string[] {
  const links: string[] = [];
  const withoutLinks = source.replace(/<a\s+href="(https:\/\/[^"<>]+)"[^>]*>(.*?)<\/a>/gi, (_, url, label) => {
    const link = `<a href="${escapeTelegramHtml(url)}">${escapeTelegramHtml(telegramPlainText(label))}</a>`;
    if (links.join('\n').length + link.length > 400) return `${telegramPlainText(label)}: ${url}`;
    links.push(link);
    return '';
  });
  const lines = telegramPlainText(withoutLinks).split('\n').map(line => line.trim()).filter(line => line && !/^[━─═\-_]{3,}$/.test(line));
  const title = lines.shift() || 'h00k.top';
  const rows: string[] = [];
  for (const original of lines) {
    const line = original.replace(/^[\s•✓\p{Extended_Pictographic}\uFE0F\u200D]+/u, '');
    const colon = line.indexOf(':');
    if (colon > 0 && colon < 48 && !/^https?:/i.test(line)) {
      const labels = wrap(line.slice(0, colon).trim(), labelWidth);
      const values = wrap(line.slice(colon + 1).trim(), valueWidth);
      for (let i = 0; i < Math.max(labels.length, values.length); i++) {
        rows.push(`│ ${pad(labels[i] || '', labelWidth)} │ ${pad(values[i] || '', valueWidth)} │`);
      }
    } else {
      for (const part of wrap(line, contentWidth)) rows.push(`│ ${pad(part, contentWidth)} │`);
    }
  }
  if (!rows.length) rows.push(`│ ${pad('h00k.top', contentWidth)} │`);
  const top = border('┌', '┬', '┐');
  const bottom = border('└', '┴', '┘');
  const chunks: string[][] = [[]];
  // Count HTML entities too, keeping every part comfortably below Telegram's limit.
  for (const row of rows) {
    const current = chunks[chunks.length - 1];
    if (escapeTelegramHtml([...current, row].join('\n')).length > 2500) chunks.push([]);
    chunks[chunks.length - 1].push(row);
  }
  const safeTitle = escapeTelegramHtml(wrap(title, 120)[0]);
  return chunks.map((chunk, index) => {
    const counter = chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : '';
    const footer = index === chunks.length - 1 ? links.join('\n') : '';
    return `<b>${safeTitle}${counter}</b>\n<pre>${escapeTelegramHtml([top, ...chunk, bottom].join('\n'))}</pre>${footer ? `\n${footer}` : ''}`;
  });
}
