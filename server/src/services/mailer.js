import nodemailer from 'nodemailer';

let transportOverride;
export const setTransportOverride = (factory) => { transportOverride = factory; };

export const createTransport = () => transportOverride ? transportOverride() : nodemailer.createTransport(process.env.NODE_ENV === 'test' ? { streamTransport: true, buffer: true, newline: 'unix' } : {
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined
});

export const sendPasswordResetEmail = async (email, token) => {
  const url = `${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}?resetToken=${encodeURIComponent(token)}`;
  await createTransport().sendMail({ from: process.env.SMTP_FROM, to: email, subject: 'BREECE CRM password reset', text: `Reset your password within 20 minutes: ${url}` });
};

const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

export const sendReminderEmail = async ({ email, contactName, followUpAt, note }) => {
  const date = new Date(followUpAt).toISOString();
  const crmUrl = process.env.APP_BASE_URL;
  const text = `BREECE CRM reminder\n\nFollow up with: ${contactName}\nScheduled for (UTC): ${date}${note ? `\nNote: ${note}` : ''}${crmUrl ? `\nOpen CRM: ${crmUrl}` : ''}`;
  const html = `<p><strong>BREECE CRM reminder</strong></p><p>Follow up with: ${escapeHtml(contactName)}<br>Scheduled for (UTC): ${escapeHtml(date)}</p>${note ? `<p>Note: ${escapeHtml(note)}</p>` : ''}${crmUrl ? `<p><a href="${escapeHtml(crmUrl)}">Open CRM</a></p>` : ''}`;
  await createTransport().sendMail({ from: process.env.SMTP_FROM, to: email, subject: `BREECE CRM follow-up reminder: ${contactName}`, text, html });
};
