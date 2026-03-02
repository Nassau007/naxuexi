// src/lib/telegram.ts
// Drop-in replacement — fully backward compatible with existing daily-hanzi usage

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID!;

/**
 * Send a message via Telegram.
 * @param text    Message text (supports Markdown if parse_mode is set)
 * @param options Extra Telegram API options (e.g. { parse_mode: 'Markdown' })
 *
 * Backward compatible: existing callers that pass only `text` continue to work.
 */
export async function sendTelegramMessage(
  text: string,
  options: Record<string, unknown> = {}
): Promise<void> {
  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        ...options,
      }),
    }
  );

  if (!res.ok) {
    const error = await res.text();
    console.error('[Telegram] sendMessage failed:', error);
    // We throw so the caller can handle/log — doesn't affect other features
    throw new Error(`Telegram API error: ${error}`);
  }
}
