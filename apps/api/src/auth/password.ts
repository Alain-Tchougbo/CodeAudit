import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { HttpException } from '@nestjs/common';
const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
let active = 0;
async function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (active >= 2) throw new HttpException({ code: 'AUTH_BUSY', message: 'Authentification occupée. Réessayez dans quelques instants.' }, 429);
  active++;
  try { return await new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 32, options, (error, key) => error ? reject(error) : resolve(key))); }
  finally { active--; }
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16); const key = await derive(password, salt);
  return `scrypt$131072$8$1$${salt.toString('hex')}$${key.toString('hex')}`;
}
const dummy = `scrypt$131072$8$1$${'0'.repeat(32)}$${'0'.repeat(64)}`;
export async function verifyPassword(password: string, encoded: string = dummy): Promise<boolean> {
  const [algorithm, n, r, p, salt, expected] = encoded.split('$');
  if (algorithm !== 'scrypt' || n !== '131072' || r !== '8' || p !== '1' || !/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{64}$/.test(expected ?? '')) return false;
  const key = await derive(password, Buffer.from(salt!, 'hex'));
  return timingSafeEqual(key, Buffer.from(expected!, 'hex'));
}
