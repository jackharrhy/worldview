import { describe, expect, it, vi } from 'vitest';
import { mapSourceFingerprint } from '@jackharrhy/worldview-editor/core';

import {
  ExternalFileChangeError,
  saveMapFile,
  type EditorFileHandle,
} from '../src/project-files.js';

function handleFor(text: string) {
  let diskText = text;
  const write = vi.fn(async (data: Blob | string) => {
    diskText = typeof data === 'string' ? data : await data.text();
  });
  const close = vi.fn(() => Promise.resolve());
  const abort = vi.fn(() => Promise.resolve());
  const createWritable = vi.fn(() => Promise.resolve({ write, close, abort }));
  const handle: EditorFileHandle = {
    name: 'test.map',
    getFile: () => Promise.resolve(new File([diskText], 'test.map')),
    createWritable,
  };
  return { handle, createWritable, write, close, abort, diskText: () => diskText };
}

describe('source-safe file writes', () => {
  it('checks the exact opened fingerprint before creating a writable stream', async () => {
    const fixture = handleFor('changed externally');

    await expect(
      saveMapFile(fixture.handle, mapSourceFingerprint('opened text'), 'editor text'),
    ).rejects.toBeInstanceOf(ExternalFileChangeError);
    expect(fixture.createWritable).not.toHaveBeenCalled();
    expect(fixture.diskText()).toBe('changed externally');
  });

  it('writes and closes only after the source fingerprint still matches', async () => {
    const fixture = handleFor('opened text');

    await expect(
      saveMapFile(fixture.handle, mapSourceFingerprint('opened text'), 'saved text'),
    ).resolves.toBe(mapSourceFingerprint('saved text'));
    expect(fixture.write).toHaveBeenCalledOnce();
    expect(fixture.close).toHaveBeenCalledOnce();
    expect(fixture.abort).not.toHaveBeenCalled();
    expect(fixture.diskText()).toBe('saved text');
  });
});
