import { useState } from 'react';

function Distribution({ title, description, items, total }) {
  return <section className="panel analytics-panel">
    <div className="analytics-panel-heading"><h3>{title}</h3><p>{description}</p></div>
    {items.length ? <div className="distribution-list">{items.map((item) => <div className="distribution-row" key={item._id}>
      <div className="distribution-label"><span>{item._id || 'Not specified'}</span><strong>{item.count}</strong></div>
      <div className="distribution-track" role="img" aria-label={`${item._id || 'Not specified'}: ${item.count} of ${total} contacts`}><span style={{ width: `${item.count / total * 100}%` }} /></div>
    </div>)}</div> : <p className="analytics-empty">No data for this period.</p>}
  </section>;
}

export default function Statistics({ data, range, setRange, load, loading, error }) {
  const [validation, setValidation] = useState('');
  const apply = (event) => {
    event.preventDefault();
    if (range.from && range.to && range.from > range.to) { setValidation('The start date must not be after the end date.'); return; }
    setValidation('');
    load();
  };
  const clear = () => { const empty = { from: '', to: '' }; setValidation(''); setRange(empty); load(empty); };
  const total = data?.total ?? 0;
  const categories = data?.categories || [];
  const monthly = data?.monthly || [];
  const places = data?.meetingPlaces || [];
  const max = Math.max(1, ...monthly.map((item) => item.count));
  return <section className="analytics-page">
    <div className="section-intro"><div><h2>Contact statistics</h2><p>Understand how your contact network is growing.</p></div></div>
    <form className="date-filter analytics-filter" onSubmit={apply}>
      <div className="analytics-filter-title"><strong>Creation date</strong><span>Filter contacts by when they were added</span></div>
      <label htmlFor="stats-from">From<input id="stats-from" type="date" value={range.from} onChange={(event) => { setValidation(''); setRange({ ...range, from: event.target.value }); }} /></label>
      <label htmlFor="stats-to">To<input id="stats-to" type="date" value={range.to} onChange={(event) => { setValidation(''); setRange({ ...range, to: event.target.value }); }} /></label>
      <button className="button-primary" type="submit" disabled={loading}>Apply</button>
      {(range.from || range.to) && <button type="button" onClick={clear} disabled={loading}>Clear</button>}
    </form>
    {validation && <p className="error" role="alert">{validation}</p>}
    {error && <p className="error" role="alert">{error} <button type="button" onClick={() => load()}>Retry</button></p>}
    {loading && <p className="analytics-loading" role="status">Loading statistics…</p>}
    {!loading && !error && data && <>
      <div className="analytics-kpis">
        <div className="analytics-kpi"><span>Total contacts</span><strong>{total}</strong><small>Created in the selected period</small></div>
        <div className="analytics-kpi"><span>To contact</span><strong>{data.followUps}</strong><small>Contacts marked for follow-up</small></div>
        <div className="analytics-kpi"><span>Categories</span><strong>{categories.length}</strong><small>Categories represented</small></div>
      </div>
      {total ? <div className="analytics-grid">
        <section className="panel analytics-panel analytics-monthly">
          <div className="analytics-panel-heading"><h3>Contacts created by month</h3><p>New contacts each month in the selected period</p></div>
          <div className="monthly-chart" role="img" aria-label={monthly.map((item) => `${item._id}: ${item.count} contacts`).join(', ')}>
            <div className="monthly-axis"><span>{max}</span><span>{Math.round(max / 2)}</span><span>0</span></div>
            <div className="monthly-plot">{monthly.map((item) => <div className="monthly-column" key={item._id} title={`${item._id}: ${item.count} contacts`}>
              <strong>{item.count}</strong><div className="monthly-bar-track"><span style={{ height: `${Math.max(4, item.count / max * 100)}%` }} /></div><small>{item._id}</small>
            </div>)}</div>
          </div>
        </section>
        <Distribution title="Contacts by category" description="Share of contacts in each category" items={categories} total={total} />
        <Distribution title="Meeting places" description="Top places, with remaining places grouped as Others" items={places} total={total} />
      </div> : <section className="panel analytics-empty-state"><h3>No contacts in this period</h3><p>No contacts match this date range.</p></section>}
    </>}
  </section>;
}
