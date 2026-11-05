import { Fragment } from 'react';
import { parseMarkdown, type Inline } from '@/lib/mini-markdown';

// Renders an agent's Markdown report as React elements (never as HTML).
function Inlines({ nodes }: { nodes: Inline[] }) {
  return nodes.map((n, i) => {
    if (n.t === 'text') return <Fragment key={i}>{n.v}</Fragment>;
    if (n.t === 'code') return <code key={i} className="rounded bg-surface-2 px-1 font-mono text-xs">{n.v}</code>;
    const Tag = n.t === 'strong' ? 'strong' : n.t === 'em' ? 'em' : 's';
    return (
      <Tag key={i}>
        <Inlines nodes={n.c} />
      </Tag>
    );
  });
}

export function MiniMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {parseMarkdown(text).map((b, i) => {
        switch (b.t) {
          case 'heading':
            return (
              <p key={i} className="font-semibold text-ink">
                <Inlines nodes={b.c} />
              </p>
            );
          case 'hr':
            return <hr key={i} className="border-line" />;
          case 'ul':
          case 'ol': {
            const List = b.t;
            return (
              <List key={i} className={b.t === 'ul' ? 'list-disc space-y-0.5 pl-5' : 'list-decimal space-y-0.5 pl-5'}>
                {b.items.map((item, j) => (
                  <li key={j}>
                    <Inlines nodes={item} />
                  </li>
                ))}
              </List>
            );
          }
          case 'table':
            return (
              <div key={i} className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      {b.head.map((cell, j) => (
                        <th key={j} className="border-b border-line py-1 pr-4 font-medium text-ink-2">
                          <Inlines nodes={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, j) => (
                      <tr key={j}>
                        {row.map((cell, k) => (
                          <td key={k} className="border-b border-line/60 py-1 pr-4">
                            <Inlines nodes={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'p':
            return (
              <p key={i}>
                {b.lines.map((line, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    <Inlines nodes={line} />
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
