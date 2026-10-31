import { hashPassword, verifyPassword } from '../src/auth/password';
describe('Mots de passe scrypt', () => {
  it('utilise des sels distincts et verifie les mots de passe sans les stocker en clair', async () => {
    const first = await hashPassword('A secure test passphrase'); const second = await hashPassword('A secure test passphrase');
    expect(first).not.toBe(second); expect(first).not.toContain('A secure test passphrase');
    expect(await verifyPassword('A secure test passphrase', first)).toBe(true); expect(await verifyPassword('wrong passphrase', first)).toBe(false);
  });
  it('refuse des parametres ou un hash corrompus', async () => {
    expect(await verifyPassword('A secure test passphrase', 'scrypt$9999999999$8$1$bad$bad')).toBe(false);
  });
  it('borne les calculs concurrents au lieu d’epuiser la memoire', async () => {
    const results = await Promise.allSettled([hashPassword('Concurrent password one'), hashPassword('Concurrent password two'), hashPassword('Concurrent password three')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { status: 429 } });
  });
});
