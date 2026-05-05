import nodemailer from "nodemailer";

const TOKEN = {
  primary: "#2563EB",
  primaryDark: "#1E40AF",
  primaryLight: "#EFF6FF",
  accent: "#93C5FD",
  foreground: "#141421",
  mutedFg: "#7a7a9a",
  background: "#f6f6fb",
  card: "#ffffff",
  border: "#e2e2f0",
  destructive: "#dc4e27",
} as const;

const LOGO_SVG = `
<svg width="132" height="34" viewBox="0 0 220 56" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="iconBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2563EB"/>
      <stop offset="100%" stop-color="#1E40AF"/>
    </linearGradient>
  </defs>
  <rect x="0" y="4" width="48" height="48" rx="12" fill="url(#iconBg)"/>
  <path d="M10.5 17 L24 44.5 L37.5 17" stroke="white" stroke-width="5.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="37.5" cy="17" r="6.5" fill="#93C5FD"/>
  <circle cx="37.5" cy="17" r="3" fill="white"/>
  <text x="62" y="39" font-family="'Inter','DM Sans','Helvetica Neue',Arial,sans-serif" font-size="32" font-weight="700" fill="#1E40AF" letter-spacing="-1">Vire</text>
</svg>`;

const divider = `
  <tr>
    <td style="padding:4px 0 20px;">
      <div style="height:1px;background:${TOKEN.border};"></div>
    </td>
  </tr>`;

function primaryButton(href: string, label: string): string {
  return `
    <tr>
      <td style="padding:8px 0 24px;">
        <table cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="background:${TOKEN.primary};border-radius:10px;">
              <a href="${href}" style="display:inline-block;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 28px;letter-spacing:-0.2px;">
                ${label}
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function emailShell(content: string): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Vire</title>
</head>
<body style="margin:0;padding:0;background-color:${TOKEN.background};font-family:'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:${TOKEN.background};padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;">

          <tr>
            <td align="center" style="padding-bottom:24px;">
              ${LOGO_SVG}
            </td>
          </tr>

          <tr>
            <td style="background:${TOKEN.card};border-radius:16px;border:1px solid ${TOKEN.border};overflow:hidden;box-shadow:0 4px 24px rgba(37,99,235,0.07);">
              <div style="height:4px;background:linear-gradient(90deg,${TOKEN.primaryDark},${TOKEN.primary},${TOKEN.accent});"></div>
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:36px 40px;">
                ${content}
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding-top:28px;">
              <p style="margin:0;font-size:12px;color:${TOKEN.mutedFg};line-height:1.6;">
                Bạn nhận được email này vì đã đăng ký tài khoản Vire.<br />
                Nếu không phải bạn, hãy bỏ qua email này.
              </p>
              <p style="margin:12px 0 0;font-size:12px;color:${TOKEN.border};">
                © ${new Date().getFullYear()} Vire. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT ?? 2525),
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

export const sendVerifyEmail = async (
  to: string,
  token: string,
): Promise<void> => {
  const url = `${process.env.CLIENT_URL}/verify-email?token=${token}`;

  const content = `
    <tr>
      <td style="padding-bottom:20px;">
        <div style="width:48px;height:48px;border-radius:12px;background:${TOKEN.primaryLight};display:inline-flex;align-items:center;justify-content:center;">
          <span style="font-size:24px;">✉️</span>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:8px;">
        <h1 style="margin:0;font-size:22px;font-weight:700;color:${TOKEN.foreground};letter-spacing:-0.5px;">
          Xác thực email của bạn
        </h1>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:28px;">
        <p style="margin:0;font-size:15px;color:${TOKEN.mutedFg};line-height:1.6;">
          Chào mừng bạn đến với Vire! Nhấn nút bên dưới để xác thực địa chỉ email và kích hoạt tài khoản của bạn.
        </p>
      </td>
    </tr>
    ${primaryButton(url, "Xác thực tài khoản →")}
    ${divider}
    <tr>
      <td>
        <p style="margin:0;font-size:12px;color:${TOKEN.mutedFg};line-height:1.6;">
          Nút không hoạt động? Copy và dán đường link sau vào trình duyệt:
        </p>
        <p style="margin:6px 0 0;font-size:12px;word-break:break-all;">
          <a href="${url}" style="color:${TOKEN.primary};text-decoration:none;">${url}</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding-top:16px;">
        <table cellpadding="0" cellspacing="0" role="presentation" style="background:${TOKEN.primaryLight};border-radius:8px;padding:12px 16px;width:100%;">
          <tr>
            <td>
              <p style="margin:0;font-size:13px;color:${TOKEN.primary};font-weight:500;">
                ⏱ Link xác thực hết hạn sau <strong>24 giờ</strong>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  await transporter.sendMail({
    from: `"Vire" <${process.env.MAIL_FROM}>`,
    to,
    subject: "Xác thực tài khoản Vire",
    html: emailShell(content),
  });
};

export const sendOtpEmail = async (to: string, code: string): Promise<void> => {
  const digits = code
    .split("")
    .map(
      (d) => `
      <td style="padding:0 4px;">
        <div style="width:44px;height:52px;background:${TOKEN.primaryLight};border:2px solid ${TOKEN.primary};border-radius:10px;text-align:center;line-height:52px;font-size:26px;font-weight:700;color:${TOKEN.primary};font-family:monospace;">
          ${d}
        </div>
      </td>`,
    )
    .join("");

  const content = `
    <tr>
      <td style="padding-bottom:20px;">
        <div style="width:48px;height:48px;border-radius:12px;background:${TOKEN.primaryLight};display:inline-flex;align-items:center;justify-content:center;">
          <span style="font-size:24px;">🔐</span>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:8px;">
        <h1 style="margin:0;font-size:22px;font-weight:700;color:${TOKEN.foreground};letter-spacing:-0.5px;">
          Mã xác nhận của bạn
        </h1>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:28px;">
        <p style="margin:0;font-size:15px;color:${TOKEN.mutedFg};line-height:1.6;">
          Dùng mã OTP bên dưới để đặt lại mật khẩu. Mã chỉ có hiệu lực trong <strong>15 phút</strong>.
        </p>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding-bottom:28px;">
        <table cellpadding="0" cellspacing="0" role="presentation">
          <tr>${digits}</tr>
        </table>
      </td>
    </tr>
    ${divider}
    <tr>
      <td>
        <table cellpadding="0" cellspacing="0" role="presentation" style="background:#fef3f0;border-left:3px solid ${TOKEN.destructive};border-radius:0 8px 8px 0;padding:12px 16px;width:100%;">
          <tr>
            <td>
              <p style="margin:0;font-size:13px;color:${TOKEN.destructive};font-weight:500;">
                ⚠️ Không chia sẻ mã này với bất kỳ ai — kể cả đội ngũ Vire.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  await transporter.sendMail({
    from: `"Vire" <${process.env.MAIL_FROM}>`,
    to,
    subject: "Mã OTP đặt lại mật khẩu — Vire",
    html: emailShell(content),
  });
};
