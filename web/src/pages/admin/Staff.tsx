import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import { dateTime, relativeTime } from '../../lib/format';
import { useAuth, useToast } from '../../lib/store';
import { ConfirmDialog, Empty, Spinner } from '../../components/ui';

interface StaffRow {
  id: number;
  username: string | null;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'staff';
  active: boolean;
  created_at: number;
  last_login_at: number | null;
  has_security_question: boolean;
}

const EMPTY_FORM = { username: '', name: '', password: '', role: 'staff' as 'staff' | 'admin', security_question: '', security_answer: '' };

/**
 * Owner-only. Creates the login a staff member actually signs in with, sets
 * the security question their own "Forgot password?" link on the sign-in
 * page will use, and lets the owner deactivate someone without deleting
 * them — audit_log keeps pointing at a real name either way. Nothing here
 * about the weekly developer report or any other owner-only feature; this
 * page is purely account management.
 */
export function Staff() {
  const { admin } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busyId, setBusyId] = useState<number | 'new' | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<StaffRow | null>(null);

  function load() {
    setLoading(true);
    api<{ staff: StaffRow[] }>('/api/admin/staff', { auth: true })
      .then((res) => setRows(res.staff))
      .catch((err) => toast(err instanceof ApiError ? err.message : 'Could not load staff accounts', 'error'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  if (admin?.role !== 'owner') {
    return (
      <div className="panel">
        <div className="panel-body">
          <Empty icon="🔒" title="Owner account required" hint="Only the shop owner can manage staff logins." />
        </div>
      </div>
    );
  }

  async function addStaff(event: FormEvent) {
    event.preventDefault();
    if (!form.username.trim() || !form.name.trim() || !form.password.trim() || !form.security_question.trim() || !form.security_answer.trim()) {
      toast('Fill in every field, including the security question and answer', 'error');
      return;
    }
    if (form.password.length < 10) {
      toast('Password must be at least 10 characters', 'error');
      return;
    }
    setBusyId('new');
    try {
      await api('/api/admin/staff', {
        method: 'POST',
        auth: true,
        body: {
          username: form.username.trim(),
          name: form.name.trim(),
          password: form.password,
          role: form.role,
          security_question: form.security_question.trim(),
          security_answer: form.security_answer.trim(),
        },
      });
      toast(`"${form.name.trim()}" can now sign in`, 'success');
      setForm(EMPTY_FORM);
      setShowAdd(false);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not create this account', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function setActive(row: StaffRow, active: boolean) {
    setBusyId(row.id);
    try {
      await api(`/api/admin/staff/${row.id}`, { method: 'PATCH', auth: true, body: { active } });
      toast(active ? `${row.name} restored` : `${row.name} deactivated`, 'success');
      setDeactivateTarget(null);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update this account', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function setRole(row: StaffRow, role: 'staff' | 'admin') {
    setBusyId(row.id);
    try {
      await api(`/api/admin/staff/${row.id}`, { method: 'PATCH', auth: true, body: { role } });
      toast(`${row.name} is now ${role}`, 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not change the role', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">People</span>
          <h1>Staff accounts</h1>
          <p className="small muted">Create logins for your team. Each one can reset their own password with a security question — you never have to share yours.</p>
        </div>
        <button className="btn primary" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? 'Cancel' : '+ Add staff'}
        </button>
      </div>

      {showAdd && (
        <form className="panel" onSubmit={addStaff} style={{ marginBottom: 20 }}>
          <div className="panel-body stack gap-16">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="st-username">Username</label>
                <input
                  id="st-username"
                  className="input"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.trim() }))}
                />
              </div>
              <div className="field">
                <label htmlFor="st-name">Full name</label>
                <input id="st-name" className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="st-password">Password</label>
                <input
                  id="st-password"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
                <span className="hint">At least 10 characters. They can change this later using the security question below.</span>
              </div>
              <div className="field">
                <label htmlFor="st-role">Role</label>
                <select id="st-role" className="input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as 'staff' | 'admin' }))}>
                  <option value="staff">Staff — day-to-day dashboard use</option>
                  <option value="admin">Admin — same as staff, plus Settings</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="st-question">Security question</label>
                <input
                  id="st-question"
                  className="input"
                  placeholder="e.g. আপনার প্রথম স্কুলের নাম কী?"
                  value={form.security_question}
                  onChange={(e) => setForm((f) => ({ ...f, security_question: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="st-answer">Security answer</label>
                <input
                  id="st-answer"
                  className="input"
                  value={form.security_answer}
                  onChange={(e) => setForm((f) => ({ ...f, security_answer: e.target.value }))}
                />
                <span className="hint">They'll type this themselves on "Forgot password?" — not case sensitive.</span>
              </div>
            </div>
            <button className="btn primary" type="submit" disabled={busyId === 'new'} style={{ alignSelf: 'flex-start' }}>
              {busyId === 'new' ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </form>
      )}

      {loading && !rows ? (
        <Spinner />
      ) : !rows || rows.length === 0 ? (
        <div className="panel">
          <div className="panel-body">
            <Empty icon="👤" title="No staff accounts yet" hint="Add one above to give a team member their own login." />
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Role</th>
                  <th>Last signed in</th>
                  <th>Security question</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.name}</strong>
                      <div className="tiny dim">@{row.username}</div>
                    </td>
                    <td>
                      <select
                        className="input"
                        style={{ width: 'auto', padding: '4px 8px' }}
                        value={row.role}
                        disabled={busyId === row.id}
                        onChange={(e) => setRole(row, e.target.value as 'staff' | 'admin')}
                      >
                        <option value="staff">Staff</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="small">{row.last_login_at ? relativeTime(row.last_login_at) : 'Never signed in'}</td>
                    <td className="small">
                      {row.has_security_question ? <span className="badge ok">Set</span> : <span className="badge low">Not set</span>}
                    </td>
                    <td>
                      {row.active ? (
                        <button className="btn ghost sm" disabled={busyId === row.id} onClick={() => setDeactivateTarget(row)}>
                          Deactivate
                        </button>
                      ) : (
                        <div className="stack gap-4">
                          <span className="badge low">
                            <span className="dot" /> Deactivated
                          </span>
                          <button className="btn ghost sm" disabled={busyId === row.id} onClick={() => setActive(row, true)}>
                            {busyId === row.id ? '…' : 'Restore'}
                          </button>
                        </div>
                      )}
                      <div className="tiny dim" style={{ marginTop: 4 }}>
                        Joined {dateTime(row.created_at)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deactivateTarget !== null}
        title={`Deactivate ${deactivateTarget?.name}?`}
        message="They will not be able to sign in from the next request onward. Nothing about their account or past activity is deleted, and this can be reversed any time."
        confirmLabel="Yes, deactivate"
        busy={busyId === deactivateTarget?.id}
        onConfirm={() => deactivateTarget && setActive(deactivateTarget, false)}
        onCancel={() => setDeactivateTarget(null)}
      />
    </>
  );
}
