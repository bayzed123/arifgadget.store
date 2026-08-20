import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, mediaUrl } from '../lib/api';
import type { Category, Product, StoreSettings } from '../lib/types';
import { ProductCard } from '../components/ProductCard';
import { Empty, Spinner } from '../components/ui';
import { OfferStrip } from '../components/OfferPopup';
import { useSeo } from '../lib/seo';

interface Storefront {
  categories: Category[];
  featured: Product[];
  newest: Product[];
  deals: Product[];
  settings: StoreSettings;
}

/* Kept to four, in the order a shopper worries about them: is it real, how do
   I pay, what if it is wrong, when does it arrive. */
const TRUST = [
  { ic: '✅', t: 'Genuine products', d: 'Sourced direct, no fakes' },
  { ic: '💵', t: 'Cash on delivery', d: 'Pay when it reaches you' },
  { ic: '🛡️', t: '7-day returns', d: 'On every eligible item' },
  { ic: '⚡', t: 'Ships in 48h', d: 'Nationwide courier' },
];

export function Home() {
  const [data, setData] = useState<Storefront | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Storefront>('/api/storefront')
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  useSeo({
    title: 'Wholesale Gadgets, Factory Direct',
    description:
      'Arif Gadgets supplies phones, audio, wearables and accessories at wholesale tiers. Live stock, volume pricing, ships in 48 hours across Bangladesh.',
  });

  if (error) return <Empty icon="⚠️" title="Could not load the storefront" hint={error} />;
  if (!data) return <Spinner />;

  return (
    <>
      <section className="hero">
        <div className="hero-banner">
          <img
            // Settings → Homepage lets staff replace this with their own
            // banner any time, no redeploy — falls back to the bundled
            // default the moment that setting is empty, so there's never a
            // broken image while nobody has uploaded one yet.
            src={data.settings.hero_banner_url ? mediaUrl(data.settings.hero_banner_url) : `${import.meta.env.BASE_URL}brand/banner.svg`}
            alt="Welcome to Arif Gadget Store — genuine gadgets delivered across Bangladesh"
            // No fixed width/height: the bundled default is 1600×560, but a
            // staff-uploaded banner can be any shape, and .hero-banner img
            // already scales to width:100%;height:auto in styles.css.
          />
        </div>

        {/*
          The banner used to share the row with a stack of cards. Nothing up
          here competes with it now — the two actions below are the ones the
          banner itself invites, and everything else waits further down the
          page where a shopper goes looking for it.
        */}
        <div className="hero-actions">
          <Link to="/catalog" className="btn primary lg">
            Shop now — {data.categories.reduce((n, c) => n + (c.product_count ?? 0), 0)} products
          </Link>
          <Link to="/track" className="btn ghost lg">
            Track your order
          </Link>
        </div>
      </section>

      <OfferStrip />

      <div className="trust-strip">
        {TRUST.map((item) => (
          <div key={item.t}>
            <span className="ic" aria-hidden="true">
              {item.ic}
            </span>
            <span>
              <strong style={{ display: 'block', fontSize: '0.9rem' }}>{item.t}</strong>
              <span className="tiny dim">{item.d}</span>
            </span>
          </div>
        ))}
      </div>

      {data.deals.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <div className="section-head">
            <div>
              <div className="rule" />
              <h2>Clearance &amp; deals</h2>
              <p className="small muted">Discounted below list price while stock lasts.</p>
            </div>
            <Link to="/catalog?sort=discount" className="btn ghost sm">
              See all
            </Link>
          </div>
          <div className="prod-rail">
            {data.deals.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {data.featured.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <div className="section-head">
            <div>
              <div className="rule" />
              <h2>Best sellers</h2>
              <p className="small muted">The lines that move fastest off our shelves.</p>
            </div>
            <Link to="/catalog?sort=popular" className="btn ghost sm">
              See all
            </Link>
          </div>
          <div className="prod-grid">
            {data.featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="section-head">
          <div>
            <div className="rule" />
            <h2>Just landed</h2>
          </div>
          <Link to="/catalog?sort=newest" className="btn ghost sm">
            See all
          </Link>
        </div>
        <div className="prod-grid">
          {data.newest.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </>
  );
}
