import { describe, it, expect, vi } from 'vitest';
import { createToolDispatcher, type ToolHandler } from './tool-dispatch.js';

function silentLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('createToolDispatcher', () => {
  it('maps a tool name to its handler and returns the result', async () => {
    const getWeather: ToolHandler = vi.fn(async (input: unknown) => ({
      ok: true,
      weather: `sunny in ${(input as { city: string }).city}`,
    }));
    const dispatcher = createToolDispatcher({
      tools: { get_weather: getWeather },
      logger: silentLogger(),
    });

    const result = await dispatcher.dispatch({
      type: 'tool_use',
      id: 'call-1',
      name: 'get_weather',
      input: { city: 'Lisbon' },
    });

    expect(getWeather).toHaveBeenCalledWith({ city: 'Lisbon' });
    expect(result).toEqual({
      toolUseId: 'call-1',
      isError: false,
      content: { ok: true, weather: 'sunny in Lisbon' },
    });
  });

  it('handles an unknown tool name safely, without throwing', async () => {
    const dispatcher = createToolDispatcher({ tools: {}, logger: silentLogger() });

    const result = await dispatcher.dispatch({
      type: 'tool_use',
      id: 'call-2',
      name: 'does_not_exist',
      input: {},
    });

    expect(result).toEqual({
      toolUseId: 'call-2',
      isError: true,
      content: { error: 'unknown_tool', tool: 'does_not_exist' },
    });
  });

  it('catches a handler that throws and returns an error result instead of propagating', async () => {
    const failing: ToolHandler = vi.fn(async () => {
      throw new Error('boom');
    });
    const dispatcher = createToolDispatcher({ tools: { failing }, logger: silentLogger() });

    const result = await dispatcher.dispatch({
      type: 'tool_use',
      id: 'call-3',
      name: 'failing',
      input: {},
    });

    expect(result).toEqual({
      toolUseId: 'call-3',
      isError: true,
      content: { error: 'tool_execution_failed', message: 'boom' },
    });
  });

  it('logs a warning for an unknown tool and an error for a handler failure', async () => {
    const logger = silentLogger();
    const failing: ToolHandler = vi.fn(async () => {
      throw new Error('boom');
    });
    const dispatcher = createToolDispatcher({ tools: { failing }, logger });

    await dispatcher.dispatch({ type: 'tool_use', id: 'call-4', name: 'unknown', input: {} });
    expect(logger.warn).toHaveBeenCalled();

    await dispatcher.dispatch({ type: 'tool_use', id: 'call-5', name: 'failing', input: {} });
    expect(logger.error).toHaveBeenCalled();
  });

  it('collects tool_use blocks via onToolUse and dispatches each, preserving order', async () => {
    const calls: string[] = [];
    const a: ToolHandler = vi.fn(async () => {
      calls.push('a');
      return { done: 'a' };
    });
    const b: ToolHandler = vi.fn(async () => {
      calls.push('b');
      return { done: 'b' };
    });
    const dispatcher = createToolDispatcher({ tools: { a, b }, logger: silentLogger() });

    const handler = dispatcher.createOnToolUseHandler();
    handler({ type: 'tool_use', id: 'call-a', name: 'a', input: {} });
    handler({ type: 'tool_use', id: 'call-b', name: 'b', input: {} });

    const results = await dispatcher.drain();
    expect(calls).toEqual(['a', 'b']);
    expect(results.map((r) => r.toolUseId)).toEqual(['call-a', 'call-b']);
    expect(results.every((r) => !r.isError)).toBe(true);
  });
});
