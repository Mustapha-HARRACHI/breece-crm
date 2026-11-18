import { useState } from 'react';

const oauthMessages = {
  cancelled: 'Google sign-in was cancelled. You can try again or log in with email.',
  'account-exists': 'This email is already registered. Log in with your password instead.',
  invalid: 'Google sign-in could not be verified. Please try again.'
};

const screenCopy = {
  login: ['Welcome back', 'Log in to manage your contacts and follow-ups.'],
  register: ['Create an account', 'Start organizing your contacts in one place.'],
  forgot: ['Forgot password?', 'Enter your email and we’ll send a reset link if an account exists.'],
  reset: ['Reset password', 'Choose a new password for your account.']
};

function PasswordField({ id, label, value, onChange, autocomplete, visible, onToggle }) {
  return <div className="auth-field">
    <label htmlFor={id}>{label}</label>
    <div className="password-control">
      <input id={id} required minLength={8} maxLength={128} type={visible ? 'text' : 'password'} placeholder={label} autoComplete={autocomplete} value={value} onChange={onChange} />
      <button type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={onToggle}>{visible ? 'Hide' : 'Show'}</button>
    </div>
  </div>;
}

export default function Auth({ onUser }) {
  const params = new URLSearchParams(window.location.search);
  const [mode, setMode] = useState(params.has('resetToken') ? 'reset' : 'login');
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', token: params.get('resetToken') || '' });
  const [feedback, setFeedback] = useState(() => params.has('oauthError') ? { kind: 'error', text: oauthMessages[params.get('oauthError')] || 'Google sign-in could not be completed. Please try again.' } : null);
  const [visible, setVisible] = useState({ password: false, confirm: false });
  const [busy, setBusy] = useState(false);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const navigate = (nextMode) => {
    if (mode === 'reset' || window.location.search.includes('oauthError=')) window.history.replaceState({}, '', '/');
    setMode(nextMode);
    setFeedback(null);
    setForm((current) => ({ ...current, password: '', confirm: '', token: nextMode === 'reset' ? current.token : '' }));
    setVisible({ password: false, confirm: false });
  };

  const submit = async (event) => {
    event.preventDefault();
    setFeedback(null);
    if ((mode === 'register' || mode === 'reset') && form.password !== form.confirm) {
      setFeedback({ kind: 'error', text: 'Passwords do not match.' });
      return;
    }
    setBusy(true);
    const endpoint = mode === 'forgot' ? 'forgot-password' : mode === 'reset' ? 'reset-password' : mode;
    const body = mode === 'forgot' ? { email: form.email }
      : mode === 'reset' ? { token: form.token, password: form.password }
        : mode === 'register' ? { name: form.name, email: form.email, password: form.password }
          : { email: form.email, password: form.password };
    try {
      const response = await fetch(`/api/auth/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok) {
        setFeedback({ kind: 'error', text: data.error || 'Request failed. Please try again.' });
        return;
      }
      if (mode === 'forgot') {
        setFeedback({ kind: 'success', text: data.message });
      } else if (mode === 'reset') {
        navigate('login');
        setFeedback({ kind: 'success', text: 'Password reset successfully. You can now log in.' });
      } else {
        onUser(data.user);
      }
    } catch {
      setFeedback({ kind: 'error', text: 'Unable to connect. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const [title, description] = screenCopy[mode];
  return <main className="auth-page">
    <section className="auth-brand" aria-label="About BREECE CRM">
      <div className="auth-brand-name"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>BREECE <strong>CRM</strong></div>
      <div className="auth-brand-copy"><span className="auth-eyebrow">Your relationships, organized</span><h1>Make every connection count.</h1><p>Keep your contacts in one place, plan follow-ups, and stay focused on the relationships that matter.</p></div>
      <div className="auth-brand-foot">Contacts · Follow-ups · Goals</div>
    </section>
    <section className="auth-workspace" aria-label={`${title} form`}>
      <div className="auth-mobile-brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>BREECE <strong>CRM</strong></div>
      <form className="panel auth-form" onSubmit={submit} aria-busy={busy}>
        <div className="auth-heading"><h2>{mode === 'login' ? 'Log in' : title}</h2><p>{description}</p></div>
        {mode === 'register' && <div className="auth-field"><label htmlFor="auth-name">Full name</label><input id="auth-name" required maxLength={120} autoComplete="name" placeholder="Name" value={form.name} onChange={(event) => update('name', event.target.value)} /></div>}
        {mode !== 'reset' && <div className="auth-field"><label htmlFor="auth-email">Email</label><input id="auth-email" required type="email" autoComplete="email" placeholder="Email" value={form.email} onChange={(event) => update('email', event.target.value)} /></div>}
        {mode !== 'forgot' && <PasswordField id="auth-password" label={mode === 'reset' ? 'New password' : 'Password'} autocomplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={(event) => update('password', event.target.value)} visible={visible.password} onToggle={() => setVisible((current) => ({ ...current, password: !current.password }))} />}
        {(mode === 'register' || mode === 'reset') && <><PasswordField id="auth-confirm" label={mode === 'reset' ? 'Confirm password' : 'Confirm password'} autocomplete="new-password" value={form.confirm} onChange={(event) => update('confirm', event.target.value)} visible={visible.confirm} onToggle={() => setVisible((current) => ({ ...current, confirm: !current.confirm }))} /><p className="auth-hint">Use a password of 8–128 characters.</p></>}
        {mode === 'login' && <div className="auth-inline"><button type="button" className="auth-text-action" onClick={() => navigate('forgot')}>Forgot password?</button></div>}
        <button className="button-primary auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'forgot' ? 'Send reset link' : mode === 'reset' ? 'Reset password' : mode === 'register' ? 'Register' : 'Log in'}</button>
        {feedback && <p className={feedback.kind} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.text}</p>}
        {mode === 'login' && <><div className="auth-divider"><span>or</span></div><a className="auth-google" href="/api/auth/google"><span aria-hidden="true" className="google-mark">G</span>Continue with Google</a><p className="auth-switch">New to BREECE CRM? <button type="button" className="auth-text-action" onClick={() => navigate('register')}>Create an account</button></p></>}
        {mode !== 'login' && <p className="auth-switch">{mode === 'register' ? 'Already have an account?' : 'Ready to log in?'} <button type="button" className="auth-text-action" onClick={() => navigate('login')}>Return to login</button></p>}
      </form>
    </section>
  </main>;
}
