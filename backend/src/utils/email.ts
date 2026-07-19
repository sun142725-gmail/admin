import * as nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.163.com',
  port: Number(process.env.SMTP_PORT || 465),
  secure: String(process.env.SMTP_SECURE ?? 'true') === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || '';
  if (!from) {
    throw new Error('SMTP_FROM 未配置');
  }
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP_USER 或 SMTP_PASS 未配置');
  }
  return transporter.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text
  });
}
