const TELEGRAM_API = 'https://api.telegram.org/bot';

export function getTelegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set');
  }
  return { token, chatId };
}

export async function sendTelegramMessage(
  text: string,
  options?: { parseMode?: 'HTML' | 'MarkdownV2'; chatId?: string }
) {
  const config = getTelegramConfig();
  const res = await fetch(`${TELEGRAM_API}${config.token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: options?.chatId || config.chatId,
      text,
      parse_mode: options?.parseMode || 'HTML',
    }),
  });
  return res.json();
}
