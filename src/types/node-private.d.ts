declare namespace NodeJS {
  interface Module {
    _compile(source: string, filename: string): void;
  }
}

declare module "node:module" {
  export function _load(
    request: string,
    parent: NodeModule | null,
    isMain: boolean,
  ): unknown;
}

declare module "module" {
  export function _load(
    request: string,
    parent: NodeModule | null,
    isMain: boolean,
  ): unknown;
}
