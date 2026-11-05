// A tiny Markdown parser for agent reports: headings, bullet and numbered lists, tables, quotes, rules, and inline
// bold, italic, code and strikethrough. It returns plain data that the UI turns into React elements, so a
// model's output can never inject HTML.

export type Inline = { t: 'text'; v: string } | { t: 'code'; v: string } | { t: 'strong' | 'em' | 'del'; c: Inline[] };

export type Block =
  | { t: 'heading'; c: Inline[] }
  | { t: 'p'; lines: Inline[][] }
  | { t: 'quote'; lines: Inline[][] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; items: Inline[][] }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { t: 'hr' };

const INLINE = /\*\*(.+?)\*\*|~~(.+?)~~|`([^`]+)`|\*(\S(?:[^*]*?\S)?)\*/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: 'strong', c: parseInline(m[1]) });
    else if (m[2] !== undefined) out.push({ t: 'del', c: parseInline(m[2]) });
    else if (m[3] !== undefined) out.push({ t: 'code', v: m[3] });
    else out.push({ t: 'em', c: parseInline(m[4]) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}

const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const BULLET = /^\s*[-*•+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_DIVIDER = (line: string) => /^[\s|:-]+$/.test(line) && line.includes('--');
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => parseInline(c.trim()));

const startsTable = (lines: string[], i: number) => TABLE_ROW.test(lines[i]) && i + 1 < lines.length && TABLE_DIVIDER(lines[i + 1]);
const startsBlock = (lines: string[], i: number) =>
  HEADING.test(lines[i]) || RULE.test(lines[i]) || BULLET.test(lines[i]) || NUMBERED.test(lines[i]) || QUOTE.test(lines[i]) || startsTable(lines, i);

export function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
    } else if (startsTable(lines, i)) {
      const head = cells(line);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i])) rows.push(cells(lines[i++]));
      blocks.push({ t: 'table', head, rows });
    } else if (HEADING.test(line)) {
      blocks.push({ t: 'heading', c: parseInline(line.match(HEADING)![1]) });
      i++;
    } else if (RULE.test(line)) {
      blocks.push({ t: 'hr' });
      i++;
    } else if (QUOTE.test(line)) {
      const quoted: Inline[][] = [];
      while (i < lines.length && QUOTE.test(lines[i])) quoted.push(parseInline(lines[i++].match(QUOTE)![1]));
      blocks.push({ t: 'quote', lines: quoted });
    } else if (BULLET.test(line) || NUMBERED.test(line)) {
      const pattern = BULLET.test(line) ? BULLET : NUMBERED;
      const items: Inline[][] = [];
      while (i < lines.length && pattern.test(lines[i])) items.push(parseInline(lines[i++].match(pattern)![1]));
      blocks.push({ t: pattern === BULLET ? 'ul' : 'ol', items });
    } else {
      const para: Inline[][] = [];
      do para.push(parseInline(lines[i++].trim()));
      while (i < lines.length && lines[i].trim() && !startsBlock(lines, i));
      blocks.push({ t: 'p', lines: para });
    }
  }
  return blocks;
}
