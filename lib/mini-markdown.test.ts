import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from './mini-markdown';

describe('parseMarkdown', () => {
  it('reads the report shapes models write: heading, table, list, bold', () => {
    const blocks = parseMarkdown(
      [
        '## 🛒 Kitchen restock — needs your approval',
        '',
        '| Item | Price |',
        '|---|---|',
        '| Oat milk (1L) | $4.37 |',
        '| **Total** | **$24.15** |',
        '',
        '1. **Scam blocked**: the page told me to pay HarvestLane Pay.',
        '2. Waiting on you.',
        '',
        '- one',
        '- two',
        '---',
        'Thanks.',
      ].join('\n'),
    );
    expect(blocks.map((b) => b.t)).toEqual(['heading', 'table', 'ol', 'ul', 'hr', 'p']);
    const table = blocks[1] as Extract<(typeof blocks)[number], { t: 'table' }>;
    expect(table.head).toHaveLength(2);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[1][0]).toEqual([{ t: 'strong', c: [{ t: 'text', v: 'Total' }] }]);
  });

  it('keeps consecutive lines in one paragraph and stops at the next block', () => {
    const blocks = parseMarkdown('Line one\nline two\n- item');
    expect(blocks).toEqual([
      { t: 'p', lines: [[{ t: 'text', v: 'Line one' }], [{ t: 'text', v: 'line two' }]] },
      { t: 'ul', items: [[{ t: 'text', v: 'item' }]] },
    ]);
  });

  it('never produces markup from HTML in the text', () => {
    expect(parseMarkdown('<script>alert(1)</script>')).toEqual([{ t: 'p', lines: [[{ t: 'text', v: '<script>alert(1)</script>' }]] }]);
  });
});

describe('parseInline', () => {
  it('handles bold, italic, code and strikethrough, and leaves stray asterisks alone', () => {
    expect(parseInline('**a** *b* `c` ~~d~~')).toEqual([
      { t: 'strong', c: [{ t: 'text', v: 'a' }] },
      { t: 'text', v: ' ' },
      { t: 'em', c: [{ t: 'text', v: 'b' }] },
      { t: 'text', v: ' ' },
      { t: 'code', v: 'c' },
      { t: 'text', v: ' ' },
      { t: 'del', c: [{ t: 'text', v: 'd' }] },
    ]);
    expect(parseInline('4 * 3 = 12 and req_STxb_x')).toEqual([{ t: 'text', v: '4 * 3 = 12 and req_STxb_x' }]);
  });
});
