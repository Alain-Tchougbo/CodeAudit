import { randomBytes, createHash } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@codeaudit/database';
import type { OAuthProvider } from '@codeaudit/contracts';
import { PrismaService } from '../database/prisma.service';
import { AuthService, digest, sessionToken } from './auth.service';
import { MfaService } from './mfa.service';
import { SecurityCrypto } from './security-crypto';
import { SecurityAuditService } from './security-audit.service';
import { oauthConfigured } from './account-security.service';
import type { AuthRequest, CookieResponse } from './auth.types';
const providerData = {
  GITHUB: { authorize: 'https://github.com/login/oauth/authorize', token: 'https://github.com/login/oauth/access_token', user: 'https://api.github.com/user', scope: 'read:user' },
  GITLAB: { authorize: 'https://gitlab.com/oauth/authorize', token: 'https://gitlab.com/oauth/token', user: 'https://gitlab.com/api/v4/user', scope: 'read_user' },
} as const;
const invalid = () => new BadRequestException({ code: 'OAUTH_FLOW_INVALID', message: 'Connexion externe invalide, expirée ou déjà utilisée. Recommencez.' });
export const oauthCookieName = () => process.env.NODE_ENV === 'production' ? '__Host-codeaudit.oauth' : 'codeaudit.oauth';
function browserToken(request: AuthRequest) { const tokens = String(request.headers.cookie ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${oauthCookieName()}=`)); const token = tokens[0]?.slice(oauthCookieName().length + 1); return tokens.length === 1 && token && /^[a-f0-9]{64}$/.test(token) ? token : null; }
@Injectable()
export class OAuthService {
  constructor(private readonly database: PrismaService, private readonly auth: AuthService, private readonly mfa: MfaService, private readonly crypto: SecurityCrypto, private readonly audit: SecurityAuditService) {}
  provider(value: string): OAuthProvider { if (value !== 'GITHUB' && value !== 'GITLAB') throw new BadRequestException('Fournisseur inconnu.'); return value; }
  private origin() {
    const url = new URL(process.env.AUTH_APP_ORIGIN ?? 'http://127.0.0.1:5173');
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || !['http:', 'https:'].includes(url.protocol) || (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname))) throw new ServiceUnavailableException('Origine OAuth serveur invalide.'); return url.origin;
  }
  private callbackUri(provider: OAuthProvider) { return `${this.origin()}/api/auth/oauth/${provider}/callback`; }
  private cookie(response: CookieResponse, value: string, maxAge = 5 * 60000) { response.cookie(oauthCookieName(), value, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge }); }
  async start(provider: OAuthProvider, request: AuthRequest, response: CookieResponse, link?: { userId: string; authVersion: number }) {
    if (!oauthConfigured(provider)) throw new ServiceUnavailableException({ code: 'OAUTH_NOT_CONFIGURED', message: 'Ce fournisseur OAuth n’est pas configuré sur le serveur.' });
    if (!link && sessionToken(request)) throw new ConflictException('Déconnectez-vous avant une connexion externe. Pour associer un compte, utilisez votre profil.');
    await this.auth.limit(request, 'oauth', link?.userId);
    const state = randomBytes(32).toString('hex'); const browser = randomBytes(32).toString('hex'); const verifier = randomBytes(32).toString('base64url');
    const prior = browserToken(request);
    await this.database.client.$transaction(async transaction => {
      if (link && !await transaction.user.findUnique({ where: { id: link.userId, authVersion: link.authVersion, emailVerifiedAt: { not: null } }, select: { id: true } })) throw new ForbiddenException({ code: 'EMAIL_VERIFICATION_REQUIRED', message: 'Vérifiez votre adresse e-mail avant d’associer un compte externe.' });
      await transaction.oAuthFlow.deleteMany({ where: { OR: [{ expiresAt: { lte: new Date() } }, ...(prior ? [{ browserHash: digest(prior) }] : [])] } });
      await transaction.oAuthFlow.create({ data: { tokenHash: digest(state), browserHash: digest(browser), provider, purpose: link ? 'LINK' : 'LOGIN', verifierEncrypted: this.crypto.seal(verifier, `oauth:${state}`), userId: link?.userId, authVersion: link?.authVersion, sessionHash: link && sessionToken(request) ? digest(sessionToken(request)!) : null, expiresAt: new Date(Date.now() + 5 * 60000) } });
    });
    this.cookie(response, browser); const url = new URL(providerData[provider].authorize);
    url.search = new URLSearchParams({ client_id: process.env[`${provider}_CLIENT_ID`]!, redirect_uri: this.callbackUri(provider), response_type: 'code', scope: providerData[provider].scope, state, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') }).toString();
    return { url: url.toString() };
  }
  private async json(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, { ...init, redirect: 'error', signal: controller.signal }); if (!response.ok || !response.body) throw new Error('OAuth provider rejected request');
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
      try { for (;;) { const value = await reader.read(); if (value.done) break; bytes += value.value.byteLength; if (bytes > 512 * 1024) { await reader.cancel(); throw new Error('Provider response too large'); } chunks.push(value.value); } } finally { reader.releaseLock(); }
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid provider JSON'); return body as Record<string, unknown>;
    } catch { throw new ServiceUnavailableException({ code: 'OAUTH_PROVIDER_FAILED', message: 'Le fournisseur externe n’a pas pu être contacté. Recommencez.' }); } finally { clearTimeout(timer); }
  }
  async identity(provider: OAuthProvider, code: string, verifier: string) {
    const data = providerData[provider];
    const token = await this.json(data.token, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: process.env[`${provider}_CLIENT_ID`]!, client_secret: process.env[`${provider}_CLIENT_SECRET`]!, redirect_uri: this.callbackUri(provider), code, code_verifier: verifier }).toString() });
    if (typeof token.access_token !== 'string' || token.access_token.length > 4096 || token.token_type?.toString().toLowerCase() !== 'bearer') throw invalid();
    const user = await this.json(data.user, { headers: { Accept: 'application/json', Authorization: `Bearer ${token.access_token}`, 'User-Agent': 'CodeAudit' } });
    if (!Number.isSafeInteger(user.id) || Number(user.id) <= 0) throw invalid(); const login = provider === 'GITHUB' ? user.login : user.username;
    if (typeof login !== 'string' || login.length < 1 || login.length > 255) throw invalid(); return { subject: String(user.id), login };
  }
  async callback(provider: OAuthProvider, state: string, code: string | undefined, denied: boolean, request: AuthRequest, response: CookieResponse) {
    const browser = browserToken(request); if (!browser) throw invalid();
    const flow = await this.database.client.oAuthFlow.findUnique({ where: { tokenHash: digest(state) } });
    if (!flow || flow.provider !== provider || flow.browserHash !== digest(browser) || flow.expiresAt <= new Date() || flow.purpose === 'MFA') throw invalid();
    const consumed = await this.database.client.oAuthFlow.deleteMany({ where: { tokenHash: flow.tokenHash, browserHash: digest(browser), expiresAt: { gt: new Date() } } }); if (!consumed.count) throw invalid();
    this.cookie(response, '', 0); if (denied || !code) throw new BadRequestException({ code: 'OAUTH_DENIED', message: 'La connexion externe a été annulée.' });
    if (flow.purpose === 'LOGIN' && sessionToken(request)) throw new ConflictException('Une session a été ouverte pendant cette connexion externe. Déconnectez-vous pour changer de compte.');
    if (!oauthConfigured(provider) || !flow.verifierEncrypted) throw invalid();
    const identity = await this.identity(provider, code, this.crypto.open(flow.verifierEncrypted, `oauth:${state}`));
    if (flow.purpose === 'LINK') {
      if (!flow.userId || flow.authVersion === null || !flow.sessionHash || !sessionToken(request) || digest(sessionToken(request)!) !== flow.sessionHash) throw invalid();
      await this.auth.authenticate(request, response);
      try { await this.database.client.$transaction(async transaction => {
        await transaction.user.findUniqueOrThrow({ where: { id: flow.userId!, authVersion: flow.authVersion! } });
        await transaction.oAuthIdentity.create({ data: { userId: flow.userId!, provider, ...identity } }); await this.audit.record(flow.userId!, 'OAUTH_LINKED', { provider }, transaction);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) throw new ConflictException('Ce compte externe est déjà associé, ou une modification simultanée a eu lieu.'); throw error; }
      return `${this.origin()}/profile?oauth=linked`;
    }
    const linked = await this.database.client.oAuthIdentity.findUnique({ where: { provider_subject: { provider, subject: identity.subject } }, include: { user: { include: { mfa: { select: { enabledAt: true } } } } } });
    if (!linked) throw new ForbiddenException({ code: 'OAUTH_NOT_LINKED', message: 'Ce compte externe n’est pas associé. Connectez-vous avec votre mot de passe puis associez-le dans votre profil.' });
    if (linked.user.mfa?.enabledAt) {
      const pending = randomBytes(32).toString('hex');
      await this.database.client.oAuthFlow.create({ data: { tokenHash: digest(pending), browserHash: digest(pending), provider, purpose: 'MFA', userId: linked.userId, authVersion: linked.user.authVersion, expiresAt: new Date(Date.now() + 5 * 60000) } }); this.cookie(response, pending);
      return `${this.origin()}/login?oauth=mfa`;
    }
    await this.auth.issue(linked.userId, request, response, linked.user.authVersion, { type: 'OAUTH_LOGIN_SUCCEEDED', provider }); return `${this.origin()}/`;
  }
  async finishMfa(code: string, request: AuthRequest, response: CookieResponse) {
    if (sessionToken(request)) throw new ConflictException('Une session est déjà ouverte. Déconnectez-vous avant de reprendre la connexion externe.');
    this.auth.checkOrigin(request); const pending = browserToken(request); if (!pending) throw invalid(); await this.auth.limit(request, 'oauth', digest(pending));
    const flow = await this.database.client.oAuthFlow.findUnique({ where: { tokenHash: digest(pending) } }); if (!flow || flow.purpose !== 'MFA' || flow.browserHash !== digest(pending) || !flow.userId || flow.authVersion === null || flow.expiresAt <= new Date()) throw invalid();
    await this.mfa.verify(flow.userId, code, true);
    const consumed = await this.database.client.oAuthFlow.deleteMany({ where: { tokenHash: flow.tokenHash, expiresAt: { gt: new Date() } } }); if (!consumed.count) throw invalid(); this.cookie(response, '', 0);
    return this.auth.issue(flow.userId, request, response, flow.authVersion, { type: 'OAUTH_LOGIN_SUCCEEDED', provider: flow.provider });
  }
  async unlink(userId: string, provider: OAuthProvider, authVersion: number) {
    await this.database.client.$transaction(async transaction => {
      await transaction.user.update({ where: { id: userId, authVersion }, data: { authVersion: { increment: 1 } } });
      const removed = await transaction.oAuthIdentity.deleteMany({ where: { userId, provider } }); if (!removed.count) throw new BadRequestException('Aucun compte associé à ce fournisseur.');
      await transaction.oAuthFlow.deleteMany({ where: { userId } }); await transaction.session.deleteMany({ where: { userId } }); await this.audit.record(userId, 'OAUTH_UNLINKED', { provider }, transaction);
    });
  }
}
