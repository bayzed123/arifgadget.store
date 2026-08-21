import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import { number, relativeTime } from '../../lib/format';
import { useAuth, useToast } from '../../lib/store';
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

/* ─────────────────────────── Tag Manager ─────────────────────────── */

interface GtmTag {
  tagId: string;
  name: string;
  type: string;
  paused: boolean;
}
interface GtmTrigger {
  triggerId: string;
  name: string;
  type: string;
}
interface GtmSummary {
  accountName: string;
  containerName: string;
  publicId: string;
  workspaceName: string;
  tags: GtmTag[];
  triggers: GtmTrigger[];
  variables: { variableId: string; name: string; type: string }[];
  liveVersionName: string | null;
}

/**
 * What is actually configured inside the GTM container already installed on
 * the site — for someone who cannot easily read the GTM console themselves.
 * GTM itself has no concept of "how often did this fire" (that lives in the
 * GA4 panel above); this is only "what is set up".
 */
function TagManagerPanel() {
  const [summary, setSummary] = useState<GtmSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ ok: boolean; error: string; summary: GtmSummary | null }>('/api/admin/google/gtm/summary', { auth: true })
      .then((res) => {
        setSummary(res.summary);
        setError(res.ok ? '' : res.error);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load Tag Manager data'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Tag Manager</h3>
      </div>
      <div className="panel-body stack gap-16">
        {loading ? (
          <Spinner />
        ) : error ? (
          <div className="alert warn small">{error}</div>
        ) : summary ? (
          <>
            <div className="stat-row">
              <Stat label="Tags" value={number(summary.tags.length)} />
              <Stat label="Triggers" value={number(summary.triggers.length)} />
              <Stat label="Variables" value={number(summary.variables.length)} />
              <Stat label="Live version" value={summary.liveVersionName || 'Not published yet'} />
            </div>
            <p className="tiny dim">
              Container <span className="mono">{summary.publicId}</span> ("{summary.containerName}") in{' '}
              {summary.accountName} — workspace "{summary.workspaceName}".
            </p>

            {summary.tags.length === 0 ? (
              <Empty
                icon="🏷️"
                title="No tags set up yet"
                hint="This container is installed on the site but empty — nothing has been configured inside it. Add tags from tagmanager.google.com whenever you're ready."
              />
            ) : (
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Tag</th>
                      <th>Type</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.tags.map((t) => (
                      <tr key={t.tagId}>
                        <td>{t.name}</td>
                        <td className="tiny dim mono">{t.type}</td>
                        <td>
                          <span className={`badge ${t.paused ? 'low' : 'ok'}`}>
                            <span className="dot" /> {t.paused ? 'Paused' : 'Active'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {summary.triggers.length > 0 && (
              <details>
                <summary className="small" style={{ cursor: 'pointer', fontWeight: 700 }}>
                  {summary.triggers.length} trigger{summary.triggers.length === 1 ? '' : 's'}
                </summary>
                <ul className="stack gap-4" style={{ marginTop: 8, paddingLeft: 4, listStyle: 'none' }}>
                  {summary.triggers.map((t) => (
                    <li key={t.triggerId} className="small between">
                      <span>{t.name}</span>
                      <span className="tiny dim mono">{t.type}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ─────────────────────────── Google Sheets ─────────────────────────── */

interface SheetsStatus {
  spreadsheet_id: string;
  last_synced_at: number | null;
  last_error: string;
}

/**
 * Pushes real Users/Orders/Revenue data into a spreadsheet the owner shared
 * with the service account — fully replacing each tab on every run, by hand
 * here or automatically once an hour from the Worker's own cron trigger.
 */
function SheetsPanel() {
  const toast = useToast();
  const [status, setStatus] = useState<SheetsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  function load() {
    api<SheetsStatus>('/api/admin/google/sheets/status', { auth: true })
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function connect(event: FormEvent) {
    event.preventDefault();
    if (!url.trim()) return;
    setConnecting(true);
    try {
      await api('/api/admin/google/sheets/connect', { method: 'POST', auth: true, body: { url: url.trim() } });
      setUrl('');
      toast('Spreadsheet connected', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not connect that spreadsheet', 'error');
    } finally {
      setConnecting(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      const res = await api<{ ok: boolean; error: string }>('/api/admin/google/sheets/sync', { method: 'POST', auth: true });
      if (res.ok) toast('Spreadsheet updated', 'success');
      else toast(res.error, 'error');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Google Sheet export</h3>
      </div>
      <div className="panel-body stack gap-14">
        {loading ? (
          <Spinner />
        ) : !status?.spreadsheet_id ? (
          <form className="stack gap-10" onSubmit={connect}>
            <p className="small muted">
              Paste the link to a Google Sheet you've shared with the service account (Editor access). It'll get three
              tabs — Users, Orders, Revenue — kept fresh automatically every hour.
            </p>
            <div className="row gap-8 wrap-row">
              <input
                className="input"
                style={{ flex: 1, minWidth: 260 }}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <button className="btn primary" type="submit" disabled={connecting || !url.trim()}>
                {connecting ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="row gap-8 wrap-row between">
              <div>
                <p className="small">
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${status.spreadsheet_id}/edit`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open the spreadsheet ↗
                  </a>
                </p>
                <p className="tiny dim">
                  {status.last_synced_at ? `Last updated ${relativeTime(status.last_synced_at)}` : 'Never synced yet'} ·
                  refreshes automatically every hour
                </p>
              </div>
              <button className="btn ghost sm" disabled={syncing} onClick={syncNow}>
                {syncing ? 'Syncing…' : 'Sync now'}
              </button>
            </div>
            {status.last_error && <div className="alert warn small">Last attempt failed: {status.last_error}</div>}
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── AI assistants & health check ─────────────────────────── */

interface GeminiStatus {
  admin_assistant: boolean;
  support_chat: boolean;
  site_health_check: boolean;
}

interface HealthStatus {
  status: 'ok' | 'warning' | 'error' | null;
  summary: string;
  checked_at: number | null;
  error: string;
}

/**
 * Three independent Gemini-powered features (see gemini.ts on the Worker for
 * why the keys are kept separate): the admin assistant floating on every
 * dashboard screen, the storefront's support chat, and this — a health check
 * that runs once a day on its own and only needs checking in on here.
 */
function HealthCheckPanel() {
  const toast = useToast();
  const [gemini, setGemini] = useState<GeminiStatus | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([
      api<GeminiStatus>('/api/admin/gemini/status', { auth: true }),
      api<HealthStatus>('/api/admin/health-check/status', { auth: true }),
    ])
      .then(([g, h]) => {
        setGemini(g);
        setHealth(h);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function runNow() {
    setRunning(true);
    try {
      const res = await api<{ ok: boolean; error: string }>('/api/admin/health-check/run', { method: 'POST', auth: true });
      if (res.ok) toast('Health check complete', 'success');
      else toast(res.error, 'error');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not run the check', 'error');
    } finally {
      setRunning(false);
    }
  }

  const alertClass = health?.status === 'ok' ? 'success' : health?.status === 'error' ? 'error' : 'warn';

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>AI assistants &amp; daily health check</h3>
          <p className="tiny dim">Powered by Gemini — three separate API keys, one per feature.</p>
        </div>
        {gemini?.site_health_check && (
          <button className="btn ghost sm" disabled={running} onClick={runNow}>
            {running ? 'Checking…' : 'Run now'}
          </button>
        )}
      </div>
      <div className="panel-body stack gap-14">
        {loading ? (
          <Spinner />
        ) : (
          <>
            <div className="stat-row">
              <Stat label="Admin assistant" value={gemini?.admin_assistant ? 'Configured' : 'Not set'} foot="Floating helper on every admin screen" />
              <Stat label="Support chat" value={gemini?.support_chat ? 'Configured' : 'Not set'} foot="Floating chat on the storefront" />
              <Stat label="Daily health check" value={gemini?.site_health_check ? 'Configured' : 'Not set'} foot="Runs once a day automatically" />
            </div>

            {!gemini?.site_health_check ? (
              <div className="alert warn small">
                Add <code>ALERT_GEMINI_API_KEY</code> as a repository secret and re-run the deploy to turn the daily
                check on. (<code>ADMIN_GEMINI_API_KEY</code> and <code>SUPPORT_GEMINI_API_KEY</code> switch on the
                two chat widgets the same way.)
              </div>
            ) : health?.error ? (
              <div className="alert warn small">Last attempt failed: {health.error}</div>
            ) : health?.status ? (
              <div className={`alert ${alertClass} small`} style={{ whiteSpace: 'pre-wrap' }}>
                {health.summary}
                <div className="tiny dim" style={{ marginTop: 8 }}>
                  {health.checked_at ? `Checked ${relativeTime(health.checked_at)}` : ''}
                </div>
              </div>
            ) : (
              <Empty icon="🩺" title="Hasn't run yet" hint="Runs automatically once a day — or press Run now above." />
            )}

            {gemini?.site_health_check && !health?.status && (
              <p className="tiny dim">
                Add the <strong>Live storefront URL</strong> in Settings so the check can also confirm the live site
                itself is reachable, not just the dashboard's own numbers.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Weekly developer report ─────────────────────────── */

interface DevReportStatus {
  configured: boolean;
  doc_id: string;
  sheet1_id: string;
  sheet2_id: string;
  status: 'ok' | 'warning' | 'error' | null;
  summary: string;
  checked_at: number | null;
  error: string;
}

/**
 * A weekly "how did the whole platform do" report — sales trend, errors,
 * how the other three Gemini features are holding up, and real staff
 * activity from the audit log — written to a Google Doc and up to two
 * Google Sheets. Owner-only, deliberately: it reads staff activity, so
 * staff/admin accounts must never even see that this exists — the backend
 * route this panel calls (/dev-report/status, /dev-report/run) rejects
 * anyone but the owner, and this component is only ever mounted for one.
 * There's no destination-editing UI here on purpose either — the Doc/Sheet
 * links are set once by a migration, not something to reconfigure by hand.
 */
function DevReportPanel() {
  const toast = useToast();
  const [report, setReport] = useState<DevReportStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  function load() {
    setLoading(true);
    api<DevReportStatus>('/api/admin/dev-report/status', { auth: true })
      .then(setReport)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function runNow() {
    setRunning(true);
    try {
      const res = await api<{ ok: boolean; error: string }>('/api/admin/dev-report/run', { method: 'POST', auth: true });
      if (res.ok) toast('Weekly report generated', 'success');
      else toast(res.error, 'error');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not run the report', 'error');
    } finally {
      setRunning(false);
    }
  }

  const alertClass = report?.status === 'ok' ? 'success' : report?.status === 'error' ? 'error' : 'warn';

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Weekly developer report 🔒</h3>
          <p className="tiny dim">Owner only. Sales, errors, AI feature health &amp; staff activity — written every Monday.</p>
        </div>
        {report?.configured && (
          <button className="btn ghost sm" disabled={running} onClick={runNow}>
            {running ? 'Writing…' : 'Run now'}
          </button>
        )}
      </div>
      <div className="panel-body stack gap-14">
        {loading ? (
          <Spinner />
        ) : !report?.configured ? (
          <div className="alert warn small">
            Add <code>DEVLOPER_REPORT_GEMENI</code> as a repository secret and re-run the deploy to turn this on.
          </div>
        ) : (
          <>
            <div className="row gap-12 wrap-row">
              {report?.doc_id && (
                <a href={`https://docs.google.com/document/d/${report.doc_id}/edit`} target="_blank" rel="noreferrer" className="small">
                  Open the report doc ↗
                </a>
              )}
              {report?.sheet1_id && (
                <a href={`https://docs.google.com/spreadsheets/d/${report.sheet1_id}/edit`} target="_blank" rel="noreferrer" className="small">
                  Open sheet 1 ↗
                </a>
              )}
              {report?.sheet2_id && (
                <a href={`https://docs.google.com/spreadsheets/d/${report.sheet2_id}/edit`} target="_blank" rel="noreferrer" className="small">
                  Open sheet 2 ↗
                </a>
              )}
            </div>

            {report?.error && <div className="alert warn small">{report.error}</div>}
            {report?.status ? (
              <div className={`alert ${alertClass} small`} style={{ whiteSpace: 'pre-wrap' }}>
                {report.summary}
                <div className="tiny dim" style={{ marginTop: 8 }}>
                  {report.checked_at ? `Written ${relativeTime(report.checked_at)}` : ''}
                </div>
              </div>
            ) : (
              <Empty icon="📋" title="No report yet" hint="Runs automatically every Monday — or press Run now above for a real test right now." />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function Analytics() {
  const { admin } = useAuth();
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
          <h1>Google Analytics, Tag Manager &amp; Sheets</h1>
          <p className="small muted">Real data, read and written straight from your connected Google account.</p>
        </div>
      </div>

      <div className="stack gap-20" style={{ marginBottom: 20 }}>
        <HealthCheckPanel />
        {/* Owner-only — see DevReportPanel's own comment for why staff must never see this. */}
        {admin?.role === 'owner' && <DevReportPanel />}
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
          <TagManagerPanel />
          <Ga4Panel propertyId={status.ga4_property_id} onPropertyChosen={(id) => setStatus({ ...status, ga4_property_id: id })} />
          <SearchConsolePanel siteUrl={status.gsc_site_url} onSiteChosen={(url) => setStatus({ ...status, gsc_site_url: url })} />
          <SheetsPanel />
        </div>
      )}
    </>
  );
}
