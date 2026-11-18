import { useEffect, useRef, useState } from 'react';

const categories = ['Professional', 'Personal', 'Network'];
const statuses = ['Active', 'Inactive', 'ToContact'];
export const emptyContact = { firstName: '', lastName: '', company: '', jobTitle: '', email: '', phone: '', meetingDate: '', meetingPlace: '', mainSocialNetwork: '', photo: '', category: 'Network', relationshipStatus: 'Active', notes: '', followUpAt: '', reminderNote: '', reminderEmailEnabled: false };

const fullName = (contact) => [contact.firstName, contact.lastName].filter(Boolean).join(' ');
const dateOnly = (value) => value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium', timeZone: 'UTC' }) : 'Not provided';
const localDateTime = (value) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not scheduled';
const dateTimeInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const safePhotoUrl = (value) => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url : null; } catch { return null; }
};

function Avatar({ contact, large = false }) {
  const [failed, setFailed] = useState(false);
  const photo = safePhotoUrl(contact.photo);
  const showPhoto = photo?.origin === window.location.origin && !failed;
  const initials = `${contact.firstName?.trim().charAt(0) || ''}${contact.lastName?.trim().charAt(0) || ''}`.toUpperCase() || '?';
  return <span className={`contact-avatar${large ? ' contact-avatar--large' : ''}`} aria-hidden="true">
    {showPhoto ? <img src={photo.href} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : initials}
  </span>;
}

function Badges({ contact }) {
  return <span className="badges"><span className="badge badge--category">{contact.category}</span><span className={`badge badge--${(contact.relationshipStatus || 'Active').toLowerCase()}`}>{contact.relationshipStatus || 'Active'}</span></span>;
}

function ContactRow({ contact, onView, onEdit, onDelete }) {
  return <tr>
    <td data-label="Contact"><div className="contact-person"><Avatar contact={contact} /><div><h3><button type="button" className="contact-name-button" onClick={() => onView(contact)}>{fullName(contact)}</button></h3><small>{contact.jobTitle || 'No job title'}</small></div></div></td>
    <td data-label="Company">{contact.company || '—'}</td>
    <td data-label="Category"><span className="badge badge--category">{contact.category}</span></td>
    <td data-label="Status"><span className={`badge badge--${(contact.relationshipStatus || 'Active').toLowerCase()}`}>{contact.relationshipStatus || 'Active'}</span></td>
    <td data-label="Follow-up">{contact.followUpAt && contact.followUpStatus === 'Scheduled' ? localDateTime(contact.followUpAt) : '—'}</td>
    <td data-label="Actions"><div className="contact-row-actions"><button type="button" onClick={() => onView(contact)}>View</button><button type="button" onClick={() => onEdit(contact)}>Edit</button><button type="button" className="button-danger-text" onClick={(event) => onDelete(contact, event.currentTarget)}>Delete</button></div></td>
  </tr>;
}

function Info({ label, value }) {
  return <div className="contact-info"><dt>{label}</dt><dd>{value || 'Not provided'}</dd></div>;
}

function ContactDetail({ contact, onBack, onEdit, onDelete }) {
  const photo = safePhotoUrl(contact.photo);
  return <section className="contact-detail">
    <button type="button" className="contact-back" onClick={onBack}>← Back to contacts</button>
    <div className="panel contact-profile"><div className="contact-profile-identity"><Avatar contact={contact} large /><div><h2>{fullName(contact)}</h2><p>{[contact.jobTitle, contact.company].filter(Boolean).join(' · ') || 'Contact'}</p><Badges contact={contact} /></div></div><div className="contact-profile-actions"><button type="button" onClick={() => onEdit(contact)}>Edit</button><button type="button" className="button-danger-text" onClick={(event) => onDelete(contact, event.currentTarget)}>Delete</button></div></div>
    <div className="contact-detail-grid">
      <section className="panel"><h3>Contact information</h3><dl className="contact-info-grid"><Info label="Email" value={contact.email} /><Info label="Phone" value={contact.phone} /><Info label="Company" value={contact.company} /><Info label="Job title" value={contact.jobTitle} /><Info label="Main social network" value={contact.mainSocialNetwork} /><Info label="Meeting place" value={contact.meetingPlace} /><Info label="Meeting date" value={dateOnly(contact.meetingDate)} />{photo && <Info label="Photo URL" value={<a href={photo.href} target="_blank" rel="noopener noreferrer">Open photo</a>} />}</dl></section>
      <div className="contact-detail-stack"><section className="panel"><h3>Follow-up reminder</h3><dl><Info label="Follow-up date and time" value={localDateTime(contact.followUpAt)} /><Info label="Reminder note" value={contact.reminderNote} /><Info label="Follow-up status" value={contact.followUpAt ? contact.followUpStatus : 'Not scheduled'} /><Info label="Email notification" value={contact.reminderEmailEnabled ? contact.notificationStatus || 'Enabled' : 'Disabled'} /></dl></section><section className="panel"><h3>Notes</h3><p className="contact-notes">{contact.notes || 'No notes yet.'}</p></section></div>
    </div>
  </section>;
}

const fields = {
  personal: [['firstName', 'First name', 'text', 100, true], ['lastName', 'Last name', 'text', 100], ['photo', 'Photo URL', 'url', 2048], ['email', 'Email', 'email', 254], ['phone', 'Phone', 'tel', 40]],
  professional: [['company', 'Company', 'text', 150], ['jobTitle', 'Job title', 'text', 150], ['mainSocialNetwork', 'Main social network', 'text', 100], ['meetingPlace', 'Meeting place', 'text', 200], ['meetingDate', 'Meeting date', 'date']],
  relationship: [['followUpAt', 'Follow-up date and time', 'datetime-local']]
};

function ContactForm({ initial, save, cancel, busy, error }) {
  const [form, setForm] = useState({ ...emptyContact, ...initial, meetingDate: initial?.meetingDate?.slice(0, 10) || '', followUpAt: dateTimeInput(initial?.followUpAt) });
  const [fieldErrors, setFieldErrors] = useState({});
  const update = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setFieldErrors((current) => ({ ...current, [key]: '' })); };
  const renderField = ([key, label, type = 'text', maxLength, required]) => <label key={key} className="contact-field">{label}{required ? ' *' : ''}<input name={key} required={required} maxLength={maxLength} type={type} value={form[key] || ''} onChange={(event) => update(key, event.target.value)} aria-invalid={Boolean(fieldErrors[key])} aria-describedby={fieldErrors[key] ? `${key}-error` : undefined} />{fieldErrors[key] && <small id={`${key}-error`} className="field-error">{fieldErrors[key]}</small>}</label>;
  const submit = (event) => {
    event.preventDefault();
    if (busy) return;
    if (!form.firstName.trim()) { setFieldErrors((current) => ({ ...current, firstName: 'First name is required.' })); return; }
    if (form.reminderEmailEnabled && !form.followUpAt) { setFieldErrors((current) => ({ ...current, followUpAt: 'Schedule a follow-up before enabling email reminders.' })); return; }
    const payload = Object.fromEntries(Object.keys(emptyContact).map((key) => [key, form[key]]));
    if (initial?.followUpStatus) payload.followUpStatus = initial.followUpStatus;
    save({ ...payload, firstName: form.firstName.trim(), followUpAt: form.followUpAt ? new Date(form.followUpAt).toISOString() : null });
  };
  return <section className="contact-editor"><button type="button" className="contact-back" onClick={cancel}>← Back to contacts</button><div className="contact-editor-heading"><h2>{initial?._id ? 'Edit contact' : 'Add contact'}</h2><p>{initial?._id ? 'Update this contact’s details and follow-up.' : 'Create a new contact in your CRM.'}</p></div><form className="panel contact-form" onSubmit={submit} onInvalid={(event) => { const target = event.target; if (target.name) setFieldErrors((current) => ({ ...current, [target.name]: target.validationMessage })); }}>
    <fieldset className="contact-form-section"><legend>Personal information</legend><div className="contact-fields">{fields.personal.map(renderField)}</div></fieldset>
    <fieldset className="contact-form-section"><legend>Professional information</legend><div className="contact-fields">{fields.professional.map(renderField)}</div></fieldset>
    <fieldset className="contact-form-section"><legend>Relationship and follow-up</legend><div className="contact-fields"><label className="contact-field">Category<select value={form.category} onChange={(event) => update('category', event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label className="contact-field">Relationship status<select value={form.relationshipStatus} onChange={(event) => update('relationshipStatus', event.target.value)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>{fields.relationship.map(renderField)}<label className="contact-field">Reminder note<textarea rows="2" maxLength={1000} value={form.reminderNote || ''} onChange={(event) => update('reminderNote', event.target.value)} /></label><label className="checkbox contact-email-opt-in"><input type="checkbox" checked={Boolean(form.reminderEmailEnabled)} onChange={(event) => update('reminderEmailEnabled', event.target.checked)} /> Email reminder notification</label></div></fieldset>
    <fieldset className="contact-form-section"><legend>Notes</legend><label className="contact-field">Notes<textarea rows="4" maxLength={5000} value={form.notes || ''} onChange={(event) => update('notes', event.target.value)} /></label></fieldset>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="contact-form-actions"><button type="button" onClick={cancel} disabled={busy}>Cancel</button><button className="button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save contact'}</button></div>
  </form></section>;
}

function DeleteDialog({ contact, busy, error, onCancel, onConfirm, returnFocus }) {
  const dialog = useRef(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      queueMicrotask(() => {
        if (dialog.current?.isConnected) return;
        (returnFocus?.isConnected ? returnFocus : document.querySelector('.contact-page-header button'))?.focus?.();
      });
    };
  }, []);
  return <dialog ref={dialog} className="contact-delete-dialog" aria-labelledby="delete-title" aria-describedby="delete-description" onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id="delete-title">Delete {fullName(contact)}?</h2><p id="delete-description">This permanently deletes the contact and their follow-up reminder. This action cannot be undone.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="contact-dialog-actions"><button type="button" onClick={onCancel} disabled={busy}>Cancel</button><button type="button" className="button-danger" onClick={onConfirm} disabled={busy}>{busy ? 'Deleting…' : 'Delete contact'}</button></div>
  </dialog>;
}

export default function Contacts({ contacts, filters, setFilters, loading, selected, setSelected, editing, setEditing, feedback, onSave, onDelete, deleteTarget, setDeleteTarget, deleting, deleteError }) {
  const focusBeforeDelete = useRef(null);
  const openDelete = (contact, trigger) => { focusBeforeDelete.current = trigger; setDeleteTarget(contact); };
  if (editing) return <ContactForm key={editing === 'new' ? 'new' : editing._id} initial={editing === 'new' ? emptyContact : editing} save={onSave} cancel={() => setEditing(null)} busy={loading} error={feedback?.kind === 'error' ? feedback.text : ''} />;
  if (selected) return <>{feedback && <p className={feedback.kind} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.text}</p>}<ContactDetail contact={selected} onBack={() => setSelected(null)} onEdit={setEditing} onDelete={openDelete} />{deleteTarget && <DeleteDialog contact={deleteTarget} busy={deleting} error={deleteError} returnFocus={focusBeforeDelete.current} onCancel={() => setDeleteTarget(null)} onConfirm={onDelete} />}</>;
  const filtered = Boolean(filters.search || filters.category || filters.relationshipStatus);
  return <section className="contact-directory">
    <header className="contact-page-header"><div><h2>Contact directory</h2><p>Find, organize and follow up with your contacts.</p></div><button type="button" className="button-primary" onClick={() => setEditing('new')}>Add contact</button></header>
    <div className="contact-filters"><label>Search by name<input type="search" placeholder="Search by name" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></label><label>Category<select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}><option value="">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Relationship status<select value={filters.relationshipStatus} onChange={(event) => setFilters({ ...filters, relationshipStatus: event.target.value })}><option value="">All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label></div>
    {feedback && <p className={feedback.kind} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.text}</p>}
    {loading ? <p className="contact-state" role="status">Loading contacts…</p> : contacts.length ? <div className="contact-table-wrap"><table className="contact-table"><thead><tr><th scope="col">Contact</th><th scope="col">Company</th><th scope="col">Category</th><th scope="col">Status</th><th scope="col">Follow-up</th><th scope="col">Actions</th></tr></thead><tbody>{contacts.map((contact) => <ContactRow key={contact._id} contact={contact} onView={setSelected} onEdit={setEditing} onDelete={openDelete} />)}</tbody></table><p className="contact-table-count">{contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'} shown</p></div> : <div className="panel contact-state"><h3>No contacts found.</h3><p>{filtered ? 'Try a different search or filter.' : 'Add your first contact to get started.'}</p></div>}
    {deleteTarget && <DeleteDialog contact={deleteTarget} busy={deleting} error={deleteError} returnFocus={focusBeforeDelete.current} onCancel={() => setDeleteTarget(null)} onConfirm={onDelete} />}
  </section>;
}
