import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { Category, Product, StoreSettings } from '../lib/types';
import { ProductCard } from '../components/ProductCard';
import { Empty, Spinner } from '../components/ui';
import { OfferStrip } from '../components/OfferPopup';
import { money } from '../lib/format';

interface Storefront {
  categories: Category[];
  featured: Product[];
  newest: Product[];
  deals: Product[];
  settings: StoreSettings;
}

const TRUST = [
  { ic: '🏭', t: 'Factory direct', d: 'No middleman markup' },
  { ic: '📉', t: 'Volume tiers', d: 'Unit price drops with qty' },
  { ic: '🛡️', t: '7-day returns', d: 'On every sealed carton' },
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

  if (error) return <Empty icon="⚠️" title="Could not load the storefront" hint={error} />;
  if (!data) return <Spinner />;

  return (
    <>
      <section className="hero">
        <div className="hero-banner">
          <img
            src={`${import.meta.env.BASE_URL}brand/banner.svg`}
            alt="Welcome to Arif Gadget Store — genuine gadgets delivered across Bangladesh"
            width={1600}
            height={560}
          />
        </div>

        <aside className="hero-side">
          <div className="promo-card">
            <span className="eyebrow">Free delivery</span>
            <p className="k">Over {money(data.settings.free_shipping_over)}</p>
            <p className="small muted">
              Below that, {money(data.settings.shipping_dhaka)} inside Dhaka and{' '}
              {money(data.settings.shipping_outside)} anywhere else in Bangladesh.
            </p>
          </div>

          {/*
            Took the place of a "Bulk buyers — up to 22% off" card. Someone
            landing on a shop wants to know they can reach a person, and the
            owner's WhatsApp and email were only reachable from the footer.
          */}
          {(data.settings.support_whatsapp_url || data.settings.support_email) && (
            <div className="promo-card">
              <span className="eyebrow">Need help?</span>
              <p className="k">We reply fast</p>
              <p className="small muted">Ask about a product, an order or delivery — we are happy to help.</p>
              <div className="stack gap-8" style={{ marginTop: 12 }}>
                {data.settings.support_whatsapp_url && (
                  <a
                    className="btn ghost sm block"
                    href={data.settings.support_whatsapp_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    💬 Chat on WhatsApp
                  </a>
                )}
                {data.settings.support_email && (
                  <a className="btn ghost sm block" href={`mailto:${data.settings.support_email}`}>
                    ✉️ {data.settings.support_email}
                  </a>
                )}
              </div>
            </div>
          )}

          <Link to="/catalog" className="btn dark block lg">
            Browse all {data.categories.reduce((n, c) => n + (c.product_count ?? 0), 0)} products
          </Link>
        </aside>
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

      <div className="section-head">
        <div>
          <div className="rule" />
          <h2>Shop by category</h2>
        </div>
      </div>
      <div className="cat-grid">
        {data.categories.map((category) => (
          <Link key={category.id} to={`/catalog?category=${category.slug}`} className="cat-tile">
            <div className="ic" aria-hidden="true">
              {category.icon}
            </div>
            <div className="nm">{category.name}</div>
            <div className="tiny dim">{category.product_count} items</div>
          </Link>
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
