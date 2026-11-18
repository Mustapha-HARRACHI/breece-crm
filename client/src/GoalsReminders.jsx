import { useEffect, useState } from 'react';

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (month) => month ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`)) : 'selected month';
const localDate = (date) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));

function ReminderCard({ item, overdue, busy, onChange }) {
  const name = [item.firstName, item.lastName].filter(Boolean).join(' ');
  const emailStatus = item.reminderEmailEnabled ? (item.notificationStatus || 'Pending') : 'Disabled';
  return <article className={`reminder-card${overdue ? ' reminder-card--overdue' : ''}`}>
    <div className="reminder-card-top"><div><h4>{name}</h4><p>{item.reminderNote || 'No reminder note'}</p></div><span className={`badge ${overdue ? 'badge--overdue' : 'badge--upcoming'}`}>{overdue ? 'Overdue' : 'Upcoming'}</span></div>
    <p className="reminder-datetime"><span aria-hidden="true">◷</span> <time dateTime={item.followUpAt}>{localDate(item.followUpAt)}</time> <small>(local time)</small></p>
    <div className="reminder-meta"><span>Follow-up: <strong>{item.followUpStatus}</strong></span><span>Notification: <strong>{emailStatus}</strong></span></div>
    <div className="reminder-card-footer"><label className="checkbox"><input type="checkbox" checked={Boolean(item.reminderEmailEnabled)} disabled={busy} onChange={(event) => onChange(item._id, { reminderEmailEnabled: event.target.checked }, 'Email preference updated.')} /> Email notification</label>
      <div className="reminder-actions"><button type="button" disabled={busy} onClick={() => onChange(item._id, { followUpStatus: 'Completed' }, 'Reminder completed.')}>Complete</button><button type="button" disabled={busy} onClick={() => onChange(item._id, { followUpAt: new Date(new Date(item.followUpAt).getTime() + 86400000).toISOString() }, 'Reminder postponed by one day.')}>Postpone 1 day</button><button type="button" className="button-danger-text" disabled={busy} onClick={() => onChange(item._id, { followUpStatus: 'Cancelled' }, 'Reminder cancelled.')}>Cancel</button></div>
    </div>
  </article>;
}

export default function GoalsReminders() {
  const [goals, setGoals] = useState([]);
  const [reminders, setReminders] = useState({ upcoming: [], overdue: [] });
  const [month, setMonth] = useState(currentMonth);
  const [target, setTarget] = useState(10);
  const [editing, setEditing] = useState(false);
  const [editTarget, setEditTarget] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const responses = await Promise.all(['/api/goals', '/api/reminders?status=upcoming', '/api/reminders?status=overdue'].map((url) => fetch(url, { credentials: 'include' })));
      if (responses.some((response) => !response.ok)) throw new Error('Unable to load goals and reminders.');
      const [goalData, upcomingData, overdueData] = await Promise.all(responses.map((response) => response.json()));
      setGoals(goalData.goals);
      setReminders({ upcoming: upcomingData.reminders, overdue: overdueData.reminders });
      setLoaded(true);
      return true;
    } catch {
      setFeedback({ kind: 'error', text: 'Unable to load goals and reminders.' });
      return false;
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const goal = goals.find((item) => item.month === month);
  const request = async (url, method, body, successText) => {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, credentials: 'include', body: body ? JSON.stringify(body) : undefined });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'Unable to save changes.'); }
      if (!await load()) return false;
      setFeedback({ kind: 'success', text: successText });
      return true;
    } catch (error) { setFeedback({ kind: 'error', text: error.message }); return false; }
    finally { setBusy(false); }
  };
  const validTarget = (value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100000 && String(value).trim() !== '';
  const createGoal = async (event) => {
    event.preventDefault();
    if (!month || !validTarget(target)) return setFeedback({ kind: 'error', text: 'Choose a month and a target from 1 to 100,000.' });
    await request('/api/goals', 'POST', { month, target: Number(target) }, 'Objective saved.');
  };
  const saveGoal = async (event) => {
    event.preventDefault();
    if (!validTarget(editTarget)) return setFeedback({ kind: 'error', text: 'Enter a target from 1 to 100,000.' });
    if (await request(`/api/goals/${goal._id}`, 'PATCH', { target: Number(editTarget) }, 'Objective updated.')) setEditing(false);
  };
  const deleteGoal = async () => {
    if (!window.confirm(`Delete the objective for ${monthLabel(goal.month)}?`)) return;
    if (await request(`/api/goals/${goal._id}`, 'DELETE', null, 'Objective deleted.')) setEditing(false);
  };
  const updateReminder = (id, body, message) => request(`/api/contacts/${id}/reminder`, 'PATCH', body, message);

  return <section className="goals-page">
    <div className="section-intro"><div><h2>Goals &amp; Reminders</h2><p>Track monthly contact growth and manage scheduled follow-ups.</p></div></div>
    {feedback && <p role={feedback.kind === 'error' ? 'alert' : 'status'} className={feedback.kind}>{feedback.text}</p>}
    {loading && <p role="status">Loading goals and reminders…</p>}
    {!loading && !loaded && <button type="button" onClick={load}>Retry</button>}
    {!loading && loaded && <>
      <div className="goals-summary">
        <div className="analytics-kpi"><span>Target for {monthLabel(month)}</span><strong>{goal ? goal.target : '—'}</strong><small>{goal ? 'New contacts' : 'No objective set'}</small></div>
        <div className="analytics-kpi"><span>Contacts achieved</span><strong>{goal ? goal.current : '—'}</strong><small>{goal ? 'Created in this month' : 'Set an objective to track progress'}</small></div>
        <div className="analytics-kpi"><span>Scheduled reminders</span><strong>{reminders.upcoming.length + reminders.overdue.length}</strong><small>{reminders.overdue.length} overdue</small></div>
      </div>
      <section className="panel goal-main">
        <div className="analytics-panel-heading"><h3>Monthly objective</h3><p>One contact-growth objective per month</p></div>
        <label className="goal-month-field" htmlFor="goal-month">Select month<input id="goal-month" type="month" value={month} onChange={(event) => { setMonth(event.target.value); setEditing(false); setFeedback(null); }} /></label>
        {goal ? <div className="goal-progress-area">
          <div className="goal-progress-heading"><strong>{goal.current} / {goal.target} contacts</strong><span>{goal.percentage}% complete</span></div>
          <progress max="100" value={goal.percentage} aria-label={`Objective progress for ${monthLabel(goal.month)}`} />
          <div className="goal-progress-details"><span>Target <strong>{goal.target}</strong></span><span>Achieved <strong>{goal.current}</strong></span><span>Remaining <strong>{Math.max(goal.target - goal.current, 0)}</strong></span></div>
          {editing ? <form className="goal-edit-form" onSubmit={saveGoal}><label htmlFor="goal-edit-target">New target<input id="goal-edit-target" type="number" min="1" max="100000" step="1" required value={editTarget} onChange={(event) => setEditTarget(event.target.value)} /></label><button className="button-primary" type="submit" disabled={busy}>Save target</button><button type="button" onClick={() => setEditing(false)} disabled={busy}>Cancel edit</button></form>
            : <div className="actions"><button type="button" onClick={() => { setEditTarget(String(goal.target)); setEditing(true); }} disabled={busy}>Edit target</button><button type="button" className="button-danger-text" onClick={deleteGoal} disabled={busy}>Delete objective</button></div>}
        </div> : <form className="goal-create-form" onSubmit={createGoal}><p>No objective for {monthLabel(month)}. Set a target to start tracking progress.</p><label htmlFor="goal-target">Monthly target<input id="goal-target" type="number" min="1" max="100000" step="1" required value={target} onChange={(event) => setTarget(event.target.value)} /></label><button className="button-primary" type="submit" disabled={busy || !month}>Set objective</button></form>}
      </section>
      <section className="panel goal-history"><div className="analytics-panel-heading"><h3>Objective history</h3><p>Your saved monthly targets and actual contact counts</p></div>{goals.length ? <ul>{goals.map((item) => <li key={item._id}><span>{monthLabel(item.month)}</span><strong>{item.current} / {item.target} contacts</strong><span>{item.percentage}%</span></li>)}</ul> : <p className="analytics-empty">No objectives yet.</p>}</section>
      <div className="reminder-grid">{['upcoming', 'overdue'].map((status) => <section className="panel reminder-section" key={status}>
        <div className="reminder-section-heading"><h3>{status === 'upcoming' ? 'Upcoming reminders' : 'Overdue reminders'} <span className={`badge ${status === 'overdue' ? 'badge--overdue' : 'badge--upcoming'}`}>{reminders[status].length}</span></h3></div>
        {reminders[status].length ? <div className="reminder-list">{reminders[status].map((item) => <ReminderCard key={item._id} item={item} overdue={status === 'overdue'} busy={busy} onChange={updateReminder} />)}</div> : <p className="analytics-empty">No {status} reminders.</p>}
      </section>)}</div>
    </>}
  </section>;
}
