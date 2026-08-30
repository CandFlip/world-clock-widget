'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, Clock3, LogIn, MessageSquareText, Users } from 'lucide-react';

type AdminUser = {
  id: string; email: string; name: string; picture: string; first_seen: string; last_seen: string;
  vote: string | null; voted_at: string | null; context: string | null; placement: string | null;
  alert_style: string | null; typical_duration: string | null; notes: string | null;
};
type AdminOverview = { metrics: { registered: number; voters: number; timerResponses: number }; users: AdminUser[] };

const voteLabels: Record<string, string> = { timer: 'Alarm & timer', ios: 'World Clock for iOS', android: 'World Clock for Android' };

export default function AdminPage() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/overview').then(async (response) => {
      const body = await response.json() as AdminOverview & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Could not open the dashboard.');
      setData(body);
    }).catch((reason) => setError(reason.message));
  }, []);

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <Link href="/" className="admin-back"><ArrowLeft size={16} /> Back to voting</Link>
        <div className="brand"><span className="brand-mark"><Clock3 size={18} /></span>World Clock</div>
      </header>
      <section className="admin-intro">
        <p className="section-kicker">Private dashboard</p>
        <h1>Roadmap responses</h1>
        <p>Everyone who signs in, what they voted for, and the context behind timer requests.</p>
      </section>

      {error ? (
        <section className="admin-error"><LogIn size={22} /><h2>Dashboard unavailable</h2><p>{error}</p><Link href="/">Sign in on the voting page</Link></section>
      ) : !data ? (
        <p className="admin-loading">Loading dashboard…</p>
      ) : (
        <>
          <section className="metric-grid">
            <article><span><Users /></span><div><strong>{data.metrics.registered}</strong><p>Registered people</p></div></article>
            <article><span><BarChart3 /></span><div><strong>{data.metrics.voters}</strong><p>Votes submitted</p></div></article>
            <article><span><MessageSquareText /></span><div><strong>{data.metrics.timerResponses}</strong><p>Timer interviews</p></div></article>
          </section>
          <section className="responses-card">
            <div className="responses-heading"><div><p className="section-kicker">Live data</p><h2>People and choices</h2></div><span>{data.users.length} total</span></div>
            {data.users.length === 0 ? <p className="empty-responses">No one has registered yet. Share the public link to collect the first vote.</p> : (
              <div className="response-list">
                {data.users.map((user) => (
                  <article className="response-row" key={user.id}>
                    <div className="person-cell">
                      {user.picture ? <span className="person-avatar" style={{ backgroundImage: `url(${JSON.stringify(user.picture).slice(1, -1)})` }} /> : <span>{user.name.slice(0, 1).toUpperCase()}</span>}
                      <div><strong>{user.name}</strong><a href={`mailto:${user.email}`}>{user.email}</a><small>Joined {new Date(user.first_seen).toLocaleDateString()}</small></div>
                    </div>
                    <div className="choice-cell"><small>Vote</small><strong>{user.vote ? voteLabels[user.vote] : 'Not voted yet'}</strong>{user.voted_at && <span>{new Date(user.voted_at).toLocaleString()}</span>}</div>
                    {user.context ? <details className="feedback-cell">
                      <summary>View timer answers</summary>
                      <div><p><b>Situation:</b> {user.context}</p><p><b>Placement:</b> {user.placement}</p><p><b>Alert:</b> {user.alert_style}</p><p><b>Duration:</b> {user.typical_duration}</p>{user.notes && <p><b>Notes:</b> {user.notes}</p>}</div>
                    </details> : <span className="no-feedback">No timer answers</span>}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
