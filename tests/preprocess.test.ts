import { describe, expect, it } from 'vitest';
import { preprocess } from '../src/lua/preprocess';

describe('preprocess', () => {
  it('turns backtick hashes into strings', () => {
    expect(preprocess('local h = `adder`')).toBe('local h = "adder"');
  });
  it('leaves backticks inside strings and comments alone', () => {
    expect(preprocess("local s = '`x`' -- `y`")).toBe("local s = '`x`' -- `y`");
  });
  it('rewrites compound assignment', () => {
    expect(preprocess('x += 1')).toBe('x = x + 1');
    expect(preprocess('  t.count -= y * 2 -- dec')).toBe('  t.count = t.count - y * 2 -- dec');
    expect(preprocess('s ..= "b"')).toBe('s = s .. "b"');
    expect(preprocess('t[i] *= 2')).toBe('t[i] = t[i] * 2');
  });
  it('rewrites compound assignment in the middle of a line', () => {
    expect(preprocess('if self.model then options_mt.size += 1 end')).toBe('if self.model then options_mt.size = options_mt.size + 1 end');
    expect(preprocess('timeOut -= 10 Wait(10)')).toBe('timeOut = timeOut - 10 Wait(10)');
  });
  it('turns C-style block comments into Lua comments, keeping lines', () => {
    const src = 'local a = {\n\tx = 1,\n\t/*\n\tb = ]] 2,\n\t*/\n}';
    const out = preprocess(src);
    expect(out.split('\n').length).toBe(src.split('\n').length);
    expect(out).toContain('--[=[');
    expect(out).not.toContain('/*');
  });
  it('does not touch comparisons and plain assignment', () => {
    for (const line of ['if a <= b then end', 'local ok = a == b', 'x = y', 'if a >= b then end', 'local n = a ~= b']) {
      expect(preprocess(line)).toBe(line);
    }
  });
  it('removes safe navigation', () => {
    expect(preprocess('local v = a?.b?.c')).toBe('local v = a .b .c');
    expect(preprocess('local v = a?[1]')).toBe('local v = a [1]');
    expect(preprocess('obj?:m()')).toBe('obj :m()');
  });
  it('blanks const/close attributes keeping length', () => {
    expect(preprocess('local x <const> = 5')).toBe('local x ' + ' '.repeat(7) + ' = 5');
    expect(preprocess('local f <close> = io.open("a")')).toBe('local f ' + ' '.repeat(7) + ' = io.open("a")');
  });
  it('rewrites in-unpacking', () => {
    expect(preprocess('local a, b in t')).toBe('local a, b = (t).a, (t).b');
  });
  it('keeps safe navigation inside long strings', () => {
    expect(preprocess('local s = [[a?.b]]')).toBe('local s = [[a?.b]]');
    expect(preprocess('local s = [==[`x`]==]')).toBe('local s = [==[`x`]==]');
  });
  it('preserves the number of lines', () => {
    const src = 'local a = 1\n--[[ x += 1\n a?.b ]]\nlocal s = [[\n`q`\n]]\nb += 2\n';
    expect(preprocess(src).split('\n').length).toBe(src.split('\n').length);
  });
  it('survives unterminated strings', () => {
    expect(() => preprocess('local s = "abc\nx = 1')).not.toThrow();
  });
});
