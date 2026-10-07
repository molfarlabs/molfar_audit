import { describe, expect, it } from 'vitest';
import { createYielder } from '../src/util/yield';

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
