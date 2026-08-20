import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { number } from '../../lib/format';
import { useToast } from '../../lib/store';
import { Empty, Spinner, Stat } from '../../components/ui';

/**
 * Real numbers from Google, pulled with the service account the owner
 * connected — no developer signing into GA4 or Search Console to check
 * anything. This page only reads; nothing here can change a setting inside
 * either Google product.
 */

interface Status {
  connected: boolean;
  service_account_email: string | null;
  ga4_property_id: string;
  gsc_site_url: string;
}

interface Ga4Property {
  property: string;
  displayName: string;
  account: string;
}

interface Ga4Summary {
  sessions: number;
  activeUsers: number;
  conversions: number;
  pageViews: number;
  topPages: { path: string; views: number }[];
}

interface SearchQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface GscSummary {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  topQueries: SearchQuery[];
}

const RANGES = [7, 28, 90] as const;

function NotConnected({ email }: { email: string | null }) {
  return (
    <div className="alert warn">
      <strong>No Google service account is connected.</strong> Add{' '}
      <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> as a repository secret and re-run the deploy workflow.
      {email && (
        <>
          {' '}
          Once it's connected, this page will read as <strong>{email}</strong> — make sure that address has been
          granted access inside GA4 and Search Console.
        </>
      )}
    </div>
  );
}

/** GA4 — property picker if none is chosen yet, otherwise the real numbers. */
function Ga4Panel({ propertyId, onPropertyChosen }: { propertyId: string; onPropertyChosen: (id: string) => void }) {
  const toast = useToast();
  const [properties, setProperties] = useState<Ga4Property[] | null>(null);
  const [propertiesError, setPropertiesError] = useState('');
  const [days, setDays] = useState<(typeof RANGES)[number]>(7);
  const [summary, setSummary] = useState<Ga4Summary | null>(null);
  const [summaryError, setSummaryError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (propertyId) return;
    api<{ ok: boolean; error: string; properties: Ga4Property[] }>('/api/admin/google/ga4/properties', { auth: true })
      .then((res) => {
        setProperties(res.properties);
        setPropertiesError(res.ok ? '' : res.error);
      })
      .catch((err) => setPropertiesError(err instanceof ApiError ? err.message : 'Could not list GA4 properties'))
      .finally(() => setLoading(false));
  }, [propertyId]);

  useEffect(() => {
    if (!propertyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api<{ ok: boolean; error: string; summary: Ga4Summary | null }>(`/api/admin/google/ga4/summary?days=${days}`, {
      auth: true,
    })
      .then((res) => {
        setSummary(res.summary);
        setSummaryError(res.ok ? '' : res.error);
      })
      .catch((err) => setSummaryError(err instanceof ApiError ? err.message : 'Could not load GA4 data'))
      .finally(() => setLoading(false));
  }, [propertyId, days]);

  async function choose(id: string) {
    setSaving(true);
    try {
      await api('/api/admin/settings', { method: 'PATCH', auth: true, body: { ga4_property_id: id } });
      onPropertyChosen(id);
      toast('GA4 property connected', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;

  if (!propertyId) {
    return (
      <div className="panel">
        <div className="panel-head">
          <h3>Google Analytics 4</h3>
        </div>
        <div className="panel-body stack gap-12">
          {propertiesError ? (
            <div className="alert warn small">{propertiesError}</div>
          ) : !properties || properties.length === 0 ? (
            <Empty icon="📈" title="No GA4 properties visible" hint="Grant this service account Viewer access in GA4 → Admin → Property access management." />
          ) : (
            <>
              <p className="small muted">Pick which GA4 property this dashboard should read from.</p>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>Account</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {properties.map((p) => (
                      <tr key={p.property}>
                        <td>{p.displayName}</td>
                        <td className="tiny dim">{p.account}</td>
                        <td>
                          <button className="btn ghost sm" disabled={saving} onClick={() => choose(p.property)}>
                            Use this
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Google Analytics 4</h3>
          <p className="tiny dim mono">{propertyId}</p>
        </div>
        <div className="pill-tabs">
          {RANGES.map((r) => (
            <button key={r} className={days === r ? 'active' : ''} onClick={() => setDays(r)}>
              {r}d
            </button>
          ))}
        </div>
      </div>
      <div className="panel-body stack gap-16">
        {summaryError ? (
          <div className="alert warn small">
            {summaryError}
            <div style={{ marginTop: 8 }}>
              <button className="btn ghost sm" onClick={() => onPropertyChosen('')}>
                Pick a different property
              </button>
            </div>
          </div>
        ) : summary ? (
          <>
            <div className="stat-row">
              <Stat label="Sessions" value={number(summary.sessions)} />
              <Stat label="Active users" value={number(summary.activeUsers)} />
              <Stat label="Conversions" value={number(summary.conversions)} />
              <Stat label="Page views" value={number(summary.pageViews)} />
            </div>
            {summary.topPages.length > 0 && (
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Page</th>
                      <th className="num">Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.topPages.map((p) => (
                      <tr key={p.path}>
                        <td className="mono small truncate" style={{ maxWidth: 360 }}>
                          {p.path}
                        </td>
                        <td className="num">{number(p.views)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <Empty icon="📈" title="No data for this range yet" />
        )}
      </div>
    </div>
  );
}

/** Search Console — same pattern as the GA4 panel: pick a site, then real numbers. */
function SearchConsolePanel({ siteUrl, onSiteChosen }: { siteUrl: string; onSiteChosen: (url: string) => void }) {
  const toast = useToast();
  const [sites, setSites] = useState<string[] | null>(null);
  const [sitesError, setSitesError] = useState('');
  const [summary, setSummary] = useState<GscSummary | null>(null);
  const [summaryError, setSummaryError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (siteUrl) return;
    api<{ ok: boolean; error: string; sites: string[] }>('/api/admin/google/gsc/sites', { auth: true })
      .then((res) => {
        setSites(res.sites);
        setSitesError(res.ok ? '' : res.error);
      })
      .catch((err) => setSitesError(err instanceof ApiError ? err.message : 'Could not list Search Console sites'))
      .finally(() => setLoading(false));
  }, [siteUrl]);

  useEffect(() => {
    if (!siteUrl) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api<{ ok: boolean; error: string; summary: GscSummary | null }>('/api/admin/google/gsc/summary?days=28', { auth: true })
      .then((res) => {
        setSummary(res.summary);
        setSummaryError(res.ok ? '' : res.error);
      })
      .catch((err) => setSummaryError(err instanceof ApiError ? err.message : 'Could not load Search Console data'))
      .finally(() => setLoading(false));
  }, [siteUrl]);

  async function choose(url: string) {
    setSaving(true);
    try {
      await api('/api/admin/settings', { method: 'PATCH', auth: true, body: { gsc_site_url: url } });
      onSiteChosen(url);
      toast('Search Console site connected', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;

  if (!siteUrl) {
    return (
      <div className="panel">
        <div className="panel-head">
          <h3>Search Console</h3>
        </div>
        <div className="panel-body stack gap-12">
          {sitesError ? (
            <div className="alert warn small">{sitesError}</div>
          ) : !sites || sites.length === 0 ? (
            <Empty icon="🔎" title="No verified sites visible" hint="Add this service account as a user in Search Console → Settings → Users and permissions." />
          ) : (
            <>
              <p className="small muted">Pick which verified property to read search performance from.</p>
              <div className="stack gap-8">
                {sites.map((s) => (
                  <div key={s} className="between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                    <span className="mono small">{s}</span>
                    <button className="btn ghost sm" disabled={saving} onClick={() => choose(s)}>
                      Use this
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Search Console</h3>
          <p className="tiny dim mono">{siteUrl}</p>
        </div>
        <span className="tiny dim">Last 28 days</span>
      </div>
      <div className="panel-body stack gap-16">
        {summaryError ? (
          <div className="alert warn small">
            {summaryError}
            <div style={{ marginTop: 8 }}>
              <button className="btn ghost sm" onClick={() => onSiteChosen('')}>
                Pick a different site
              </button>
            </div>
          </div>
        ) : summary ? (
          <>
            <div className="stat-row">
              <Stat label="Clicks" value={number(summary.clicks)} />
              <Stat label="Impressions" value={number(summary.impressions)} />
              <Stat label="Average CTR" value={`${(summary.ctr * 100).toFixed(1)}%`} />
              <Stat label="Average position" value={summary.position.toFixed(1)} />
            </div>
            {summary.topQueries.length > 0 && (
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Query</th>
                      <th className="num">Clicks</th>
                      <th className="num">Impressions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.topQueries.map((q) => (
                      <tr key={q.query}>
                        <td className="small">{q.query}</td>
                        <td className="num">{number(q.clicks)}</td>
                        <td className="num">{number(q.impressions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <Empty icon="🔎" title="No search data for this range yet" />
        )}
      </div>
    </div>
  );
}

export function Analytics() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api<Status>('/api/admin/google/status', { auth: true })
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  if (loading) return <Spinner />;

  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">Marketing</span>
          <h1>Google Analytics &amp; Search Console</h1>
          <p className="small muted">Real numbers, read straight from Google — nothing here can change a setting inside either product.</p>
        </div>
      </div>

      {!status?.connected ? (
        <NotConnected email={status?.service_account_email ?? null} />
      ) : (
        <div className="stack gap-20">
          {status.service_account_email && (
            <p className="tiny dim">
              Reading as <span className="mono">{status.service_account_email}</span> — this is the address that
              needs Viewer access granted inside GA4 and Search Console.
            </p>
          )}
          <Ga4Panel propertyId={status.ga4_property_id} onPropertyChosen={(id) => setStatus({ ...status, ga4_property_id: id })} />
          <SearchConsolePanel siteUrl={status.gsc_site_url} onSiteChosen={(url) => setStatus({ ...status, gsc_site_url: url })} />
        </div>
      )}
    </>
  );
}
