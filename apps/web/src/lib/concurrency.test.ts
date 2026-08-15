import { describe, it, expect, vi } from 'vitest';
import { runWithConcurrency } from './concurrency';

describe('runWithConcurrency', () => {
  it('processes every item with at most `concurrency` workers running at once', async () => {
    const items = [1, 2, 3, 4, 5];
    let active = 0;
    let maxActive = 0;
    const processed: number[] = [];

    await runWithConcurrency(items, async (item) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 0));
      processed.push(item);
      active--;
    }, 2);

    expect(processed.sort()).toEqual(items);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('rejects instead of silently completing when given a non-positive concurrency', async () => {
    const worker = vi.fn().mockResolvedValue(undefined);
    await expect(runWithConcurrency([1, 2, 3], worker, 0)).rejects.toThrow(/positive integer/);
    expect(worker).not.toHaveBeenCalled();
  });

  it('rejects on a non-finite concurrency', async () => {
    const worker = vi.fn().mockResolvedValue(undefined);
    await expect(runWithConcurrency([1, 2, 3], worker, NaN)).rejects.toThrow(/positive integer/);
    expect(worker).not.toHaveBeenCalled();
  });

  it('rejects a fractional concurrency instead of silently running one worker', async () => {
    const worker = vi.fn().mockResolvedValue(undefined);
    await expect(runWithConcurrency([1, 2, 3], worker, 1.5)).rejects.toThrow(/positive integer/);
    expect(worker).not.toHaveBeenCalled();
  });

  it('resolves immediately without calling the worker on an empty item list', async () => {
    const worker = vi.fn().mockResolvedValue(undefined);
    await expect(runWithConcurrency([], worker, 3)).resolves.toBeUndefined();
    expect(worker).not.toHaveBeenCalled();
  });

  it('waits for every started worker loop to finish before rethrowing, instead of abandoning in-flight work', async () => {
    const items = [1, 2, 3, 4];
    let inFlight = 0;
    let maxInFlight = 0;
    const finished: number[] = [];

    const worker = async (item: number) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      if (item === 2) {
        inFlight--;
        throw new Error('boom');
      }
      // A slower "other" worker that must be allowed to finish even though
      // item 2 fails on a sibling loop.
      await new Promise((resolve) => setTimeout(resolve, 5));
      finished.push(item);
      inFlight--;
    };

    await expect(runWithConcurrency(items, worker, 2)).rejects.toThrow('boom');
    // Items started before the failure on other loops must have completed
    // (not been abandoned mid-flight) by the time runWithConcurrency rejects.
    expect(finished).toContain(1);
    expect(inFlight).toBe(0);
  });
});
