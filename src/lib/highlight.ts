// A tiny syntax colouring for the code template. It only needs to look right for short snippets.
const KEYWORDS = new Set(
  ('const let var function return if else for while import from export default async await class new def in not and or is None True False try except finally with as lambda null undefined true false of ' +
    'SELECT FROM WHERE JOIN ON GROUP BY ORDER LIMIT AS AND OR INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE')
    .split(' ')
);

export type Token = {text: string; color: string};

const COLORS = {comment: '#6b7a90', string: '#a5e075', number: '#f0a05a', fn: '#61afef', keyword: '#c678dd', plain: '#e6edf3'};

export const tokenize = (line: string): Token[] => {
  const re = /(\/\/.*|#.*|--.*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)(?=\s*\()|(\b[A-Za-z_]\w*\b)|(\s+|.)/g;
  const tokens: Token[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m[1]) tokens.push({text: m[1], color: COLORS.comment});
    else if (m[2]) tokens.push({text: m[2], color: COLORS.string});
    else if (m[3]) tokens.push({text: m[3], color: COLORS.number});
    else if (m[4]) tokens.push({text: m[4], color: KEYWORDS.has(m[4]) ? COLORS.keyword : COLORS.fn});
    else if (m[5]) tokens.push({text: m[5], color: KEYWORDS.has(m[5]) ? COLORS.keyword : COLORS.plain});
    else tokens.push({text: m[6], color: COLORS.plain});
  }
  return tokens;
};

export const EXTENSIONS: Record<string, string> = {javascript: 'js', typescript: 'ts', python: 'py', bash: 'sh', sql: 'sql'};
