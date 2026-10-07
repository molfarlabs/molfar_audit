export const UNSET = '\u0000unset';

export type Side = 'client' | 'server' | 'shared';

export interface ResourceFile {
  rel: string;
  size: number;
  escrowed: boolean;
}

export interface ResourceInfo {
  name: string;
  state: string;
  path: string;
  category: string;
  manifest: Record<string, string[]>;
  files: ResourceFile[];
}

export interface ItemDef {
  label: string;
  image?: string;
}

export interface LuaFile {
  resource: string;
  rel: string;
  side: Side;
  ast: any | null;
  error: string | null;
  ignores: Map<number, Set<string> | 'all'>;
  strings: Set<string>;
}

export interface ServerSnapshot {
  takenAt: string;
  serverBuild: number | null;
  recommendedBuild: number | null;
  resources: ResourceInfo[];
  convars: Record<string, string>;
  db: { user: string | null; passwordEmpty: boolean | null };
  items: Record<string, ItemDef> | null;
  itemImages: Set<string>; // lower-cased file names in ox_inventory/web/images
  lua: Map<string, LuaFile>;
  unreadableFiles: number;
  skippedLarge: string[]; // 'resource/rel' of Lua files too large to parse without hitching the server
}
