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
    await expect(runWithConcurrency([1, 2, 3], worker, 0)).rejects.toThrow(/positive finite number/);
    expect(worker).not.toHaveBeenCalled();
  });

  it('rejects on a non-finite concurrency', async () => {
    const worker = vi.fn().mockResolvedValue(undefined);
    await expect(runWithConcurrency([1, 2, 3], worker, NaN)).rejects.toThrow(/positive finite number/);
    expect(worker).not.toHaveBeenCalled();
  });

  it('resolves immediately without calling the worker on an empty item list', async () => {
    const worker = vi.fn().mockResolvedValue(undefined);
    await expect(runWithConcurrency([], worker, 3)).resolves.toBeUndefined();
    expect(worker).not.toHaveBeenCalled();
  });
});
