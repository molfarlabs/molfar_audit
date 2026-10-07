import { describe, expect, it } from 'vitest';
import { createYielder, idle, startBlockMeter } from '../src/util/yield';

describe('createYielder', () => {
  it('does not yield before the budget is used up', async () => {
    const tick = createYielder(10_000);
    let ran = false;
    setImmediate(() => { ran = true; });
    for (let i = 0; i < 100; i++) await tick();
    expect(ran).toBe(false);
  });
  it('yields to the event loop once the budget is used up', async () => {
    const tick = createYielder(0);
    let ran = false;
    setImmediate(() => { ran = true; });
    await tick();
    expect(ran).toBe(true);
  });
});

describe('startBlockMeter', () => {
  it('reports the longest synchronous slice between yields, not the scheduler gap', async () => {
    const stop = startBlockMeter();
    const tick = createYielder(20);
    const busy = (ms: number) => { const end = performance.now() + ms; while (performance.now() < end) { /* work */ } };
    busy(35);
    await tick();
    await idle(new Promise((r) => setTimeout(r, 80))); // waiting on I/O must not count
    busy(10);
    await tick();
    const max = stop();
    expect(max).toBeGreaterThanOrEqual(35);
    expect(max).toBeLessThan(70);
  });
});
