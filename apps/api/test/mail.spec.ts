import nodemailer from 'nodemailer';
import { MailService } from '../src/auth/mail.service';
const original = { host: process.env.SMTP_HOST, port: process.env.SMTP_PORT, env: process.env.NODE_ENV };
afterEach(() => { jest.restoreAllMocks(); if (original.host === undefined) delete process.env.SMTP_HOST; else process.env.SMTP_HOST = original.host; if (original.port === undefined) delete process.env.SMTP_PORT; else process.env.SMTP_PORT = original.port; process.env.NODE_ENV = original.env; });
describe('Transport de récupération', () => {
  it('refuse une configuration absente', () => { delete process.env.SMTP_HOST; expect(() => new MailService().assertConfigured()).toThrow('récupération'); });
  it.each(['production', 'development'])('impose TLS vers un serveur distant en %s et ne charge aucune ressource externe', async (env) => {
    process.env.NODE_ENV = env; process.env.SMTP_HOST = 'smtp.example.test'; process.env.SMTP_PORT = '587';
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'fixture' }); const close = jest.fn();
    jest.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail, close } as unknown as ReturnType<typeof nodemailer.createTransport>);
    await new MailService().reset('fixture@example.test', 'a'.repeat(64));
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ requireTLS: true, disableFileAccess: true, disableUrlAccess: true, debug: false, tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' } }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('/reset-password#token=') })); expect(close).toHaveBeenCalled();
  });
});
