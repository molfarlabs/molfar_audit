// Minimal FXServer server-side globals used by molfar_audit.
declare function GetNumResources(): number;
declare function GetResourceByFindIndex(index: number): string;
declare function GetResourceState(name: string): string;
declare function GetResourcePath(name: string): string;
declare function GetNumResourceMetadata(name: string, key: string): number;
declare function GetResourceMetadata(name: string, key: string, index: number): string;
declare function GetConvar(name: string, defaultValue: string): string;
declare function GetCurrentResourceName(): string;
declare function RegisterCommand(name: string, handler: (source: number, args: string[], raw: string) => void, restricted: boolean): void;
declare function GetRegisteredCommands(): { name: string }[];
declare function SetHttpHandler(handler: (req: FxHttpRequest, res: FxHttpResponse) => void): void;

interface FxHttpRequest {
  method: string;
  path: string;
  address: string;
  headers: Record<string, string>;
}

interface FxHttpResponse {
  writeHead(code: number, headers?: Record<string, string>): void;
  send(body?: string): void;
}
