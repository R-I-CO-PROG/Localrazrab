import nodemailer from "nodemailer";

export function isEmailConfigured(): boolean {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  return Boolean(user && pass);
}

function getTransporter() {
  if (!isEmailConfigured()) {
    throw new Error("SMTP не настроен (SMTP_USER, SMTP_PASS)");
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: process.env.SMTP_PASS!.trim(),
    },
  });
}

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const from =
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    "noreply@mercai.ru";

  await getTransporter().sendMail({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });
}

export async function sendVerificationEmailMail(
  to: string,
  name: string | null | undefined,
  verifyUrl: string
) {
  const displayName = name?.trim() || "пользователь";
  const subject = "Подтвердите email — Mercai";
  const text = `Здравствуйте, ${displayName}!\n\nПодтвердите email для Mercai:\n${verifyUrl}\n\nСсылка действует 24 часа.`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 16px">Mercai</h2>
      <p>Здравствуйте, ${displayName}!</p>
      <p>Нажмите кнопку, чтобы подтвердить email и завершить регистрацию:</p>
      <p style="margin:24px 0">
        <a href="${verifyUrl}" style="background:#6366f1;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">
          Подтвердить email
        </a>
      </p>
      <p style="color:#666;font-size:14px">Или скопируйте ссылку:<br><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p style="color:#999;font-size:12px">Ссылка действует 24 часа. Если вы не регистрировались — проигнорируйте письмо.</p>
    </div>
  `;

  await sendEmail({ to, subject, html, text });
}
