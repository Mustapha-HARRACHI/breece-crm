import { useEffect, useRef, useState } from 'react';

const pages = [
  { id: 'contacts', label: 'Contacts', icon: 'contacts', description: 'Manage your contacts and follow-ups.' },
  { id: 'stats', label: 'Statistics', icon: 'stats', description: 'Explore your contact data.' },
  { id: 'goals', label: 'Goals & Reminders', icon: 'goals', description: 'Track objectives and scheduled follow-ups.' },
  { id: 'privacy', label: 'Settings', icon: 'settings', description: 'Privacy, data and session controls.' }
];

function NavIcon({ name }) {
  const paths = {
    contacts: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-2a5.5 5.5 0 0 1 11 0v2M17 6a3 3 0 0 1 0 6m1 3a5 5 0 0 1 2.5 4.3" /></>,
    stats: <><path d="M4 20V11m5 9V5m5 15v-7m5 7V8M2 20h20" /></>,
    goals: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M10 2h4l.5 2.3 1.7.7 2-1.3 2.8 2.8-1.3 2 .7 1.7L22 10v4l-2.3.5-.7 1.7 1.3 2-2.8 2.8-2-1.3-1.7.7L14 22h-4l-.5-2.3-1.7-.7-2 1.3L3 17.5l1.3-2-.7-1.7L2 14v-4l2.3-.5.7-1.7-1.3-2L6.5 3l2 1.3 1.7-.7z" /></>
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function AppShell({ user, view, onNavigate, onLogout, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef(null);
  const firstNavigation = useRef(null);
  const current = pages.find((page) => page.id === view) || pages[0];

  useEffect(() => {
    if (!menuOpen) return undefined;
    firstNavigation.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  const navigate = (id) => {
    setMenuOpen(false);
    onNavigate(id);
  };

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    {menuOpen && <button className="sidebar-scrim" type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside className={`sidebar${menuOpen ? ' sidebar--open' : ''}`} aria-label="Application sidebar">
      <div className="sidebar-brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>BREECE <strong>CRM</strong></span></div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {pages.map((page, index) => <button key={page.id} ref={index === 0 ? firstNavigation : undefined} type="button" aria-current={view === page.id ? 'page' : undefined} onClick={() => navigate(page.id)}><NavIcon name={page.icon} /><span>{page.label}</span></button>)}
      </nav>
      <div className="sidebar-account"><span className="account-avatar" aria-hidden="true">{user.name?.trim().charAt(0).toUpperCase() || 'U'}</span><div className="account-identity"><strong>{user.name}</strong><small>{user.email}</small></div></div>
      <button className="sidebar-logout" type="button" onClick={onLogout}>Log out</button>
    </aside>
    <div className="workspace">
      <header className="workspace-topbar">
        <button ref={menuButton} className="menu-toggle" type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><span aria-hidden="true">☰</span></button>
        <div className="page-heading"><h1>{current.label}</h1><p>{current.description}</p></div>
        <span className="topbar-user">Welcome, {user.name}</span>
      </header>
      <main id="main-content" className="workspace-content">{children}</main>
    </div>
  </div>;
}
