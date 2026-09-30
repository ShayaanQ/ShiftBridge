import { FormEvent, useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';
type User = { id: string; name: string; email: string; role: 'EMPLOYEE' | 'MANAGER' };
type Session = { accessToken: string; user: User };
type Shift = { id: string; startAt: string; endAt: string };
type Posting = { id: string; shiftId: string; status: string; shift: { startAt: string; endAt: string; assignedUser: { name: string; email: string } } };
type Claim = { id: string; status: string; posting: { id: string; shiftId: string; shift: { startAt: string; endAt: string; assignedUser: { name: string; email: string } } }; claimant: { name: string; email: string } };

function readSession(): Session | null { try { return JSON.parse(localStorage.getItem('shiftbridge-session') || 'null'); } catch { return null; } }
function date(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
function duration(start: string, end: string) { return `${Math.round((new Date(end).getTime() - new Date(start).getTime()) / 3_600_000)}h`; }
function asApiError(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong'; }

async function api<T>(session: Session | null, path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}), ...options.headers } });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(Array.isArray(body.message) ? body.message.join(', ') : body.message || 'Request failed'); }
  return response.json();
}

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [email, setEmail] = useState('employee.a@shiftbridge.demo'); const [password, setPassword] = useState('demo-password'); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setLoading(true); setError(''); try { const session = await api<Session>(null, '/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); localStorage.setItem('shiftbridge-session', JSON.stringify(session)); onLogin(session); } catch (err) { setError(asApiError(err)); } finally { setLoading(false); } }
  return <main className="login-shell"><section className="login-intro"><div className="brand">ShiftBridge</div><h1>Shifts, coordinated.</h1><p>A focused workspace for employees to exchange coverage and for managers to approve it with clarity.</p><div className="login-note">Demo accounts are listed in the README.</div></section><form className="login-card" onSubmit={submit}><p className="eyebrow">DEMO ACCESS</p><h2>Welcome back</h2><label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label><label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>{error && <p className="error">{error}</p>}<button disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button></form></main>;
}

function EmployeeDashboard({ session, notify }: { session: Session; notify: (message: string, error?: boolean) => void }) {
  const [shifts, setShifts] = useState<Shift[]>([]); const [postings, setPostings] = useState<Posting[]>([]); const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); try { const [mine, available] = await Promise.all([api<Shift[]>(session, '/shifts/me'), api<Posting[]>(session, '/shift-postings/available')]); setShifts(mine); setPostings(available); } catch (e) { notify(asApiError(e), true); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  async function post(shiftId: string) { try { await api(session, '/shift-postings', { method: 'POST', body: JSON.stringify({ shiftId }) }); notify('Shift posted for coworker claims.'); load(); } catch (e) { notify(asApiError(e), true); } }
  async function claim(postingId: string) { try { await api(session, `/shift-postings/${postingId}/claim`, { method: 'POST' }); notify('Claim submitted for manager approval.'); load(); } catch (e) { notify(asApiError(e), true); } }
  return <><PageTitle title="Employee dashboard" description="Manage your scheduled coverage and see open opportunities." /><div className="grid two"><section className="panel"><div className="panel-head"><h2>My schedule</h2><span>{shifts.length} shifts</span></div>{loading ? <Loading /> : <div className="list">{shifts.map(shift => <div className="row" key={shift.id}><div><strong>{date(shift.startAt)}</strong><small>{duration(shift.startAt, shift.endAt)} scheduled shift</small></div>{new Date(shift.startAt) > new Date() && <button className="secondary" onClick={() => post(shift.id)}>Post shift</button>}</div>)}{!shifts.length && <Empty text="No assigned shifts yet." />}</div>}</section><section className="panel"><div className="panel-head"><h2>Available shifts</h2><span>{postings.length} open</span></div>{loading ? <Loading /> : <div className="list">{postings.map(posting => <div className="row" key={posting.id}><div><strong>{date(posting.shift.startAt)}</strong><small>{posting.shift.assignedUser.name} · {duration(posting.shift.startAt, posting.shift.endAt)}</small></div><button onClick={() => claim(posting.id)}>Claim</button></div>)}{!postings.length && <Empty text="No coworker shifts are open right now." />}</div>}</section></div></>;
}

function Availability({ session, notify }: { session: Session; notify: (message: string, error?: boolean) => void }) {
  const [windows, setWindows] = useState<any[]>([]); const [startAt, setStartAt] = useState('2026-10-05T08:00'); const [endAt, setEndAt] = useState('2026-10-05T18:00');
  async function load() { try { setWindows(await api(session, '/availability')); } catch (e) { notify(asApiError(e), true); } } useEffect(() => { load(); }, []);
  async function submit(event: FormEvent) { event.preventDefault(); try { await api(session, '/availability', { method: 'POST', body: JSON.stringify({ startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString() }) }); notify('Availability window added.'); load(); } catch (e) { notify(asApiError(e), true); } }
  return <><PageTitle title="Availability" description="Claims require a window that covers the entire shift." /><div className="grid two"><form className="panel form" onSubmit={submit}><h2>Add availability</h2><label>Start<input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} required /></label><label>End<input type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} required /></label><button>Add window</button></form><section className="panel"><h2>Your windows</h2><div className="list">{windows.map(window => <div className="row" key={window.id}><div><strong>{date(window.startAt)}</strong><small>through {date(window.endAt)}</small></div></div>)}{!windows.length && <Empty text="No availability windows yet." />}</div></section></div></>;
}

function Notifications({ session, notify }: { session: Session; notify: (message: string, error?: boolean) => void }) { const [items, setItems] = useState<any[]>([]); useEffect(() => { api<any[]>(session, '/notifications').then(setItems).catch(e => notify(asApiError(e), true)); }, []); return <><PageTitle title="Notifications" description="Approval and rejection updates appear here." /><section className="panel"><div className="list">{items.map(item => <div className="row" key={item.id}><div><strong>{item.message}</strong><small>{date(item.createdAt)}</small></div><span className={item.read ? 'badge subtle' : 'badge'}>{item.read ? 'Read' : 'New'}</span></div>)}{!items.length && <Empty text="No notifications yet." />}</div></section></>; }

function ManagerDashboard({ session, notify }: { session: Session; notify: (message: string, error?: boolean) => void }) {
  const [csv, setCsv] = useState('employee.a@shiftbridge.demo,2026-10-08T09:00:00Z,2026-10-08T17:00:00Z'); const [claims, setClaims] = useState<Claim[]>([]); const [audit, setAudit] = useState<any[]>([]);
  async function load() { try { const [pending, events] = await Promise.all([api<Claim[]>(session, '/manager/claims/pending'), api<any[]>(session, '/manager/audit')]); setClaims(pending); setAudit(events); } catch (e) { notify(asApiError(e), true); } } useEffect(() => { load(); }, []);
  async function importCsv(event: FormEvent) { event.preventDefault(); try { const result = await api<{ created: number }>(session, '/manager/schedule-import', { method: 'POST', body: JSON.stringify({ csv }) }); notify(`${result.created} shift${result.created === 1 ? '' : 's'} imported.`); load(); } catch (e) { notify(asApiError(e), true); } }
  async function decide(id: string, action: 'approve' | 'reject') { try { await api(session, `/manager/claims/${id}/${action}`, { method: 'POST' }); notify(`Claim ${action}d.`); load(); } catch (e) { notify(asApiError(e), true); } }
  return <><PageTitle title="Manager dashboard" description="Import schedules, decide pending claims, and review the audit trail." /><div className="grid manager-grid"><form className="panel form" onSubmit={importCsv}><p className="eyebrow">SCHEDULE IMPORT</p><h2>Paste CSV</h2><label>employeeEmail,startAt,endAt<textarea value={csv} onChange={e => setCsv(e.target.value)} rows={5} /></label><button>Import schedule</button></form><section className="panel"><div className="panel-head"><h2>Pending approvals</h2><span>{claims.length} pending</span></div><div className="list">{claims.map(claim => <div className="row claim" key={claim.id}><div><strong>{date(claim.posting.shift.startAt)}</strong><small>{claim.posting.shift.assignedUser.name} → {claim.claimant.name}</small></div><div className="actions"><button onClick={() => decide(claim.id, 'approve')}>Approve</button><button className="danger" onClick={() => decide(claim.id, 'reject')}>Reject</button></div></div>)}{!claims.length && <Empty text="No claims await review." />}</div></section></div><section className="panel audit"><div className="panel-head"><h2>Audit history</h2><span>Newest first</span></div><div className="table"><div className="table-head"><span>When</span><span>Action</span><span>Actor</span><span>Entity</span></div>{audit.map(event => <div className="table-row" key={`${event.entityId}-${event.createdAt}`}><span>{date(event.createdAt)}</span><span><b>{event.action}</b></span><span>{event.actor.name}</span><span>{event.entityType}</span></div>)}{!audit.length && <Empty text="No audit events yet." />}</div></section></>;
}

function PageTitle({ title, description }: { title: string; description: string }) { return <header className="page-title"><p className="eyebrow">SHIFTBRIDGE</p><h1>{title}</h1><p>{description}</p></header>; }
function Loading() { return <p className="muted">Loading…</p>; }
function Empty({ text }: { text: string }) { return <p className="muted empty">{text}</p>; }

export default function App() {
  const [session, setSession] = useState<Session | null>(readSession()); const [page, setPage] = useState('dashboard'); const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const notify = (text: string, error = false) => { setNotice({ text, error }); window.setTimeout(() => setNotice(null), 4000); };
  if (!session) return <Login onLogin={setSession} />;
  const activeSession = session;
  const manager = activeSession.user.role === 'MANAGER'; const nav = manager ? [['dashboard', 'Manager dashboard'], ['audit', 'Audit history']] : [['dashboard', 'Dashboard'], ['availability', 'Availability'], ['notifications', 'Notifications']];
  function content() { if (manager) return <ManagerDashboard session={activeSession} notify={notify} />; if (page === 'availability') return <Availability session={activeSession} notify={notify} />; if (page === 'notifications') return <Notifications session={activeSession} notify={notify} />; return <EmployeeDashboard session={activeSession} notify={notify} />; }
  return <div className="app-shell"><aside><div className="brand">ShiftBridge</div><p className="workspace">Shift exchange workspace</p><nav>{nav.map(([id, label]) => <button key={id} className={page === id ? 'nav-active' : ''} onClick={() => setPage(id)}>{label}</button>)}</nav><div className="profile"><strong>{activeSession.user.name}</strong><small>{activeSession.user.role.toLowerCase()}</small><button onClick={() => { localStorage.removeItem('shiftbridge-session'); setSession(null); }}>Sign out</button></div></aside><main className="content">{notice && <div className={notice.error ? 'toast error' : 'toast'}>{notice.text}</div>}{content()}</main></div>;
}
