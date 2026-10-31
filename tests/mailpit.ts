import { setTimeout as delay } from 'node:timers/promises';

function base() {
  const url = new URL(process.env.TEST_MAILPIT_API_URL ?? 'http://127.0.0.1:8026');
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.protocol !== 'http:') throw new Error('Mailpit tests require a local isolated inbox');
  return url.origin;
}
export async function testMessages(email: string): Promise<{ ID: string }[]> {
  if (!email.endsWith('@example.test')) throw new Error('Synthetic test recipient required');
  const response = await fetch(`${base()}/api/v1/search?${new URLSearchParams({ query: `to:${email}` })}`);
  if (!response.ok) throw new Error('Mailpit search unavailable');
  return ((await response.json()) as { messages: { ID: string }[] }).messages;
}
export async function resetLink(email: string): Promise<string> {
  const deadline = Date.now() + 8000;
  do {
    const messages = await testMessages(email);
    if (messages[0]) {
      const response = await fetch(`${base()}/api/v1/message/${encodeURIComponent(messages[0].ID)}`);
      const message = await response.json() as { Text: string };
      const match = message.Text.match(/https?:\/\/[^\s]+\/reset-password#token=[a-f0-9]{64}/);
      if (!match) throw new Error('Reset link missing from test message');
      return match[0];
    }
    await delay(100);
  } while (Date.now() < deadline);
  throw new Error('No recovery message received in isolated Mailpit');
}
