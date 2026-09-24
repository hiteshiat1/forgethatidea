import { useNavigate } from 'react-router-dom';
import { Button } from '@forge/shared/ui';
import { BrandLockup } from './BrandLockup.js';
import '../styles/landing-page.css';

const VALUE_PROPS = [
  {
    title: 'No code, no designer',
    body: 'Describe your idea in plain language. Forge asks the questions a real product person would, then builds the app for you.',
  },
  {
    title: 'A real, clickable app',
    body: 'Not a wireframe or a slide — a working app you can click through, share, and demo, generated in minutes.',
  },
  {
    title: 'Cost and go-to-market included',
    body: "Forge also plans what it would cost to run for real and drafts a marketing angle, so you're not just left with a prototype.",
  },
];

const STEPS = [
  { label: 'Describe your idea', detail: 'A short conversation — what it is, who it’s for.' },
  {
    label: 'Forge plans it with you',
    detail: 'Screens, data, architecture, and cost — you approve each step.',
  },
  { label: 'Get a working app', detail: 'A real, clickable mocked app, ready to demo.' },
];

/**
 * Marketing landing page (`/`) — the front door every visitor sees before
 * AuthGate. Previously the app's root route went straight to a bare
 * login/signup form with no explanation of what Forge does; this exists so
 * a first-time visitor understands the product and has a clear next step
 * before being asked to create an account.
 */
export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing-page">
      <header className="landing-page__topbar">
        <BrandLockup variant="topbar" />
        <Button variant="secondary" size="sm" onClick={() => navigate('/app')}>
          Sign in
        </Button>
      </header>

      <section className="landing-page__hero">
        <BrandLockup variant="hero" />
        <h1 className="landing-page__headline">
          Turn an idea into a working app — no code, in minutes.
        </h1>
        <p className="landing-page__subhead">
          Describe your idea in a conversation. Forge plans it with you and hands you back a real,
          clickable mocked app — not a slide deck, not a wireframe.
        </p>
        <div className="landing-page__cta-row">
          <Button size="md" onClick={() => navigate('/app')}>
            Start building — it&rsquo;s free
          </Button>
          <span className="landing-page__cta-hint">No credit card required</span>
        </div>
      </section>

      <section className="landing-page__section" aria-label="How it works">
        <h2 className="landing-page__section-title">How it works</h2>
        <ol className="landing-page__steps">
          {STEPS.map((step, i) => (
            <li key={step.label} className="landing-page__step">
              <span className="landing-page__step-index">{i + 1}</span>
              <span className="landing-page__step-label">{step.label}</span>
              <span className="landing-page__step-detail">{step.detail}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-page__section" aria-label="Why Forge">
        <div className="landing-page__value-grid">
          {VALUE_PROPS.map((prop) => (
            <div key={prop.title} className="landing-page__value-card">
              <h3 className="landing-page__value-title">{prop.title}</h3>
              <p className="landing-page__value-body">{prop.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-page__section landing-page__final-cta">
        <h2 className="landing-page__section-title">Have an idea? Forge it.</h2>
        <Button size="md" onClick={() => navigate('/app')}>
          Start building
        </Button>
      </section>
    </div>
  );
}
