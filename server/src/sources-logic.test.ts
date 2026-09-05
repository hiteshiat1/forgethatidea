import { describe, it, expect } from 'vitest';
import { classifySource, checkSourcesIntakeComplete, type SourcesIntake } from './sources-logic.js';

describe('classifySource', () => {
  it('classifies a bare URL as a link', () => {
    expect(classifySource('https://competitor.com')).toEqual({
      type: 'link',
      value: 'https://competitor.com',
    });
  });

  it('classifies a URL without a scheme as a link', () => {
    expect(classifySource('www.competitor.com')).toEqual({
      type: 'link',
      value: 'www.competitor.com',
    });
  });

  it('classifies plain text (a competitor name) as free text', () => {
    expect(classifySource('Notion')).toEqual({ type: 'text', value: 'Notion' });
  });

  it('trims whitespace before classifying', () => {
    expect(classifySource('  Notion  ')).toEqual({ type: 'text', value: 'Notion' });
  });
});

describe('checkSourcesIntakeComplete', () => {
  it('is not complete when nothing has been provided and none was not declined', () => {
    const intake: SourcesIntake = { sources: [], declined: false };
    expect(checkSourcesIntakeComplete(intake)).toEqual({ complete: false });
  });

  it('is complete once at least one source has been recorded', () => {
    const intake: SourcesIntake = {
      sources: [{ type: 'text', value: 'Notion' }],
      declined: false,
    };
    expect(checkSourcesIntakeComplete(intake)).toEqual({ complete: true });
  });

  it('is complete when the user has explicitly declined ("none") with no sources', () => {
    const intake: SourcesIntake = { sources: [], declined: true };
    expect(checkSourcesIntakeComplete(intake)).toEqual({ complete: true });
  });
});
