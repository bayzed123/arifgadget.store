import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, mediaUrl } from '../lib/api';
import { date } from '../lib/format';
import type { Post, PostSummary } from '../lib/types';
import { Prose } from '../components/Prose';
import { Empty, Spinner } from '../components/ui';
import { useSeo } from '../lib/seo';

function Cover({ url, title }: { url: string; title: string }) {
  if (url) return <img src={mediaUrl(url)} alt={title} loading="lazy" />;
  // Deterministic tint so a post without a cover still looks composed.
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return (
    <div
      className="blog-cover-fallback"
      style={{ background: `linear-gradient(135deg, hsl(${hue} 40% 88%), hsl(${(hue + 45) % 360} 38% 80%))` }}
      aria-hidden="true"
    >
      <span>{title.slice(0, 1).toUpperCase()}</span>
    </div>
  );
}

export function Blog() {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ posts: PostSummary[] }>('/api/posts?limit=24')
      .then((res) => setPosts(res.posts))
      .catch((err: Error) => setError(err.message));
  }, []);

  useSeo({
    title: 'Blog',
    description: 'Product guides, buying advice and shop news from Arif Gadgets.',
  });

  if (error) return <Empty icon="⚠️" title="Could not load the blog" hint={error} />;
  if (!posts) return <Spinner />;

  return (
    <>
      <div className="section-head">
        <div>
          <div className="rule" />
          <h1>Blog</h1>
          <p className="small muted">Product guides, buying advice and shop news.</p>
        </div>
      </div>

      {posts.length === 0 ? (
        <Empty icon="✍️" title="No posts yet" hint="Articles published from the dashboard will appear here." />
      ) : (
        <div className="blog-grid">
          {posts.map((post) => (
            <Link key={post.slug} to={`/blog/${post.slug}`} className="blog-card">
              <div className="blog-cover">
                <Cover url={post.cover_url} title={post.title} />
              </div>
              <div className="blog-body">
                <time className="tiny dim">{date(post.published_at)}</time>
                <h3>{post.title}</h3>
                {post.excerpt && <p className="small muted clamp-2">{post.excerpt}</p>}
                {post.author && <span className="tiny dim">by {post.author}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [more, setMore] = useState<PostSummary[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    setPost(null);
    setError('');
    window.scrollTo({ top: 0 });

    api<{ post: Post; more: PostSummary[] }>(`/api/posts/${slug}`)
      .then((res) => {
        setPost(res.post);
        setMore(res.more);
      })
      .catch((err: Error) => setError(err.message));
  }, [slug]);

  useSeo({
    title: post ? post.title : 'Blog post',
    description: post?.excerpt || undefined,
  });

  if (error) return <Empty icon="📄" title="Post not found" hint={error} />;
  if (!post) return <Spinner />;

  const tags = post.tags ? post.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];

  return (
    <article style={{ maxWidth: 780, margin: '0 auto' }}>
      <nav className="small dim row gap-8" style={{ marginBottom: 16 }} aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">›</span>
        <Link to="/blog">Blog</Link>
      </nav>

      <h1>{post.title}</h1>
      <p className="small dim" style={{ marginTop: 8 }}>
        {date(post.published_at)}
        {post.author && ` · by ${post.author}`}
      </p>

      {post.cover_url && (
        <div className="blog-hero">
          <img src={mediaUrl(post.cover_url)} alt={post.title} />
        </div>
      )}

      <div className="panel" style={{ marginTop: 20 }}>
        <div className="panel-body">
          <Prose body={post.body} />
        </div>
      </div>

      {tags.length > 0 && (
        <div className="row gap-8 wrap-row" style={{ marginTop: 16 }}>
          {tags.map((tag) => (
            <span className="badge info" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {more.length > 0 && (
        <section style={{ marginTop: 40 }}>
          <div className="section-head">
            <div>
              <div className="rule" />
              <h2>More from the blog</h2>
            </div>
          </div>
          <div className="blog-grid">
            {more.map((item) => (
              <Link key={item.slug} to={`/blog/${item.slug}`} className="blog-card">
                <div className="blog-cover">
                  <Cover url={item.cover_url} title={item.title} />
                </div>
                <div className="blog-body">
                  <time className="tiny dim">{date(item.published_at)}</time>
                  <h3>{item.title}</h3>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
