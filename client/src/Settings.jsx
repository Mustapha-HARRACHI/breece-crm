import { useEffect, useState } from 'react';

const verificationMessage = (reason) => {
  if (reason === 'cancelled') return 'Google verification did not complete. You can try again.';
  if (reason === 'identity') return 'The Google account did not match this CRM account. Try again with the correct account.';
  return reason ? 'Google verification failed. Please try again.' : '';
};

export default function PrivacySettings({ user, onDeleted, onLogout }) {
  const [section, setSection] = useState('privacy');
  const [exportBusy, setExportBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [exportFeedback, setExportFeedback] = useState(null);
  const [deleteFeedback, setDeleteFeedback] = useState(() => {
    const reason = new URLSearchParams(window.location.search).get('googleDeleteError');
    return reason ? { kind: 'error', text: verificationMessage(reason) } : null;
  });
  const [sessionFeedback, setSessionFeedback] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [googleVerified, setGoogleVerified] = useState(() => new URLSearchParams(window.location.search).get('googleDeleteVerified') === '1');

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('googleDeleteError') && !url.searchParams.has('googleDeleteVerified')) return;
    url.searchParams.delete('googleDeleteError');
    url.searchParams.delete('googleDeleteVerified');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const download = async () => {
    setExportBusy(true);
    setExportFeedback(null);
    try {
      const response = await fetch('/api/privacy/export', { credentials: 'include' });
      if (!response.ok) throw new Error('Unable to export your data. Please try again.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'breece-crm-data.json';
      link.click();
      URL.revokeObjectURL(url);
      setExportFeedback({ kind: 'success', text: 'Your data download has started.' });
    } catch {
      setExportFeedback({ kind: 'error', text: 'Unable to export your data. Please try again.' });
    } finally { setExportBusy(false); }
  };

  const remove = async (event) => {
    event.preventDefault();
    setDeleteFeedback(null);
    if (confirmation !== 'DELETE MY ACCOUNT') return setDeleteFeedback({ kind: 'error', text: 'Type DELETE MY ACCOUNT to confirm.' });
    if (user.googleLinked && !googleVerified) return setDeleteFeedback({ kind: 'error', text: 'Verify your identity with Google first.' });
    if (!window.confirm('This permanently deletes your account, contacts, objectives and reminders. Continue?')) return;
    setDeleteBusy(true);
    try {
      const csrf = document.cookie.match(/(?:^|; )csrfToken=([^;]+)/)?.[1];
      const body = { confirmation };
      if (user.googleLinked) body.googleVerified = true;
      else body.currentPassword = password;
      const response = await fetch('/api/privacy/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf || '' },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (response.status === 401 && data.error === 'Fresh Google verification is required') setGoogleVerified(false);
        throw new Error(data.error || 'Account deletion failed. Please try again.');
      }
      onDeleted();
    } catch (error) { setDeleteFeedback({ kind: 'error', text: error.message || 'Account deletion failed. Please try again.' }); }
    finally { setDeleteBusy(false); }
  };

  const signOut = async () => {
    setSignOutBusy(true);
    setSessionFeedback(null);
    try { await onLogout(); }
    catch { setSessionFeedback({ kind: 'error', text: 'Unable to sign out. Please try again.' }); }
    finally { setSignOutBusy(false); }
  };

  return <section className="settings-page">
    <div className="section-intro"><h2>Account settings</h2><p>Manage your data, privacy and current session.</p></div>
    <nav className="settings-nav" aria-label="Settings sections">
      <button type="button" aria-current={section === 'privacy' ? 'page' : undefined} onClick={() => setSection('privacy')}>Privacy &amp; Data</button>
      <button type="button" aria-current={section === 'cookies' ? 'page' : undefined} onClick={() => setSection('cookies')}>Cookies &amp; Sessions</button>
    </nav>

    {section === 'privacy' ? <div className="settings-sections">
      <section className="panel settings-card" aria-labelledby="privacy-title">
        <div className="settings-card-heading"><h2 id="privacy-title">Privacy &amp; Data</h2><p>Download a copy of the information stored in your CRM.</p></div>
        <div className="settings-feature"><span className="settings-feature-icon" aria-hidden="true">↓</span><div><h3>Download your data</h3><p>Your JSON export includes your profile, owned contacts, notes, reminder details and monthly objectives. Password hashes, security credentials and tokens are excluded.</p><button type="button" disabled={exportBusy} onClick={download}>{exportBusy ? 'Preparing download…' : 'Download my data'}</button>{exportFeedback && <p className={exportFeedback.kind} role={exportFeedback.kind === 'error' ? 'alert' : 'status'}>{exportFeedback.text}</p>}</div></div>
      </section>
      <section className="panel settings-card settings-danger" aria-labelledby="delete-title">
        <div className="settings-card-heading"><h2 id="delete-title">Delete account</h2><p>Danger zone · Permanent and irreversible</p></div>
        <p>Deleting your account removes your profile, contacts, objectives and associated reminder information. This cannot be undone.</p>
        <form className="settings-delete-form" onSubmit={remove} noValidate>
          {user.googleLinked ? <div className="settings-verification"><p>Fresh Google identity verification is required before deletion.</p><button type="button" disabled={deleteBusy || googleVerified} onClick={() => { window.location.href = '/api/privacy/account/google'; }}>{googleVerified ? 'Google identity verified' : 'Verify with Google'}</button>{googleVerified && <small>Verification expires after five minutes. Complete deletion promptly.</small>}</div>
            : <label htmlFor="delete-password">Current password<input id="delete-password" type="password" autoComplete="current-password" placeholder="Current password" value={password} disabled={deleteBusy} onChange={(event) => setPassword(event.target.value)} /></label>}
          <label htmlFor="delete-confirmation">Type DELETE MY ACCOUNT to confirm<input id="delete-confirmation" type="text" autoComplete="off" placeholder="Type DELETE MY ACCOUNT" value={confirmation} disabled={deleteBusy} onChange={(event) => setConfirmation(event.target.value)} /></label>
          <button className="button-danger" type="submit" disabled={deleteBusy}>{deleteBusy ? 'Deleting account…' : 'Delete my account'}</button>
        </form>
        {deleteFeedback && <p className={deleteFeedback.kind} role={deleteFeedback.kind === 'error' ? 'alert' : 'status'}>{deleteFeedback.text}</p>}
        <small>Deletion requires explicit confirmation, identity verification and a final confirmation prompt.</small>
      </section>
    </div> : <div className="settings-sections">
      <section className="panel settings-card" aria-labelledby="cookies-title"><div className="settings-card-heading"><h2 id="cookies-title">Cookies &amp; Sessions</h2><p>How essential cookies keep your CRM session working.</p></div>
        <div className="settings-cookie-list"><div><h3>Authentication session</h3><p>Your <code>session</code> cookie is HttpOnly and expires after 7 days. It is sent only over HTTPS in production.</p></div><div><h3>Security verification</h3><p>A separate <code>csrfToken</code> cookie protects account-changing privacy actions. A short-lived HttpOnly OAuth state cookie is used during Google sign-in and identity verification.</p></div><div><h3>Optional cookies</h3><p>BREECE CRM currently uses no analytics, advertising or tracking cookies. Essential authentication cookies are required to use the CRM.</p></div></div>
      </section>
      <section className="panel settings-card settings-session" aria-labelledby="session-title"><div className="settings-card-heading"><h2 id="session-title">Current session</h2><p>Sign out of this browser when you are finished.</p></div><button type="button" disabled={signOutBusy} onClick={signOut}>{signOutBusy ? 'Signing out…' : 'Sign out of this session'}</button>{sessionFeedback && <p className={sessionFeedback.kind} role="alert">{sessionFeedback.text}</p>}</section>
    </div>}
  </section>;
}
