import { describe, expect, it } from 'vitest';
import { isExpectedName } from './gate';

describe('isExpectedName', () => {
  it('accepts the expected name', () => {
    expect(isExpectedName('Professor Moana')).toBe(true);
  });

  it('ignores capitals and extra spaces', () => {
    expect(isExpectedName('  professor   MOANA ')).toBe(true);
  });

  it('refuses any other answer', () => {
    for (const answer of ['', '   ', 'Moana', 'Professor', 'Professor Silva', 'ProfessorMoana']) {
      expect(isExpectedName(answer)).toBe(false);
    }
  });
});
