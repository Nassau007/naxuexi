// src/app/api/auth/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { password } = await req.json();

  if (!password || password !== process.env.SITE_PASSWORD) {
    return NextResponse.json({ error: 'Mot de passe incorrect' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });

  // Set cookie that expires in 14 days
  response.cookies.set('naxuexi_auth', password, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 14, // 14 days
  });

  return response;
}
