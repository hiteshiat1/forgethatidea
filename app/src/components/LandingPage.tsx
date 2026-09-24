import { useNavigate } from 'react-router-dom';
import { Button } from '@forge/shared/ui';
import { BrandLockup } from './BrandLockup.js';
import '../styles/landing-page.css';

const JOURNEY_STEPS = [
  {
    label: 'Talk through the idea',
    detail:
      'Forge interviews you, researches your market and competitors, and lays out real build options with honest trade-offs — not just one path.',
  },
  {
    label: 'See the real plan',
    detail:
      'Architecture in plain language, a cost estimate built from real hosting/AI/domain pricing, and a marketing angle — before anything gets built.',
  },
  {
    label: 'Get a working app',
    detail:
      'A real, clickable mocked app you can demo and refine — not a slide deck, not a wireframe.',
  },
  {
    label: 'Take it further',
    detail:
      'When you’re ready: a dev-ready spec pack exported to GitHub, an investor pitch deck, and a financial model with real funding routes for your country.',
  },
];

const VALUE_PROPS = [
  {
    title: 'Trade-offs, not just answers',
    body: 'Every build comes with options and honest trade-offs — the lean version, the balanced one, the ambitious one — so you choose with open eyes, not guesswork.',
  },
  {
    title: 'Grounded in real numbers',
    body: 'Cost estimates from real hosting, database, and AI pricing. Market research from real sources. Funding routes for your actual country. No invented figures.',
  },
  {
    title: 'A real, clickable app',
    body: 'Not a wireframe or a slide — a working app you can click through, share, and demo, built from the plan you approved.',
  },
  {
    title: 'Built to go the distance',
    body: 'When the prototype lands, Forge can hand you a dev-ready backlog, a pitch deck, and a financial model — the same journey from idea to something fundable.',
  },
];

/**
 * Marketing landing page (`/`) — the front door every visitor sees before
 * AuthGate. Rewritten (see docs/landing-page-and-ui.md) to move away from
 * "no-code app builder" framing, a crowded category Forge doesn't compete
 * in on those terms — the real differentiation is the guidance across the
 * whole early-stage journey (trade-offs, real cost/market data, a working
 * app, and later a spec pack / pitch deck / financial model), grounded in
 * the actual product backlog (Epics 3-9) rather than invented marketing
 * claims. Headline is the product's own stated tagline (see Epic 11.1 and
 * docs/forge.jsx's onboarding screen): "Bring the idea. Leave with the
 * thing."
 *
 * Section-progression palette (docs/landing-page-and-ui.md): each section
 * below gets one accent from the given 5-color palette
 * (https://coolors.co/palette/0d3b66-faf0ca-f4d35e-ee964b-f95738), applied
 * as CSS custom properties scoped to `.landing-page` in landing-page.css —
 * the app's existing dark "ink" base and global tokens are untouched.
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

      <section className="landing-page__hero landing-page__section--deep">
        <BrandLockup variant="hero" />
        <h1 className="landing-page__headline">
          Bring the idea.{' '}
          <span className="landing-page__headline-accent">Leave with the thing.</span>
        </h1>
        <p className="landing-page__subhead">
          Forge interviews you about your idea, researches your market, plans the build and the
          go-to-market, and hands you a real working app — with the trade-offs made visible along
          the way.
        </p>
        <div className="landing-page__cta-row">
          <Button size="md" onClick={() => navigate('/app')}>
            Start building — it&rsquo;s free
          </Button>
          <span className="landing-page__cta-hint">No credit card required</span>
        </div>
      </section>

      <section
        className="landing-page__section landing-page__section--yellow"
        aria-label="Not just an app builder"
      >
        <h2 className="landing-page__section-title">Not another app builder</h2>
        <p className="landing-page__section-lead">
          Plenty of tools will turn a prompt into an app. Forge is for the part before and after
          that: deciding what to build and why, understanding what it would cost and who it's for,
          and knowing what to do once the prototype exists.
        </p>
      </section>

      <section
        className="landing-page__section landing-page__section--orange"
        aria-label="How it works"
      >
        <h2 className="landing-page__section-title">The journey</h2>
        <ol className="landing-page__steps">
          {JOURNEY_STEPS.map((step, i) => (
            <li key={step.label} className="landing-page__step">
              <span className="landing-page__step-index">{i + 1}</span>
              <span className="landing-page__step-label">{step.label}</span>
              <span className="landing-page__step-detail">{step.detail}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-page__section landing-page__section--red" aria-label="Why Forge">
        <h2 className="landing-page__section-title">What you get</h2>
        <div className="landing-page__value-grid">
          {VALUE_PROPS.map((prop) => (
            <div key={prop.title} className="landing-page__value-card">
              <h3 className="landing-page__value-title">{prop.title}</h3>
              <p className="landing-page__value-body">{prop.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-page__section landing-page__final-cta landing-page__section--deep">
        <h2 className="landing-page__section-title">Have an idea? Forge it.</h2>
        <Button size="md" onClick={() => navigate('/app')}>
          Start building
        </Button>
      </section>
    </div>
  );
}
