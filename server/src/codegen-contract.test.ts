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

describe('checkContractViolations (#63)', () => {
  it('passes clean, contract-compliant code', () => {
    const code = `
      export default function App() {
        const [items, setItems] = useState([]);
        return <div>{items.length}</div>;
      }
    `;
    expect(checkContractViolations(code)).toEqual([]);
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
