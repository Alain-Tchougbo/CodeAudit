import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const path = resolve(import.meta.dirname, '../.env');
if (!existsSync(path) || lstatSync(path).isSymbolicLink()) throw new Error('Créez d’abord un fichier .env local normal depuis .env.example.');
const text = readFileSync(path, 'utf8');
if (process.env.SECURITY_ENCRYPTION_KEY || /^\s*(?:export\s+)?SECURITY_ENCRYPTION_KEY\s*=/m.test(text)) {
  console.log('Une clé est déjà fournie. Elle est conservée ; aucune rotation automatique.');
} else {
  appendFileSync(path, `\nSECURITY_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}\n`, { mode: 0o600 });
  console.log('Clé de chiffrement créée dans .env. Conservez-la et sauvegardez-la hors de Git ; sa valeur n’est pas affichée.');
}
