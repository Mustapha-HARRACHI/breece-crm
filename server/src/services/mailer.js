import nodemailer from 'nodemailer';

export const createTransport = () => nodemailer.createTransport(process.env.NODE_ENV === 'test' ? { streamTransport: true, buffer: true, newline: 'unix' } : {
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined
});

export const sendPasswordResetEmail = async (email, token) => {
  const url = `${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}?resetToken=${encodeURIComponent(token)}`;
  await createTransport().sendMail({ from: process.env.SMTP_FROM, to: email, subject: 'BREECE CRM password reset', text: `Reset your password within 20 minutes: ${url}` });
};
