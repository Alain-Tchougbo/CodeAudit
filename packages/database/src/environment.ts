import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

export function databaseUrl(): string {
  // src/ et dist/ sont au meme niveau ; les variables du terminal restent prioritaires.
  const envFile = resolve(__dirname, '../../../.env');
  if (existsSync(envFile)) loadEnvFile(envFile);
  return process.env.DATABASE_URL
    ?? 'postgresql://codeaudit:codeaudit@127.0.0.1:5432/codeaudit?schema=public';
}
