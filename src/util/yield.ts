// FXServer runs JS on the server thread and setImmediate waits for the next server tick,
// so yield only after `budgetMs` of work instead of after every item.
export function createYielder(budgetMs = 20): () => Promise<void> {
  let last = performance.now();
  return async () => {
    if (performance.now() - last < budgetMs) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
    last = performance.now();
  };
}
