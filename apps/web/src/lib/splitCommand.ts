// Splits a command line into argv the way a POSIX shell would for plain words and quotes,
// so `sh -c 'echo hi; sleep 5'` stays three arguments. No variable or glob expansion.
export function splitCommand(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let inWord = false;
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === "\\" && quote === '"' && (input[i + 1] === '"' || input[i + 1] === "\\")) current += input[++i];
      else current += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      inWord = true;
    } else if (ch === "\\" && i + 1 < input.length) {
      current += input[++i];
      inWord = true;
    } else if (/\s/.test(ch)) {
      if (inWord) args.push(current);
      current = "";
      inWord = false;
    } else {
      current += ch;
      inWord = true;
    }
  }
  if (quote) throw new Error(`Unterminated ${quote} quote in command`);
  if (inWord) args.push(current);
  return args;
}
