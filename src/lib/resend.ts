// src/lib/resend.ts
// Minimal Resend API helper — no extra library needed

const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const BACKUP_EMAIL_TO = process.env.BACKUP_EMAIL_TO!;
const BACKUP_EMAIL_FROM = process.env.BACKUP_EMAIL_FROM || 'NaXueXi Backup <backup@naxuexi.com>';

export async function sendBackupEmail({
  subject,
  html,
  attachmentName,
  attachmentContent,
}: {
  subject: string;
  html: string;
  attachmentName: string;
  attachmentContent: string; // JSON string
}): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: BACKUP_EMAIL_FROM,
      to: [BACKUP_EMAIL_TO],
      subject,
      html,
      attachments: [
        {
          filename: attachmentName,
          content: Buffer.from(attachmentContent).toString('base64'),
        },
      ],
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('[Resend] sendEmail failed:', data);
    throw new Error(`Resend API error: ${JSON.stringify(data)}`);
  }
}
