import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, mediaUrl } from '../lib/api';
import { date } from '../lib/format';
import type { PressItem } from '../lib/types';
import { Empty, Spinner } from '../components/ui';
import { useSeo } from '../lib/seo';

/**
 * News coverage. Items are added in the dashboard with a link and a thumbnail
 * and appear here automatically, newest first.
 */
export function Press() {
  const [items, setItems] = useState<PressItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ press: PressItem[] }>('/api/press')
      .then((res) => setItems(res.press))
      .catch((err: Error) => setError(err.message));
  }, []);

  useSeo({ title: 'Press & Media', description: 'Where Arif Gadgets has been featured in the press.' });

  if (error) return <Empty icon="⚠️" title="Could not load press coverage" hint={error} />;
  if (!items) return <Spinner />;

  return (
    <>
      <div className="section-head">
        <div>
          <div className="rule" />
          <h1>Press Coverage</h1>
          <p className="small muted">Where Arif Gadgets has been mentioned in the news.</p>
        </div>
      </div>

      {items.length === 0 ? (
        <Empty
          icon="📰"
          title="No coverage listed yet"
          hint="When we are featured somewhere, the article will be linked here."
        />
      ) : (
        <div className="press-grid">
          {items.map((item) => (
            <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="press-card">
              <div className="press-thumb">
                {item.thumbnail_url ? (
                  <img src={mediaUrl(item.thumbnail_url)} alt="" loading="lazy" />
                ) : (
                  <span className="press-thumb-fallback" aria-hidden="true">
                    📰
                  </span>
                )}
              </div>
              <div className="press-body">
                <div className="row gap-8 wrap-row">
                  {item.outlet && <span className="badge brand">{item.outlet}</span>}
                  <time className="tiny dim">{date(item.published_at)}</time>
                </div>
                <h3>{item.title}</h3>
                {item.excerpt && <p className="small muted clamp-2">{item.excerpt}</p>}
                <span className="press-link">
                  Read the article <span aria-hidden="true">↗</span>
                </span>
              </div>
            </a>
          ))}
        </div>
      )}

      <p className="small muted center" style={{ marginTop: 32 }}>
        Press or media enquiry? <Link to="/page/contact-us" style={{ textDecoration: 'underline' }}>Get in touch</Link>.
      </p>
    </>
  );
}
