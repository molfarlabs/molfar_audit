import { describe, expect, it } from 'vitest';
import { parseMysqlConnection } from '../src/util/secrets';

describe('parseMysqlConnection', () => {
  it('parses URI format with encoded password', () => {
    expect(parseMysqlConnection('mysql://fivem:pa%40ss@127.0.0.1/qbox?charset=utf8mb4')).toEqual({ user: 'fivem', password: 'pa@ss' });
  });
  it('parses URI without password', () => {
    expect(parseMysqlConnection('mysql://root@localhost/db')).toEqual({ user: 'root', password: '' });
  });
  it('parses key=value format', () => {
    expect(parseMysqlConnection('user=root;password=;host=localhost;database=es')).toEqual({ user: 'root', password: '' });
    expect(parseMysqlConnection('server=localhost;uid=bob;pwd=secret;database=x')).toEqual({ user: 'bob', password: 'secret' });
  });
  it('returns nulls for empty or unknown input', () => {
    expect(parseMysqlConnection('')).toEqual({ user: null, password: null });
    expect(parseMysqlConnection('garbage')).toEqual({ user: null, password: null });
  });
});
