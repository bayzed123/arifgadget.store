import type { ReactNode } from 'react';

/**
 * Renders the light markdown used by pages and blog posts.
 *
 * Deliberately builds React elements rather than setting innerHTML: the text
 * is authored in the dashboard, and this way a stray <script> in a policy page
 * can never become executable markup.
 *
 * Supported: ## and ### headings, - bullets, 1. numbered lists, > quotes,
 * blank-line-separated paragraphs, **bold**, *italic*, `code`, [text](url).
 */

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function inline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    const key = `${keyPrefix}-${i}`;

    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }

    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = link[2];
      // Only http(s), mailto and tel — never javascript: or data:
      const safe = /^(https?:|mailto:|tel:|\/)/i.test(href);
      if (!safe) return <span key={key}>{link[1]}</span>;
      const external = /^https?:/i.test(href);
      return (
        <a key={key} href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          {link[1]}
        </a>
      );
    }

    return <span key={key}>{part}</span>;
  });
}

export function Prose({ body }: { body: string }) {
  const blocks: ReactNode[] = [];
  const lines = (body ?? '').replace(/\r\n/g, '\n').split('\n');

  let paragraph: string[] = [];
  let bullets: string[] = [];
  let numbers: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(' ');
    blocks.push(<p key={`p${blocks.length}`}>{inline(text, `p${blocks.length}`)}</p>);
    paragraph = [];
  };
  const flushBullets = () => {
    if (!bullets.length) return;
    const items = bullets;
    blocks.push(
      <ul key={`u${blocks.length}`}>
        {items.map((item, i) => (
          <li key={i}>{inline(item, `u${blocks.length}-${i}`)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  const flushNumbers = () => {
    if (!numbers.length) return;
    const items = numbers;
    blocks.push(
      <ol key={`o${blocks.length}`}>
        {items.map((item, i) => (
          <li key={i}>{inline(item, `o${blocks.length}-${i}`)}</li>
        ))}
      </ol>,
    );
    numbers = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushBullets();
    flushNumbers();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim() === '') {
      flushAll();
      continue;
    }
    if (line.startsWith('### ')) {
      flushAll();
      blocks.push(<h3 key={`h${blocks.length}`}>{inline(line.slice(4), `h${blocks.length}`)}</h3>);
      continue;
    }
    if (line.startsWith('## ')) {
      flushAll();
      blocks.push(<h2 key={`h${blocks.length}`}>{inline(line.slice(3), `h${blocks.length}`)}</h2>);
      continue;
    }
    if (line.startsWith('> ')) {
      flushAll();
      blocks.push(<blockquote key={`q${blocks.length}`}>{inline(line.slice(2), `q${blocks.length}`)}</blockquote>);
      continue;
    }
    if (/^[-*] /.test(line)) {
      flushParagraph();
      flushNumbers();
      bullets.push(line.slice(2));
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      flushParagraph();
      flushBullets();
      numbers.push(line.replace(/^\d+\.\s/, ''));
      continue;
    }

    flushBullets();
    flushNumbers();
    paragraph.push(line.trim());
  }
  flushAll();

  return <div className="prose">{blocks}</div>;
}
