import { describe, it, expect } from 'vitest';
import { parseYMD, formatYMD, buildMonthGrid } from './DatePickerField';

describe('parseYMD', () => {
  it('parses a well-formed date string into numeric parts', () => {
    expect(parseYMD('2026-08-15')).toEqual({ year: 2026, month: 8, day: 15 });
  });

  it('returns null for an empty string', () => {
    expect(parseYMD('')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(parseYMD('not-a-date')).toBeNull();
    expect(parseYMD('2026-8-15')).toBeNull(); // not zero-padded
    expect(parseYMD('2026-08-15T00:00:00Z')).toBeNull(); // full ISO, not date-only
  });
});

describe('formatYMD', () => {
  it('zero-pads month and day', () => {
    expect(formatYMD(2026, 1, 5)).toBe('2026-01-05');
  });

  it('round-trips through parseYMD', () => {
    const ymd = formatYMD(2026, 12, 31);
    expect(parseYMD(ymd)).toEqual({ year: 2026, month: 12, day: 31 });
  });
});

describe('buildMonthGrid', () => {
  it('always returns exactly 42 cells (6 fixed weeks)', () => {
    // August 2026 starts on a Saturday and has 31 days — a month shape that
    // still fits leading + current + trailing cells within 42 exactly, as a
    // baseline sanity check before the tighter edge cases below.
    const cells = buildMonthGrid(2026, 8, '', undefined, '2026-08-01');
    expect(cells).toHaveLength(42);
  });

  it('pads leading cells for a month that starts mid-week', () => {
    // February 2026 starts on a Sunday (getDay() === 0) — zero leading cells.
    const feb = buildMonthGrid(2026, 2, '', undefined, '2026-02-01');
    expect(feb.filter((c) => c.inCurrentMonth)).toHaveLength(28); // 2026 is not a leap year
    expect(feb[0]).toMatchObject({ inCurrentMonth: true, day: 1 });

    // March 2026 starts on a Sunday too (Feb 2026 has 28 days) — check a
    // month that does NOT start on Sunday instead: April 2026 starts on a
    // Wednesday, so 3 leading (Mon/Tue... ) cells from March fill the grid.
    const apr = buildMonthGrid(2026, 4, '', undefined, '2026-04-01');
    const leading = apr.findIndex((c) => c.inCurrentMonth);
    expect(leading).toBe(new Date(2026, 3, 1).getDay());
    expect(apr[0].inCurrentMonth).toBe(false);
    expect(apr[0].isDisabled).toBe(true);
  });

  it('handles a leap-year February correctly (29 days)', () => {
    const leapFeb = buildMonthGrid(2024, 2, '', undefined, '2024-02-01');
    expect(leapFeb.filter((c) => c.inCurrentMonth)).toHaveLength(29);
  });

  it('handles a non-leap-year February correctly (28 days)', () => {
    const nonLeapFeb = buildMonthGrid(2026, 2, '', undefined, '2026-02-01');
    expect(nonLeapFeb.filter((c) => c.inCurrentMonth)).toHaveLength(28);
  });

  it('rolls leading cells back into the previous December when viewing January', () => {
    // January 2026 starts on a Thursday, so the grid always has leading
    // filler cells — assert this unconditionally so a grid-shape regression
    // fails the test instead of silently skipping the check.
    const jan = buildMonthGrid(2026, 1, '', undefined, '2026-01-01');
    const firstCell = jan[0];
    expect(firstCell.inCurrentMonth).toBe(false);
    expect(firstCell.ymd.startsWith('2025-12-')).toBe(true);
  });

  it('rolls trailing cells forward into the next January when viewing December', () => {
    // December 2026 starts on a Tuesday and has 31 days — 4 + 31 = 35 cells,
    // so the 42-cell grid always has trailing filler cells.
    const dec = buildMonthGrid(2026, 12, '', undefined, '2026-12-01');
    const lastCell = dec[dec.length - 1];
    expect(lastCell.inCurrentMonth).toBe(false);
    expect(lastCell.ymd.startsWith('2027-01-')).toBe(true);
  });

  it('disables every in-month day strictly before `min`, and nothing on/after it', () => {
    const cells = buildMonthGrid(2026, 8, '', '2026-08-15', '2026-08-01');
    for (const cell of cells.filter((c) => c.inCurrentMonth)) {
      expect(cell.isDisabled).toBe(cell.ymd < '2026-08-15');
    }
  });

  it('does not disable any in-month day when `min` is undefined', () => {
    const cells = buildMonthGrid(2026, 8, '', undefined, '2026-08-01');
    expect(cells.some((c) => c.inCurrentMonth && c.isDisabled)).toBe(false);
  });

  it('always marks out-of-month filler cells as disabled, regardless of `min`', () => {
    const cells = buildMonthGrid(2026, 8, '', undefined, '2026-08-01');
    expect(cells.filter((c) => !c.inCurrentMonth).every((c) => c.isDisabled)).toBe(true);
  });

  it('flags exactly the cell matching `todayYMD` as isToday', () => {
    const cells = buildMonthGrid(2026, 8, '', undefined, '2026-08-15');
    const todayCells = cells.filter((c) => c.isToday);
    expect(todayCells).toHaveLength(1);
    expect(todayCells[0]).toMatchObject({ ymd: '2026-08-15', inCurrentMonth: true });
  });

  it('flags exactly the cell matching `value` as isSelected', () => {
    const cells = buildMonthGrid(2026, 8, '2026-08-20', undefined, '2026-08-01');
    const selected = cells.filter((c) => c.isSelected);
    expect(selected).toHaveLength(1);
    expect(selected[0].ymd).toBe('2026-08-20');
  });

  it('selects nothing when `value` is an empty string', () => {
    const cells = buildMonthGrid(2026, 8, '', undefined, '2026-08-01');
    expect(cells.some((c) => c.isSelected)).toBe(false);
  });
});
