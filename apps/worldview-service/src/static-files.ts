import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';

const mediaTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

export async function serveStaticFile(
  pathname: string,
  root: string,
  response: ServerResponse,
): Promise<boolean> {
  const candidate = pathname === '/' ? 'index.html' : pathname.slice(1);
  const relative = normalize(candidate).replace(/^(?:\.\.[/\\])+/, '');
  let path = join(root, relative);
  try {
    const info = await stat(path);
    if (!info.isFile()) return false;
  } catch {
    if (extname(relative)) return false;
    path = join(root, 'index.html');
    try {
      await stat(path);
    } catch {
      return false;
    }
  }
  response.writeHead(200, {
    'Content-Type': mediaTypes[extname(path)] ?? 'application/octet-stream',
  });
  createReadStream(path).pipe(response);
  return true;
}
