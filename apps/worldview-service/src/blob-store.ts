import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface StoredBlob {
  readonly sha256: string;
  readonly size: number;
}

export interface BlobStore {
  put(data: Uint8Array): Promise<StoredBlob>;
  get(sha256: string): Promise<Uint8Array | null>;
}

function validHash(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

export class FileBlobStore implements BlobStore {
  public constructor(private readonly root: string) {}

  private path(hash: string): string {
    if (!validHash(hash)) throw new Error('Invalid blob hash');
    return join(this.root, hash.slice(0, 2), hash.slice(2));
  }

  public async put(data: Uint8Array): Promise<StoredBlob> {
    const sha256 = createHash('sha256').update(data).digest('hex');
    const destination = this.path(sha256);
    await mkdir(dirname(destination), { recursive: true });
    try {
      const existing = await stat(destination);
      if (existing.size !== data.byteLength) throw new Error('Blob hash collision');
      return { sha256, size: data.byteLength };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, data, { flag: 'wx' });
    try {
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    return { sha256, size: data.byteLength };
  }

  public async get(sha256: string): Promise<Uint8Array | null> {
    try {
      return await readFile(this.path(sha256));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
}
