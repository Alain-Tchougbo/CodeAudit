import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes: Buffer): string {
  let value = 0; let bits = 0; let result = '';
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { bits -= 5; result += alphabet[(value >>> bits) & 31]; } }
  if (bits) result += alphabet[(value << (5 - bits)) & 31]; return result;
}
function unbase32(secret: string): Buffer {
  let value = 0; let bits = 0; const bytes: number[] = [];
  for (const character of secret) { const digit = alphabet.indexOf(character); if (digit < 0) throw new Error('Invalid TOTP secret'); value = (value << 5) | digit; bits += 5; if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); } }
  return Buffer.from(bytes);
}
/** RFC 6238, SHA-1, thirty-second steps; digits=8 is used for official vectors. */
export function totp(secret: string, step: number, digits = 6): string {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step)); const hash = createHmac('sha1', unbase32(secret)).update(counter).digest(); const offset = hash[hash.length - 1]! & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).toString().padStart(digits, '0');
}
export function matchTotp(secret: string, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null; const step = Math.floor(now / 30000);
  for (const offset of [0, -1, 1]) if (step + offset >= 0 && timingSafeEqual(Buffer.from(code), Buffer.from(totp(secret, step + offset)))) return step + offset;
  return null;
}
@Injectable()
export class SecurityCrypto {
  available(): boolean { const value = process.env.SECURITY_ENCRYPTION_KEY; return !!value && /^[A-Za-z0-9+/]{43}=$/.test(value) && Buffer.from(value, 'base64').length === 32; }
  private key(): Buffer { if (!this.available()) throw new ServiceUnavailableException({ code: 'SECURITY_KEY_REQUIRED', message: 'La clé de chiffrement serveur doit être configurée pour la 2FA et OAuth.' }); return Buffer.from(process.env.SECURITY_ENCRYPTION_KEY!, 'base64'); }
  seal(value: string, purpose: string): string { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key(), iv); cipher.setAAD(Buffer.from(purpose)); const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), bytes.toString('base64')].join(':'); }
  open(value: string, purpose: string): string { const [version, iv, tag, ciphertext] = value.split(':'); if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Invalid encrypted credential'); const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'base64')); decipher.setAAD(Buffer.from(purpose)); decipher.setAuthTag(Buffer.from(tag, 'base64')); return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8'); }
}
