import { Hono } from 'hono';
import type { Env, Variables } from '../types';

/**
 * Bangladesh division/district/upazila/postcode lookups for the checkout's
 * address auto-fill — see migration 0023 for where this reference data comes
 * from. Read-only: nothing here is ever written by the app.
 */
export const geo = new Hono<{ Bindings: Env; Variables: Variables }>();

geo.get('/divisions', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, name, bn_name FROM bd_divisions ORDER BY name').all();
  return c.json({ divisions: results ?? [] });
});

geo.get('/districts', async (c) => {
  const divisionId = Number(c.req.query('division_id'));
  const { results } = divisionId
    ? await c.env.DB.prepare('SELECT id, division_id, name, bn_name FROM bd_districts WHERE division_id = ? ORDER BY name')
        .bind(divisionId)
        .all()
    : await c.env.DB.prepare('SELECT id, division_id, name, bn_name FROM bd_districts ORDER BY name').all();
  return c.json({ districts: results ?? [] });
});

geo.get('/upazilas', async (c) => {
  const districtId = Number(c.req.query('district_id'));
  if (!districtId) return c.json({ upazilas: [] });
  const { results } = await c.env.DB.prepare(
    'SELECT id, district_id, name, bn_name FROM bd_upazilas WHERE district_id = ? ORDER BY name',
  )
    .bind(districtId)
    .all();
  return c.json({ upazilas: results ?? [] });
});

/**
 * Resolves a postcode to division/district/upazila IDs so the checkout can
 * auto-fill and pre-select those dropdowns. Best-effort: the postal
 * service's own division/district/thana names don't always spell identically
 * to the administrative district/upazila list, so this matches case-
 * insensitively and falls back to just the raw names when no exact district/
 * upazila row matches — the customer's own picker selection always wins over
 * whatever this suggests.
 */
geo.get('/postcode/:code', async (c) => {
  const code = c.req.param('code').trim();
  const row = await c.env.DB.prepare(
    'SELECT postcode, division_name, district_name, thana_name FROM bd_postcodes WHERE postcode = ?',
  )
    .bind(code)
    .first<{ postcode: string; division_name: string; district_name: string; thana_name: string }>();

  if (!row) return c.json({ found: false });

  const district = await c.env.DB.prepare(
    'SELECT id, division_id, name FROM bd_districts WHERE lower(name) = lower(?) LIMIT 1',
  )
    .bind(row.district_name.trim())
    .first<{ id: number; division_id: number; name: string }>();

  const upazila = district
    ? await c.env.DB.prepare(
        'SELECT id, name FROM bd_upazilas WHERE district_id = ? AND lower(name) = lower(?) LIMIT 1',
      )
        .bind(district.id, row.thana_name.trim())
        .first<{ id: number; name: string }>()
    : null;

  return c.json({
    found: true,
    division_name: row.division_name.trim(),
    district_name: row.district_name.trim(),
    thana_name: row.thana_name.trim(),
    district_id: district?.id ?? null,
    division_id: district?.division_id ?? null,
    upazila_id: upazila?.id ?? null,
  });
});
