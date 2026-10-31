import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, UnauthorizedException, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@codeaudit/database';
import type { ActiveSession, AuthProfile } from '@codeaudit/contracts';
import { PrismaService } from '../database/prisma.service';
import type { AuthRequest, CookieResponse } from './auth.types';
import type { LoginDto, RegisterDto } from './auth.dto';
import { hashPassword, verifyPassword } from './password';
export const SESSION_MS = 8 * 60 * 60 * 1000;
export const IDLE_MS = 30 * 60 * 1000;
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const throttleKey = (operation: string, kind: string, value: string) => digest(`${operation}:${kind}:${value}`);
const userSelect = { id: true, name: true, email: true, createdAt: true } as const;
export function cookieName() { return process.env.NODE_ENV === 'production' ? '__Host-codeaudit.sid' : 'codeaudit.sid'; }
export function sessionToken(request: AuthRequest): string | null {
  const header = request.headers.cookie;
  if (typeof header !== 'string') return null;
  const values = header.split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${cookieName()}=`));
  if (values.length !== 1) return null;
  const value = values[0]!.slice(cookieName().length + 1);
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}
const csrf = (token: string) => createHmac('sha256', token).update('codeaudit-csrf-v1').digest('hex');
@Injectable()
export class AuthService implements OnModuleInit {
  constructor(private readonly database: PrismaService) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'production' && (!process.env.AUTH_APP_ORIGIN || new URL(process.env.AUTH_APP_ORIGIN).protocol !== 'https:')) throw new Error('AUTH_APP_ORIGIN HTTPS obligatoire en production.');
  }
  setCookie(response: CookieResponse, token: string, maxAge = SESSION_MS) {
    response.cookie(cookieName(), token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge });
    response.setHeader('Cache-Control', 'no-store');
  }
  clearCookie(response: CookieResponse) { this.setCookie(response, '', 0); }
  checkOrigin(request: AuthRequest) {
    const origins = process.env.AUTH_APP_ORIGIN ? [new URL(process.env.AUTH_APP_ORIGIN).origin] : ['http://127.0.0.1:5173', 'http://localhost:5173'];
    const origin = request.headers.origin;
    if (origin !== undefined && (typeof origin !== 'string' || !origins.includes(origin))) throw new ForbiddenException({ code: 'ORIGIN_REJECTED', message: 'Origine de requête refusée.' });
    if (origin === undefined && request.headers.referer) {
      try { if (!origins.includes(new URL(String(request.headers.referer)).origin)) throw new Error('origin'); }
      catch { throw new ForbiddenException({ code: 'ORIGIN_REJECTED', message: 'Origine de requête refusée.' }); }
    }
    if (request.headers['x-codeaudit-request'] !== '1') throw new ForbiddenException({ code: 'CSRF_REQUIRED', message: 'En-tête de protection requis.' });
  }
  checkCsrf(request: AuthRequest, token: string) {
    this.checkOrigin(request);
    const actual = request.headers['x-csrf-token']; const expected = csrf(token);
    if (typeof actual !== 'string' || !/^[a-f0-9]{64}$/.test(actual) || !timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))) throw new ForbiddenException({ code: 'CSRF_INVALID', message: 'Protection de session invalide. Rechargez la page.' });
  }
  async limit(request: AuthRequest, operation: 'login' | 'register' | 'reset' | 'invite', email: string) {
    const ip = (request.socket.remoteAddress ?? 'unknown').replace(/^::ffff:/, '').replace(/^::1$/, '127.0.0.1');
    for (const [kind, value, limit] of [['ip', ip, operation === 'login' ? 30 : 10], ['email', email, operation === 'reset' || operation === 'invite' ? 3 : 10]] as const) {
      const key = throttleKey(operation, kind, value);
      const accepted = await this.database.client.$executeRaw(Prisma.sql`
        INSERT INTO "AuthThrottle" ("keyHash", count, "windowStart") VALUES (${key}, 1, clock_timestamp())
        ON CONFLICT ("keyHash") DO UPDATE SET
          count = CASE WHEN "AuthThrottle"."windowStart" <= clock_timestamp() - interval '15 minutes' THEN 1 ELSE "AuthThrottle".count + 1 END,
          "windowStart" = CASE WHEN "AuthThrottle"."windowStart" <= clock_timestamp() - interval '15 minutes' THEN clock_timestamp() ELSE "AuthThrottle"."windowStart" END
        WHERE "AuthThrottle"."windowStart" <= clock_timestamp() - interval '15 minutes' OR "AuthThrottle".count < ${limit}::integer
      `);
      if (!accepted) throw new HttpException({ code: 'AUTH_RATE_LIMIT', message: 'Trop de tentatives. Réessayez dans 15 minutes.' }, 429);
    }
  }
  async issue(userId: string, request: AuthRequest, response: CookieResponse): Promise<AuthProfile> {
    const token = randomBytes(32).toString('hex'); const now = new Date();
    const previous = sessionToken(request);
    const session = await this.database.client.$transaction(async (transaction) => {
      await transaction.session.deleteMany({ where: { OR: [{ expiresAt: { lte: now } }, { lastSeenAt: { lte: new Date(now.getTime() - IDLE_MS) } }, ...(previous ? [{ tokenHash: digest(previous) }] : [])] } });
      await transaction.authThrottle.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } });
      return transaction.session.create({ data: { tokenHash: digest(token), userId, expiresAt: new Date(now.getTime() + SESSION_MS), lastSeenAt: now }, include: { user: { select: userSelect } } });
    });
    this.setCookie(response, token);
    return { user: { ...session.user, createdAt: session.user.createdAt.toISOString() }, csrfToken: csrf(token), expiresAt: session.expiresAt.toISOString() };
  }
  async register(input: RegisterDto, request: AuthRequest, response: CookieResponse) {
    this.checkOrigin(request); await this.limit(request, 'register', input.email);
    const passwordHash = await hashPassword(input.password);
    try { const user = await this.database.client.user.create({ data: { name: input.name, email: input.email, passwordHash } }); return await this.issue(user.id, request, response); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'EMAIL_ALREADY_USED', message: 'Cette adresse e-mail est déjà utilisée.' });
      throw error;
    }
  }
  async login(input: LoginDto, request: AuthRequest, response: CookieResponse) {
    this.checkOrigin(request); await this.limit(request, 'login', input.email);
    const user = await this.database.client.user.findUnique({ where: { email: input.email } });
    const valid = await verifyPassword(input.password, user?.passwordHash);
    if (!user || !valid) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Adresse e-mail ou mot de passe incorrect.' });
    return this.issue(user.id, request, response);
  }
  async authenticate(request: AuthRequest, response: CookieResponse): Promise<AuthProfile> {
    const token = sessionToken(request);
    const now = new Date();
    const session = token ? await this.database.client.session.findUnique({ where: { tokenHash: digest(token) }, include: { user: { select: userSelect } } }) : null;
    if (!session || session.expiresAt <= now || session.lastSeenAt.getTime() <= now.getTime() - IDLE_MS) {
      if (token) await this.database.client.session.deleteMany({ where: { tokenHash: digest(token) } });
      this.clearCookie(response);
      throw new UnauthorizedException({ code: token ? 'SESSION_EXPIRED' : 'AUTH_REQUIRED', message: token ? 'Votre session a expiré. Reconnectez-vous.' : 'Connectez-vous pour accéder à cette ressource.' });
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) this.checkCsrf(request, token!);
    const touched = await this.database.client.session.updateMany({ where: { tokenHash: session.tokenHash, expiresAt: { gt: now }, lastSeenAt: { gt: new Date(now.getTime() - IDLE_MS) } }, data: { lastSeenAt: now } });
    if (!touched.count) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Votre session a expiré. Reconnectez-vous.' });
    response.setHeader('Cache-Control', 'no-store');
    return { user: { ...session.user, createdAt: session.user.createdAt.toISOString() }, csrfToken: csrf(token!), expiresAt: session.expiresAt.toISOString() };
  }
  async logout(request: AuthRequest, response: CookieResponse) {
    this.checkOrigin(request); const token = sessionToken(request);
    if (token) {
      const session = await this.database.client.session.findUnique({ where: { tokenHash: digest(token) } });
      if (session && session.expiresAt > new Date() && session.lastSeenAt.getTime() > Date.now() - IDLE_MS) this.checkCsrf(request, token);
      await this.database.client.session.deleteMany({ where: { tokenHash: digest(token) } });
    }
    this.clearCookie(response);
  }
  async sessions(userId: string, request: AuthRequest): Promise<ActiveSession[]> {
    const token = sessionToken(request); const now = new Date();
    const rows = await this.database.client.session.findMany({ where: { userId, expiresAt: { gt: now }, lastSeenAt: { gt: new Date(now.getTime() - IDLE_MS) } }, orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }], take: 100 });
    return rows.map(row => ({ id: row.id, current: !!token && row.tokenHash === digest(token), createdAt: row.createdAt.toISOString(), lastSeenAt: row.lastSeenAt.toISOString(), expiresAt: row.expiresAt.toISOString() }));
  }
  async revoke(userId: string, id: string, request: AuthRequest, response: CookieResponse) {
    const row = await this.database.client.session.findFirst({ where: { id, userId }, select: { tokenHash: true } });
    if (!row) throw new NotFoundException({ code: 'SESSION_NOT_FOUND', message: 'Session introuvable.' });
    await this.database.client.session.deleteMany({ where: { id, userId } });
    const token = sessionToken(request); if (token && row.tokenHash === digest(token)) this.clearCookie(response);
  }
  async logoutAll(userId: string, response: CookieResponse) { await this.database.client.session.deleteMany({ where: { userId } }); this.clearCookie(response); }
}
