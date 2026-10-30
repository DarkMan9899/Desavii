import { describe, test, expect } from 'vitest';
import { fitCount } from './usePriorityNav.js';

// Five links of 100px with 16px gaps make a 564px row; "More" is 80px.
const WIDTHS = [100, 100, 100, 100, 100];
const GAP = 16;
const MORE = 80;

describe('fitCount (priority+ navigation)', () => {
  test('keeps every link when the whole row fits — no "More" at all', () => {
    expect(fitCount(WIDTHS, MORE, GAP, 564)).toBe(5);
  });

  test('keeps as many leading links as fit beside "More"', () => {
    // 3 links (332px) + gap + More (96px) = 428px.
    expect(fitCount(WIDTHS, MORE, GAP, 428)).toBe(3);
    expect(fitCount(WIDTHS, MORE, GAP, 427)).toBe(2);
  });

  test('keeps only "More" when not even one link fits beside it', () => {
    expect(fitCount(WIDTHS, MORE, GAP, 150)).toBe(0);
  });

  test('a row with no links needs no room', () => {
    expect(fitCount([], MORE, GAP, 0)).toBe(0);
  });
});
