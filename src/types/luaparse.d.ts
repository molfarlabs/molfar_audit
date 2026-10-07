declare module 'luaparse' {
  const luaparse: { parse(code: string, options?: Record<string, unknown>): any };
  export default luaparse;
}
