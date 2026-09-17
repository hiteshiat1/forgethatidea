import { describe, expect, it } from 'vitest';
import {
  CODEGEN_CONTRACT_VERSION,
  buildCodegenPrompt,
  checkContractViolations,
} from './codegen-contract.js';
import type { ArchetypeDefinition } from './archetype-catalog.js';
import { ARCHETYPES } from './archetype-catalog.js';
import type { BuildManifest } from '@forge/shared';

function manifest(overrides: Partial<BuildManifest> = {}): BuildManifest {
  return {
    schemaVersion: 1,
    productName: 'HabitLoop',
    icp: 'people building daily habits',
    entities: [
      {
        name: 'Habit',
        fields: [
          { name: 'title', type: 'string' },
          { name: 'streak', type: 'number' },
        ],
      },
    ],
    screens: [{ name: 'Habit list', purpose: 'see all habits' }],
    roles: ['user'],
    keyActions: ['create habit', 'log completion'],
    branding: { accentColor: '#2E7D32', tone: 'encouraging' },
    references: { researchCardIds: [] },
    archetype: 'crud-tracker',
    ...overrides,
  };
}

describe('buildCodegenPrompt (#63)', () => {
  it('enforces single-file, in-memory-state output', () => {
    const prompt = buildCodegenPrompt({
      manifest: manifest(),
      archetype: ARCHETYPES['crud-tracker'],
    });
    expect(prompt).toContain('single');
    expect(prompt.toLowerCase()).toContain('in-memory');
  });

  it('forbids localStorage and external network calls', () => {
    const prompt = buildCodegenPrompt({
      manifest: manifest(),
      archetype: ARCHETYPES['crud-tracker'],
    });
    expect(prompt).toContain('localStorage');
    expect(prompt).toContain('fetch');
  });

  it('requires a default export', () => {
    const prompt = buildCodegenPrompt({
      manifest: manifest(),
      archetype: ARCHETYPES['crud-tracker'],
    });
    expect(prompt).toContain('default export');
  });

  it('includes the manifest entities/screens/branding so the model has real content to generate from', () => {
    const prompt = buildCodegenPrompt({
      manifest: manifest(),
      archetype: ARCHETYPES['crud-tracker'],
    });
    expect(prompt).toContain('Habit');
    expect(prompt).toContain('Habit list');
    expect(prompt).toContain('#2E7D32');
  });

  it('includes the archetype out-of-scope list so the model does not overreach', () => {
    const archetype: ArchetypeDefinition = ARCHETYPES['crud-tracker'];
    const prompt = buildCodegenPrompt({ manifest: manifest(), archetype });
    expect(prompt).toContain(archetype.outOfScope[0]);
  });

  it('embeds branding injection with a derived palette (#72)', () => {
    const prompt = buildCodegenPrompt({
      manifest: manifest(),
      archetype: ARCHETYPES['crud-tracker'],
    });
    expect(prompt.toLowerCase()).toContain('habitloop');
    expect(prompt.toLowerCase()).toContain('forge design tokens');
  });

  it('embeds the standardized mock auth pattern (#70)', () => {
    const prompt = buildCodegenPrompt({
      manifest: manifest(),
      archetype: ARCHETYPES['crud-tracker'],
    });
    expect(prompt.toLowerCase()).toContain('mock authentication pattern');
  });

  it('includes a role switcher in the embedded pattern when the manifest defines multiple roles', () => {
    const withRoles = manifest({ roles: ['buyer', 'seller'] });
    const prompt = buildCodegenPrompt({
      manifest: withRoles,
      archetype: ARCHETYPES['marketplace-listing'],
    });
    expect(prompt.toLowerCase()).toContain('switch role');
  });

  it('embeds the standardized mock CRUD store pattern (#71)', () => {
    const prompt = buildCodegenPrompt({
      manifest: manifest(),
      archetype: ARCHETYPES['crud-tracker'],
    });
    expect(prompt.toLowerCase()).toContain('mock crud store pattern');
    expect(prompt.toLowerCase()).toContain('usereducer');
  });

  it('embeds the standardized navigation pattern for a multi-screen manifest (#79)', () => {
    const withScreens = manifest({
      screens: [
        { name: 'Habit list', purpose: 'see all habits' },
        { name: 'Settings', purpose: 'manage preferences' },
      ],
    });
    const prompt = buildCodegenPrompt({
      manifest: withScreens,
      archetype: ARCHETYPES['crud-tracker'],
    });
    expect(prompt.toLowerCase()).toContain('navigation pattern');
    expect(prompt.toLowerCase()).toContain('nav bar');
  });

  it('embeds the standardized empty/error/loading states pattern (#80)', () => {
    const prompt = buildCodegenPrompt({
      manifest: manifest(),
      archetype: ARCHETYPES['crud-tracker'],
    });
    expect(prompt.toLowerCase()).toContain('empty state');
    expect(prompt.toLowerCase()).toContain('error boundary');
  });

  it('embeds the standardized "what\'s mocked" transparency panel pattern (#82)', () => {
    const prompt = buildCodegenPrompt({
      manifest: manifest(),
      archetype: ARCHETYPES['crud-tracker'],
    });
    expect(prompt.toLowerCase()).toContain("what's mocked");
    expect(prompt.toLowerCase()).toContain('plain language');
  });

  it('embeds the standardized mobile-responsive layout pattern (#81)', () => {
    const prompt = buildCodegenPrompt({
      manifest: manifest(),
      archetype: ARCHETYPES['crud-tracker'],
    });
    expect(prompt.toLowerCase()).toContain('mobile-responsive layout');
    expect(prompt.toLowerCase()).toContain('horizontal scroll');
  });

  it('requires seed data realistic and relevant to the ICP', () => {
    const prompt = buildCodegenPrompt({
      manifest: manifest(),
      archetype: ARCHETYPES['crud-tracker'],
    });
    expect(prompt.toLowerCase()).toContain('seed data');
    expect(prompt).toContain(manifest().icp);
  });

  it('is versioned', () => {
    expect(prompt_version_present()).toBe(true);
    function prompt_version_present() {
      const prompt = buildCodegenPrompt({
        manifest: manifest(),
        archetype: ARCHETYPES['crud-tracker'],
      });
      return prompt.includes(CODEGEN_CONTRACT_VERSION);
    }
  });
});

const ERROR_BOUNDARY_SNIPPET = `
  class ErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { hasError: false }; }
    static getDerivedStateFromError() { return { hasError: true }; }
    componentDidCatch(error, info) { console.error(error, info); }
    render() { return this.state.hasError ? <p>Something went wrong.</p> : this.props.children; }
  }
`;

describe('checkContractViolations (#63)', () => {
  it('passes clean, contract-compliant code', () => {
    const code = `
      ${ERROR_BOUNDARY_SNIPPET}
      export default function App() {
        const [items, setItems] = useState([]);
        return <div>{items.length}</div>;
      }
    `;
    expect(checkContractViolations(code)).toEqual([]);
  });

  it('flags a missing error boundary (#80)', () => {
    const code = `
      export default function App() {
        const [items, setItems] = useState([]);
        return <div>{items.length}</div>;
      }
    `;
    expect(checkContractViolations(code)).toContain('missing_error_boundary');
  });

  it('accepts componentDidCatch as sufficient evidence of a real error boundary', () => {
    const code = `
      class Boundary extends React.Component {
        componentDidCatch(error) { this.setState({ hasError: true }); }
        render() { return this.props.children; }
      }
      export default function App() { return <Boundary><div /></Boundary>; }
    `;
    expect(checkContractViolations(code)).not.toContain('missing_error_boundary');
  });

  it('flags a fixed pixel layout width of 300px or more (#81)', () => {
    const code = `
      ${ERROR_BOUNDARY_SNIPPET}
      export default function App() {
        return <div style={{ width: '600px' }}>Content</div>;
      }
    `;
    expect(checkContractViolations(code)).toContain('fixed_pixel_layout_width');
  });

  it('does not flag maxWidth/minWidth, or a small fixed width like an icon size', () => {
    const code = `
      ${ERROR_BOUNDARY_SNIPPET}
      export default function App() {
        return (
          <div style={{ maxWidth: '600px', minWidth: '400px' }}>
            <img style={{ width: '24px' }} />
          </div>
        );
      }
    `;
    expect(checkContractViolations(code)).not.toContain('fixed_pixel_layout_width');
  });

  it('flags localStorage usage', () => {
    const code = `localStorage.setItem('x', '1'); export default function App() { return null; }`;
    expect(checkContractViolations(code)).toContain('forbidden_localStorage');
  });

  it('flags fetch usage', () => {
    const code = `fetch('/api/x'); export default function App() { return null; }`;
    expect(checkContractViolations(code)).toContain('forbidden_fetch');
  });

  it('flags a real <form> tag', () => {
    const code = `export default function App() { return <form onSubmit={() => {}}></form>; }`;
    expect(checkContractViolations(code)).toContain('forbidden_form_tag');
  });

  it('flags a missing default export', () => {
    const code = `function App() { return null; }`;
    expect(checkContractViolations(code)).toContain('missing_default_export');
  });

  it('reports multiple violations at once', () => {
    const code = `localStorage.getItem('x'); function App() { return null; }`;
    const violations = checkContractViolations(code);
    expect(violations).toContain('forbidden_localStorage');
    expect(violations).toContain('missing_default_export');
  });
});
