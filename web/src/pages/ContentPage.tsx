import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { date } from '../lib/format';
import type { ContentPage as PageData } from '../lib/types';
import { Prose } from '../components/Prose';
import { Empty, Spinner } from '../components/ui';

/** Renders any company or policy page from the dashboard-managed CMS. */
export function ContentPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<PageData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setPage(null);
    setError('');
    window.scrollTo({ top: 0 });

    api<{ page: PageData }>(`/api/pages/${slug}`)
      .then((res) => setPage(res.page))
      .catch((err: Error) => setError(err.message));
  }, [slug]);

  useEffect(() => {
    if (page) document.title = `${page.title} — Arif Gadgets`;
    return () => {
      document.title = 'Arif Gadgets — Wholesale Gadgets, Factory Direct';
    };
  }, [page]);

  if (error) return <Empty icon="📄" title="Page not found" hint={error} />;
  if (!page) return <Spinner />;

  return (
    <article style={{ maxWidth: 780, margin: '0 auto' }}>
      <nav className="small dim row gap-8" style={{ marginBottom: 16 }} aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">›</span>
        <span>{page.title}</span>
      </nav>

      <div className="rule" style={{ height: 3, width: 44, borderRadius: 2, background: 'linear-gradient(90deg, var(--brand), var(--gold))', marginBottom: 10 }} />
      <h1>{page.title}</h1>
      {page.summary && <p className="muted" style={{ marginTop: 6, fontSize: '1.05rem' }}>{page.summary}</p>}
      <p className="tiny dim" style={{ marginTop: 8 }}>Last updated {date(page.updated_at)}</p>

      <div className="panel" style={{ marginTop: 22 }}>
        <div className="panel-body">
          <Prose body={page.body} />
        </div>
      </div>
    </article>
  );
}
