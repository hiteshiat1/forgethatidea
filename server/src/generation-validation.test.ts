import { describe, expect, it } from 'vitest';
import { validateGeneratedCode } from './generation-validation.js';

describe('validateGeneratedCode (#66)', () => {
  it('passes clean, compilable, contract-compliant code', async () => {
    const code = `
      export default function App() {
        const [items, setItems] = useState([]);
        return <div>{items.length}</div>;
      }
    `;
    const result = await validateGeneratedCode(code);
    expect(result).toEqual({ ok: true });
  });

  it('fails with compile_error on syntactically invalid code', async () => {
    const code = `export default function App() { return <div>unterminated`;
    const result = await validateGeneratedCode(code);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('compile_error');
      expect(result.details.length).toBeGreaterThan(0);
    }
  });

  it('fails with forbidden-API violation codes for localStorage usage', async () => {
    const code = `localStorage.setItem('x', '1'); export default function App() { return null; }`;
    const result = await validateGeneratedCode(code);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('forbidden_localStorage');
    }
  });

  it('fails with missing_default_export when there is no default export', async () => {
    const code = `function App() { return null; }`;
    const result = await validateGeneratedCode(code);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('missing_default_export');
    }
  });

  it('reports both a compile error and contract violations together when both are present', async () => {
    const code = `fetch('/x'); function App() { return <div>`;
    const result = await validateGeneratedCode(code);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('forbidden_fetch');
      expect(result.errors).toContain('missing_default_export');
      expect(result.errors).toContain('compile_error');
    }
  });

  it('never throws on malformed input — always resolves to a typed result', async () => {
    await expect(validateGeneratedCode('')).resolves.toMatchObject({ ok: false });
  });
});
