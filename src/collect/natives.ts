export interface Natives {
  resourceNames(): string[];
  state(name: string): string;
  path(name: string): string;
  metadata(name: string, key: string): string[];
  convar(name: string, def: string): string;
  oxItems(): Record<string, any> | null;
}

export function fxNatives(): Natives {
  return {
    resourceNames() {
      const out: string[] = [];
      const count = GetNumResources();
      for (let i = 0; i < count; i++) {
        const name = GetResourceByFindIndex(i);
        if (name) out.push(name);
      }
      return out;
    },
    state: (name) => GetResourceState(name),
    path: (name) => GetResourcePath(name),
    metadata(name, key) {
      const out: string[] = [];
      const count = GetNumResourceMetadata(name, key);
      for (let i = 0; i < count; i++) {
        const value = GetResourceMetadata(name, key, i);
        if (value !== null && value !== undefined) out.push(value);
      }
      return out;
    },
    convar: (name, def) => GetConvar(name, def),
    oxItems() {
      try {
        // globalThis.exports is the FiveM exports proxy; plain `exports` is the CommonJS module object in the bundle.
        return (globalThis as any).exports.ox_inventory.Items() ?? null;
      } catch {
        return null;
      }
    },
  };
}
