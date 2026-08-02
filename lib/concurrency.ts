/**
 * Run an async worker over a list with a bounded number of items in flight.
 *
 * Results come back in input order. A rejected worker does not cancel the rest;
 * callers get the rejection for that slot and decide what to do.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  if (items.length === 0) return results;

  const size = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  let cursor = 0;

  async function run(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(Array.from({ length: size }, run));
  return results;
}
