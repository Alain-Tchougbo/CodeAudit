import { randomBytes } from 'node:crypto';
import { base32, matchTotp, SecurityCrypto, totp } from '../src/auth/security-crypto';
const previous = process.env.SECURITY_ENCRYPTION_KEY;
afterEach(() => { if (previous === undefined) delete process.env.SECURITY_ENCRYPTION_KEY; else process.env.SECURITY_ENCRYPTION_KEY = previous; });
describe('TOTP RFC 6238 et chiffrement des secrets', () => {
  const secret = base32(Buffer.from('12345678901234567890'));
  it.each([[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']] as const)('respecte le vecteur SHA-1 à %d secondes', (seconds, expected) => { expect(totp(secret, Math.floor(seconds / 30), 8)).toBe(expected); });
  it('accepte seulement les codes à six chiffres dans la fenêtre autorisée', () => { const step = 10000; expect(matchTotp(secret, totp(secret, step), step * 30000)).toBe(step); expect(matchTotp(secret, totp(secret, step + 1), step * 30000)).toBe(step + 1); expect(matchTotp(secret, totp(secret, step - 2), step * 30000)).toBeNull(); expect(matchTotp(secret, 'invalid', step * 30000)).toBeNull(); });
  it('chiffre avec un IV distinct et lie le secret à son usage et utilisateur', () => { process.env.SECURITY_ENCRYPTION_KEY = randomBytes(32).toString('base64'); const crypto = new SecurityCrypto(); const value = crypto.seal('secret', 'mfa:user-a'); expect(value).not.toContain('secret'); expect(crypto.seal('secret', 'mfa:user-a')).not.toBe(value); expect(crypto.open(value, 'mfa:user-a')).toBe('secret'); expect(() => crypto.open(value, 'mfa:user-b')).toThrow(); expect(() => crypto.open(value.slice(0, -4) + 'AAAA', 'mfa:user-a')).toThrow(); });
  it('refuse une configuration absente ou invalide', () => { const crypto = new SecurityCrypto(); for (const value of ['', '1234', randomBytes(16).toString('base64')]) { process.env.SECURITY_ENCRYPTION_KEY = value; expect(crypto.available()).toBe(false); expect(() => crypto.seal('secret', 'mfa:user')).toThrow(); } });
});
