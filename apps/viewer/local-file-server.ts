import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export interface LocalFixtureFile {
  readonly filename: string;
  readonly size: number;
}

function containedPath(root: string, filename: string): boolean {
  const relative = path.relative(root, filename);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** Resolves percent-escaped local fixture URLs without allowing lexical or symlink traversal. */
export function createLocalFixtureResolver(
  localRoot: string,
): (requestUrl: string) => Promise<LocalFixtureFile | null> {
  const realRoot = realpath(localRoot);
  return async (requestUrl) => {
    let relativePath: string;
    try {
      const pathname = new URL(requestUrl, 'http://localhost').pathname;
      if (!pathname.startsWith('/local/')) return null;
      relativePath = decodeURIComponent(pathname.slice('/local/'.length));
    } catch {
      return null;
    }

    const root = await realRoot;
    const candidate = path.resolve(root, relativePath);
    if (!containedPath(root, candidate)) return null;
    let filename: string;
    try {
      filename = await realpath(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    if (!containedPath(root, filename)) return null;
    const information = await stat(filename);
    return information.isFile() ? { filename, size: information.size } : null;
  };
}
