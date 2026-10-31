/** Small lexical highlighter; output remains text rendered by Vue, never HTML. */
export function highlight(text: string): { text: string; kind: 'plain' | 'comment' | 'string' | 'number' | 'keyword' }[] {
  const pattern = /(\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|function|return|if|else|class|export|import|from|new|throw|async|await|interface|type|true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b)/g;
  const tokens: ReturnType<typeof highlight> = []; let offset = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > offset) tokens.push({ text: text.slice(offset, match.index), kind: 'plain' });
    const value = match[0]; const kind = value.startsWith('//') ? 'comment' : /^["']/.test(value) ? 'string' : /^\d/.test(value) ? 'number' : 'keyword';
    tokens.push({ text: value, kind }); offset = match.index + value.length;
  }
  if (offset < text.length) tokens.push({ text: text.slice(offset), kind: 'plain' });
  return tokens;
}
