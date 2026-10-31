import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  assertConfigured() {
    if (!process.env.SMTP_HOST) throw new ServiceUnavailableException({ code: 'MAIL_NOT_CONFIGURED', message: 'La récupération par e-mail n’est pas configurée. Contactez l’administrateur.' });
  }
  async reset(email: string, token: string) {
    this.assertConfigured();
    const port = Number(process.env.SMTP_PORT ?? 587); const host = process.env.SMTP_HOST!;
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SMTP port');
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const local = ['localhost', '127.0.0.1', '::1'].includes(host);
    const transport = nodemailer.createTransport({ host, port, secure,
      requireTLS: !secure && (process.env.NODE_ENV === 'production' || !local),
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? '' } : undefined,
      connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
      disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    });
    const url = new URL('/reset-password', process.env.AUTH_APP_ORIGIN ?? 'http://127.0.0.1:5173'); url.hash = new URLSearchParams({ token }).toString();
    try { await transport.sendMail({ from: process.env.MAIL_FROM ?? 'CodeAudit <no-reply@codeaudit.local>', to: email, subject: 'Réinitialisation de votre mot de passe CodeAudit',
      text: `Une demande de changement de mot de passe a été reçue pour votre compte CodeAudit.\n\n${url.toString()}\n\nCe lien est valable 15 minutes et utilisable une seule fois. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.`,
    }); } finally { transport.close(); }
  }
}
