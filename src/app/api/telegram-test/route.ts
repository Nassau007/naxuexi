import { NextResponse } from 'next/server';
import { sendTelegramMessage } from '@/lib/telegram';

// GET /api/telegram-test — Send a test message to verify bot works
export async function GET() {
  try {
    const result = await sendTelegramMessage(
      '✅ <b>HanziFlow</b> Telegram bot is connected!\n\nYou will receive daily hanzi practice here every morning.'
    );

    if (result.ok) {
      return NextResponse.json({ success: true, message: 'Test message sent!' });
    } else {
      return NextResponse.json({ success: false, error: result }, { status: 500 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
