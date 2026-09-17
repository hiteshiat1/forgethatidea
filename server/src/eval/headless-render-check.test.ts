// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { runHeadlessRenderCheck, isHeadlessRenderFailure } from './headless-render-check.js';

// Real esbuild output (JSX -> IIFE assigned to the ForgeCompiledApp global,
// exactly generation-validation.ts's transform) for a few small fixture
// sources, precompiled ahead of time rather than calling esbuild inside this
// test file: esbuild's `transform` throws "Invariant violation" when run
// inside a jsdom vitest environment (jsdom's polyfills break an internal
// TextEncoder assumption esbuild relies on) — a known incompatibility, not a
// bug in this harness. See `regenerate` at the bottom of this file for how
// these were produced.

// Source: a stateful list with add/delete buttons, wrapped in a real error
// boundary — mirrors what a generated crud-tracker app looks like.
const CLICKABLE_APP_COMPILED = `var ForgeCompiledApp = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var stdin_exports = {};
  __export(stdin_exports, {
    default: () => Root
  });
  class ErrorBoundary extends React.Component {
    componentDidCatch(error) {
    }
    render() {
      return this.props.children;
    }
  }
  function App() {
    const [items, setItems] = React.useState([{ id: 1, title: "Buy milk" }]);
    const [nextId, setNextId] = React.useState(2);
    return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("button", { onClick: () => {
      setItems([...items, { id: nextId, title: "New item" }]);
      setNextId(nextId + 1);
    } }, "Add item"), /* @__PURE__ */ React.createElement("ul", null, items.map((item) => /* @__PURE__ */ React.createElement("li", { key: item.id }, item.title, /* @__PURE__ */ React.createElement("button", { onClick: () => setItems(items.filter((i) => i.id !== item.id)) }, "Delete")))));
  }
  function Root() {
    return /* @__PURE__ */ React.createElement(ErrorBoundary, null, /* @__PURE__ */ React.createElement(App, null));
  }
  return __toCommonJS(stdin_exports);
})();`;

// Source: a button whose click handler throws synchronously.
const CRASHING_APP_COMPILED = `var ForgeCompiledApp = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var stdin_exports = {};
  __export(stdin_exports, {
    default: () => App
  });
  function App() {
    return /* @__PURE__ */ React.createElement("button", { onClick: () => {
      throw new Error("boom");
    } }, "Click me");
  }
  return __toCommonJS(stdin_exports);
})();`;

// Source: `export default function App() { return null; }`.
const EMPTY_APP_COMPILED = `var ForgeCompiledApp = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var stdin_exports = {};
  __export(stdin_exports, {
    default: () => App
  });
  function App() {
    return null;
  }
  return __toCommonJS(stdin_exports);
})();`;

// Source: `export default 42;` — no usable component at all.
const NO_COMPONENT_COMPILED = `var ForgeCompiledApp = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var stdin_exports = {};
  __export(stdin_exports, {
    default: () => stdin_default
  });
  var stdin_default = 42;
  return __toCommonJS(stdin_exports);
})();`;

describe('runHeadlessRenderCheck (#84)', () => {
  it('mounts a compiled generated app and reports success when it renders real content', async () => {
    const result = await runHeadlessRenderCheck({ compiledCode: CLICKABLE_APP_COMPILED });
    expect(isHeadlessRenderFailure(result)).toBe(false);
    if (!isHeadlessRenderFailure(result)) {
      expect(result.hadContent).toBe(true);
      expect(result.interactionsAttempted).toBeGreaterThan(0);
    }
  });

  it('fails when the mounted app has no rendered content (a blank screen)', async () => {
    const result = await runHeadlessRenderCheck({ compiledCode: EMPTY_APP_COMPILED });
    expect(isHeadlessRenderFailure(result)).toBe(true);
    if (isHeadlessRenderFailure(result)) {
      expect(result.error).toBe('blank_render');
    }
  });

  it('fails when clicking through interactive elements throws an uncaught error', async () => {
    const result = await runHeadlessRenderCheck({ compiledCode: CRASHING_APP_COMPILED });
    expect(isHeadlessRenderFailure(result)).toBe(true);
    if (isHeadlessRenderFailure(result)) {
      expect(result.error).toBe('interaction_crashed');
    }
  });

  it('fails gracefully with a typed error when the compiled code has no usable default export', async () => {
    const result = await runHeadlessRenderCheck({ compiledCode: NO_COMPONENT_COMPILED });
    expect(isHeadlessRenderFailure(result)).toBe(true);
    if (isHeadlessRenderFailure(result)) {
      expect(result.error).toBe('no_component');
    }
  });
});
