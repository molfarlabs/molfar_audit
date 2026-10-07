const TICK_MS = 10;

// Measures the longest event-loop stall while running; FXServer runs JS on the server thread,
// so a stall here is a server hitch.
export function startLagMonitor(): () => number {
  let max = 0;
  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    max = Math.max(max, now - last - TICK_MS);
    last = now;
  }, TICK_MS);
  return () => {
    clearInterval(timer);
    max = Math.max(max, performance.now() - last - TICK_MS);
    return Math.max(0, Math.round(max));
  };
}
