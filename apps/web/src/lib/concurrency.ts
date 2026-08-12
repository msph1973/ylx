// Run `worker` over `items` with at most `concurrency` in flight at once.
// Shared by any admin upload flow that needs a bounded worker pool instead of
// either fully sequential (wastes time waiting on the network) or fully
// unbounded (floods bandwidth/memory and makes progress unreadable)
// concurrency — see UploadPage.tsx and FinalPhotosSection.tsx.
export async function runWithConcurrency<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number,
): Promise<void> {
  // A non-positive/non-finite/non-integer `concurrency` would make
  // `Array.from({ length })` spin up zero (or a fractional, effectively one)
  // worker below — silently "completing" a batch that never ran, or running
  // fewer workers than intended. Fail loudly instead of returning a false
  // success.
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`runWithConcurrency: concurrency must be a positive integer, got ${concurrency}`);
  }
  let cursor = 0;
  let hasError = false;
  let firstError: unknown;
  const run = async () => {
    while (cursor < items.length && !hasError) {
      const item = items[cursor++];
      try {
        await worker(item);
      } catch (err) {
        // Stop this loop from claiming more items, but don't reject the
        // whole Promise.all yet — that would let the OTHER loops keep
        // running unawaited in the background after this function has
        // already returned/thrown to the caller, who may then tear down
        // state (e.g. clear an "isUploading" flag) while work is still
        // in flight. Record the failure and let every loop wind down
        // first, then rethrow below.
        if (!hasError) {
          hasError = true;
          firstError = err;
        }
        return;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  if (hasError) {
    throw firstError;
  }
}
