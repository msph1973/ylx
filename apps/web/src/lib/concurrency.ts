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
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
}
