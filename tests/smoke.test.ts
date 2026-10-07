import { describe, expect, it } from 'vitest';
import { SEVERITY_ORDER } from '../src/rules/types';

describe('scaffold', () => {
  it('orders severities critical first', () => {
    expect(SEVERITY_ORDER.critical).toBeLessThan(SEVERITY_ORDER.info);
  });
});
