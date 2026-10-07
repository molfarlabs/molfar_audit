// FXServer runs JS on the server thread and setImmediate waits for the next server tick,
// so work yields only after `budgetMs` of continuous work. All yielders share one clock,
// which also lets the block meter report the longest continuous slice of audit work.
let lastResume = performance.now();
let maxSlice = 0;

function endSlice(): void {
  maxSlice = Math.max(maxSlice, performance.now() - lastResume);
}

export function createYielder(budgetMs = 20): () => Promise<void> {
  return async () => {
    if (performance.now() - lastResume < budgetMs) return;
    endSlice();
    await new Promise<void>((resolve) => setImmediate(resolve));
    lastResume = performance.now();
  };
}

// Wrap awaits on network/disk so the waiting time is not counted as blocking.
export async function idle<T>(work: Promise<T>): Promise<T> {
  endSlice();
  try {
    return await work;
  } finally {
    lastResume = performance.now();
  }
}

export function startBlockMeter(): () => number {
  lastResume = performance.now();
  maxSlice = 0;
  return () => {
    endSlice();
    return Math.round(maxSlice);
  };
}
