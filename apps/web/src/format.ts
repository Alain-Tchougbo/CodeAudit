export const number = (value: number) => new Intl.NumberFormat('fr-FR').format(value);
export const date = (value: string) => new Date(value).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
export function duration(milliseconds: number): string {
  if (milliseconds < 1000) return `${Math.round(Math.max(0, milliseconds))} ms`;
  if (milliseconds < 60000) return `${(milliseconds / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`;
  return `${Math.floor(milliseconds / 60000)} min ${Math.floor((milliseconds % 60000) / 1000)} s`;
}
