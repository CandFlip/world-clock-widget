'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlarmClock, ArrowRight, ArrowUpRight, Check, Clock3, LogIn, LogOut, ShieldCheck, Smartphone, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { GoogleSignIn, type GoogleUser } from '@/components/google-sign-in';

type IdeaId = 'timer' | 'ios' | 'android';
type Counts = Record<IdeaId, number>;
type QuizAnswers = { context: string; placement: string; alertStyle: string; typicalDuration: string; notes: string };
type AuthResponse = { user?: GoogleUser | null };
type VotesResponse = { counts?: Counts; selected?: IdeaId | null };

const emptyCounts: Counts = { timer: 0, ios: 0, android: 0 };
const initialAnswers: QuizAnswers = { context: '', placement: '', alertStyle: '', typicalDuration: '', notes: '' };
const supportUrl = process.env.NEXT_PUBLIC_SUPPORT_URL ?? '';

const ideas = [
  { id: 'timer' as const, title: 'Alarm & timer', description: 'A focused timer for work, cooking, rest and the moments you cannot afford to miss.', icon: AlarmClock, tag: 'Tell me how you would use it' },
  { id: 'ios' as const, title: 'World Clock for iOS', description: 'The same glanceable time experience, adapted for iPhone and iOS widgets.', icon: Smartphone, tag: 'iPhone + home screen widgets' },
  { id: 'android' as const, title: 'World Clock for Android', description: 'A native-feeling Android version for phones, tablets and home screens.', icon: Smartphone, tag: 'Android + home screen widgets' },
];

const quizSteps = [
  { key: 'context' as const, title: 'When would you use it?', description: 'Choose the situation where the timer matters most.', options: ['Focused work or study', 'Cooking', 'Exercise or stretching', 'Sleep or waking up', 'Medication or appointments', 'Travel and time zones', 'Something else'] },
  { key: 'placement' as const, title: 'Where should it live?', description: 'Think about the moment you need to start or check it.', options: ['Inside the World Clock widget', 'A tiny always-on-top timer', 'Windows system tray', 'A full alarm screen', 'On my phone', 'Across desktop and phone'] },
  { key: 'alertStyle' as const, title: 'How should it get your attention?', description: 'Pick the alert that would feel useful rather than annoying.', options: ['Sound and notification', 'Gentle sound only', 'Visual notification only', 'Persistent alarm until dismissed', 'Start quietly, then get louder'] },
  { key: 'typicalDuration' as const, title: 'What do you usually time?', description: 'This helps decide which presets should be immediately available.', options: ['Under 5 minutes', '5–25 minutes', '25–60 minutes', '1–4 hours', 'A specific time of day', 'Multiple timers at once'] },
];

export default function Home() {
  const [counts, setCounts] = useState<Counts>(emptyCounts);
  const [selected, setSelected] = useState<IdeaId | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizStep, setQuizStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>(initialAnswers);
  const [quizDone, setQuizDone] = useState(false);
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [pendingVote, setPendingVote] = useState<IdeaId | null>(null);
  const total = useMemo(() => Object.values(counts).reduce((sum, count) => sum + count, 0), [counts]);

  useEffect(() => {
    Promise.all([
      fetch('/api/auth/me').then((response) => response.json() as Promise<AuthResponse>),
      fetch('/api/votes').then((response) => response.json() as Promise<VotesResponse>),
    ]).then(([auth, votes]) => {
      setUser(auth.user ?? null);
      setCounts(votes.counts ?? emptyCounts);
      setSelected(votes.selected ?? null);
    }).catch(() => setMessage('Live totals are temporarily unavailable.')).finally(() => setLoading(false));
  }, []);

  const submitVote = useCallback(async (optionId: IdeaId) => {
    setMessage('');
    setLoading(true);
    try {
      const response = await fetch('/api/votes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionId }),
      });
      if (!response.ok) throw new Error('Vote failed');
      const data = await response.json() as { counts: Counts };
      setCounts(data.counts);
      setSelected(optionId);
      setMessage('Your vote is counted. You can change it anytime.');
      if (optionId === 'timer') {
        setQuizStep(0); setQuizDone(false); setQuizOpen(true);
      }
    } catch {
      setMessage('Could not save your vote. Please try again.');
    } finally { setLoading(false); }
  }, []);

  function vote(optionId: IdeaId) {
    if (!user) {
      setPendingVote(optionId);
      setAuthOpen(true);
      return;
    }
    void submitVote(optionId);
  }

  const handleSignedIn = useCallback((signedInUser: GoogleUser) => {
    setUser(signedInUser);
    setAuthOpen(false);
    setMessage(`Welcome, ${signedInUser.name}. Your vote will be tied to this Google account.`);
    setPendingVote(null);
    if (pendingVote) void submitVote(pendingVote);
  }, [pendingVote, submitVote]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setSelected(null);
    setMessage('Signed out.');
  }

  async function submitQuiz() {
    setLoading(true);
    try {
      const response = await fetch('/api/timer-feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
      });
      if (!response.ok) throw new Error('Feedback failed');
      setQuizDone(true);
    } catch { setMessage('Could not save the timer answers. Please try again.'); setQuizOpen(false); }
    finally { setLoading(false); }
  }

  const currentStep = quizSteps[quizStep];
  const currentValue = currentStep ? answers[currentStep.key] : '';

  return (
    <main className="site-shell">
      <nav className="topbar" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="World Clock roadmap home"><span className="brand-mark"><Clock3 size={18} /></span>World Clock</a>
        <div className="account-area">
          {user ? <>
            {user.isAdmin && <Link className="admin-link" href="/admin"><ShieldCheck size={15} /> Dashboard</Link>}
            <span className="user-chip">{user.picture ? <span className="user-avatar" style={{ backgroundImage: `url(${JSON.stringify(user.picture).slice(1, -1)})` }} /> : null}<span>{user.name}</span></span>
            <button type="button" onClick={logout} aria-label="Sign out"><LogOut size={16} /></button>
          </> : <button type="button" className="signin-link" onClick={() => setAuthOpen(true)}><LogIn size={15} /> Sign in with Google</button>}
        </div>
      </nav>

      <section className="hero" id="top">
        <p className="eyebrow"><span className="live-dot" /> You choose the roadmap</p>
        <h1>What should I do next?</h1>
        <p className="hero-copy">Vote for the feature you want most. One verified Google account gets one vote, and you can change your mind whenever you like.</p>
      </section>

      <section className="ideas-section" aria-labelledby="ideas-title">
        <div className="section-heading">
          <div><p className="section-kicker">Open voting</p><h2 id="ideas-title">Choose one idea</h2></div>
          <p className="vote-count">{loading && total === 0 ? 'Loading votes…' : `${total} ${total === 1 ? 'vote' : 'votes'} so far`}</p>
        </div>
        <div className="idea-grid">
          {ideas.map((idea, index) => {
            const Icon = idea.icon;
            const isSelected = selected === idea.id;
            const share = total ? Math.round((counts[idea.id] / total) * 100) : 0;
            return (
              <article className={`idea-card idea-${index + 1} ${isSelected ? 'is-selected' : ''}`} key={idea.id}>
                <div className="idea-topline"><span className="idea-icon"><Icon size={21} /></span><span className="idea-rank">0{index + 1}</span></div>
                <span className="idea-tag">{idea.tag}</span>
                <h3>{idea.title}</h3><p>{idea.description}</p>
                <div className="mini-progress" aria-label={`${share}% of votes`}><span style={{ width: `${share}%` }} /></div>
                <div className="vote-row">
                  <button type="button" onClick={() => vote(idea.id)} disabled={loading} className={isSelected ? 'selected-button' : ''}>
                    {isSelected ? <><Check size={15} /> Your choice</> : 'Vote for this'}
                  </button>
                  <span>{counts[idea.id]} {counts[idea.id] === 1 ? 'vote' : 'votes'} · {share}%</span>
                </div>
              </article>
            );
          })}
        </div>
        <output className="status-message" aria-live="polite">{message}</output>
      </section>

      <section className="support-card" id="support">
        <div>
          <p className="section-kicker">Keep it independent</p><h2>Support the author</h2>
          <p>Help fund design, testing and future platform versions. Payments are handled securely by Stripe in your local currency.</p>
        </div>
        <div className="support-actions">
          <div className="support-progress" aria-label="Support goal: no contributions yet">
            <div className="progress-label"><span>Current support</span><strong>$0 / $250</strong></div>
            <div className="progress-track"><span /></div>
          </div>
          <div className="support-buttons">
            {supportUrl ? (
              <a href={supportUrl} target="_blank" rel="noreferrer">Choose amount & frequency <ArrowUpRight size={15} /></a>
            ) : (
              <button type="button" disabled title="The author is connecting a secure Stripe payment page">Payments coming soon</button>
            )}
          </div>
          <p className="payment-note">One-time or monthly. Cancel a recurring contribution at any time.</p>
        </div>
      </section>

      <footer><span>Built in public, one useful feature at a time.</span><span>World Clock Widget</span></footer>

      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="auth-dialog">
          <DialogHeader>
            <span className="auth-icon"><ShieldCheck size={22} /></span>
            <DialogTitle>Sign in to cast your vote</DialogTitle>
            <DialogDescription>Google sign-in keeps the roadmap fair: one person, one current choice. Your name, email and vote are visible only to the project owner.</DialogDescription>
          </DialogHeader>
          <GoogleSignIn onSignedIn={handleSignedIn} />
          <p className="privacy-note">The site never receives your Google password.</p>
        </DialogContent>
      </Dialog>

      <Dialog open={quizOpen} onOpenChange={setQuizOpen}>
        <DialogContent className="quiz-dialog">
          {quizDone ? (
            <div className="quiz-success">
              <span className="success-icon"><Sparkles size={24} /></span>
              <DialogTitle>That was genuinely useful.</DialogTitle>
              <DialogDescription>Your answers will help decide what the timer should look like, where it should live and how it should alert you.</DialogDescription>
              <Button onClick={() => setQuizOpen(false)}>Done</Button>
            </div>
          ) : (
            <>
              <DialogHeader>
                <div className="quiz-meta"><span>Timer mini-quiz</span><strong>{quizStep + 1} / {quizSteps.length + 1}</strong></div>
                <div className="quiz-progress" aria-label={`Step ${quizStep + 1} of ${quizSteps.length + 1}`}>
                  <span style={{ width: `${((quizStep + 1) / (quizSteps.length + 1)) * 100}%` }} />
                </div>
                <DialogTitle>{currentStep ? currentStep.title : 'Anything else I should know?'}</DialogTitle>
                <DialogDescription>{currentStep ? currentStep.description : 'Optional: describe a real moment when an alarm or timer would have helped.'}</DialogDescription>
              </DialogHeader>
              {currentStep ? (
                <div className="quiz-options" role="radiogroup" aria-label={currentStep.title}>
                  {currentStep.options.map((option) => (
                    <button key={option} type="button" aria-pressed={currentValue === option} className={currentValue === option ? 'chosen' : ''}
                      onClick={() => setAnswers((previous) => ({ ...previous, [currentStep.key]: option }))}>
                      <span>{option}</span>{currentValue === option && <Check size={16} />}
                    </button>
                  ))}
                </div>
              ) : (
                <Textarea value={answers.notes} maxLength={600} rows={6} placeholder="For example: I lose track of short breaks when working across time zones…"
                  onChange={(event) => setAnswers((previous) => ({ ...previous, notes: event.target.value }))} />
              )}
              <div className="quiz-footer">
                <Button variant="ghost" disabled={quizStep === 0} onClick={() => setQuizStep((step) => step - 1)}>Back</Button>
                {quizStep < quizSteps.length ? (
                  <Button disabled={!currentValue} onClick={() => setQuizStep((step) => step + 1)}>Continue <ArrowRight /></Button>
                ) : (
                  <Button disabled={loading} onClick={submitQuiz}>Send answers <ArrowRight /></Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
