/**
 * Minimal Node typings for Jest tests that read source files (@types/node is not a dependency
 * of the app, and the app code itself must not use Node APIs).
 */
declare module 'node:fs' {
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function statSync(path: string): { isDirectory(): boolean };
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
}

declare const __dirname: string;
