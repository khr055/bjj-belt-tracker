import { describe, expect, it } from 'vitest';
import { addMonths } from './dates';
import { timeInGrade } from './timeInGrade';
import type { Promotion } from './types';

const TODAY = '2026-11-11';

function promotion(belt: Promotion['belt'], stripes: number, date: string): Promotion {
  return { id: `${belt}-${stripes}`, belt, stripes, date };
}

describe('addMonths', () => {
  it('moves forward by whole months, across years', () => {
    expect(addMonths('2025-03-08', 24)).toBe('2027-03-08');
    expect(addMonths('2025-08-15', 18)).toBe('2027-02-15');
    expect(addMonths('2025-12-01', 1)).toBe('2026-01-01');
  });

  it('clamps to the end of shorter months', () => {
    expect(addMonths('2025-08-31', 18)).toBe('2027-02-28');
    expect(addMonths('2023-02-28', 12)).toBe('2024-02-28');
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28');
  });
});

describe('timeInGrade', () => {
  it('is part-way through the minimum at blue belt', () => {
    const result = timeInGrade(
      { belt: 'blue', stripes: 1 },
      [promotion('blue', 0, '2025-11-11'), promotion('blue', 1, '2026-06-01')],
      TODAY,
    );
    expect(result).toMatchObject({
      status: 'serving',
      nextBelt: 'purple',
      requiredMonths: 24,
      since: '2025-11-11',
      eligibleOn: '2027-11-11',
      approximate: false,
    });
    expect(result.status === 'serving' && result.progress).toBeCloseTo(0.5, 2);
  });

  it.each([
    ['blue', '2024-11-12', 'serving'],
    ['blue', '2024-11-11', 'met'],
    ['purple', '2025-05-12', 'serving'],
    ['purple', '2025-05-11', 'met'],
    ['brown', '2025-11-12', 'serving'],
    ['brown', '2025-11-11', 'met'],
  ] as const)('at %s belt since %s the minimum is %s', (belt, since, status) => {
    const result = timeInGrade({ belt, stripes: 0 }, [promotion(belt, 0, since)], TODAY);
    expect(result.status).toBe(status);
  });

  it('caps progress once the minimum is met', () => {
    const result = timeInGrade({ belt: 'brown', stripes: 3 }, [promotion('brown', 0, '2020-01-01')], TODAY);
    expect(result).toMatchObject({ status: 'met', progress: 1, eligibleOn: '2021-01-01' });
  });

  it('has no minimum at white belt', () => {
    expect(timeInGrade({ belt: 'white', stripes: 3 }, [promotion('white', 0, '2026-01-01')], TODAY)).toEqual({
      status: 'no-minimum',
      belt: 'white',
      nextBelt: 'blue',
    });
  });

  it('has no next belt at black belt', () => {
    expect(timeInGrade({ belt: 'black', stripes: 0 }, [], TODAY)).toEqual({
      status: 'top-belt',
      belt: 'black',
    });
  });

  it('needs a logged promotion at the current belt for a start date', () => {
    const result = timeInGrade({ belt: 'purple', stripes: 0 }, [promotion('blue', 0, '2022-01-01')], TODAY);
    expect(result).toEqual({
      status: 'start-unknown',
      belt: 'purple',
      nextBelt: 'brown',
      requiredMonths: 18,
    });
  });

  it('flags the date as approximate when only a stripe at this belt is logged', () => {
    const result = timeInGrade({ belt: 'blue', stripes: 2 }, [promotion('blue', 2, '2026-01-10')], TODAY);
    expect(result).toMatchObject({ status: 'serving', since: '2026-01-10', approximate: true });
  });
});
