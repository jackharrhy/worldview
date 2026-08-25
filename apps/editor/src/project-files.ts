import { mapSourceFingerprint } from '@jackharrhy/worldview-editor/core';

export interface EditorFileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: Blob | string): Promise<void>;
    close(): Promise<void>;
    abort?(): Promise<void>;
  }>;
}

interface FilePickerWindow extends Window {
  showOpenFilePicker?: (options: {
    readonly multiple: boolean;
    readonly types: readonly {
      readonly description: string;
      readonly accept: Readonly<Record<string, readonly string[]>>;
    }[];
  }) => Promise<readonly EditorFileHandle[]>;
}

export interface OpenedEditorFile {
  readonly file: File;
  readonly handle: EditorFileHandle | null;
}

export class ExternalFileChangeError extends Error {
  public constructor(public readonly actualFingerprint: string) {
    super('The map changed on disk after it was opened. Reload it or save a copy instead.');
    this.name = 'ExternalFileChangeError';
  }
}

export async function pickMapFile(
  fallbackInput: HTMLInputElement,
): Promise<OpenedEditorFile | null> {
  const picker = (globalThis.window as FilePickerWindow | undefined)?.showOpenFilePicker;
  if (picker) {
    try {
      const [handle] = await picker({
        multiple: false,
        types: [{ description: 'Quake map source', accept: { 'text/plain': ['.map'] } }],
      });
      if (!handle) return null;
      return { file: await handle.getFile(), handle };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null;
      throw error;
    }
  }
  fallbackInput.click();
  return null;
}

export async function saveMapFile(
  handle: EditorFileHandle,
  expectedFingerprint: string,
  text: string,
): Promise<string> {
  const current = await handle.getFile();
  const actualFingerprint = mapSourceFingerprint(await current.text());
  if (actualFingerprint !== expectedFingerprint) {
    throw new ExternalFileChangeError(actualFingerprint);
  }
  const writable = await handle.createWritable();
  try {
    await writable.write(new Blob([text], { type: 'text/plain' }));
    await writable.close();
  } catch (error) {
    await writable.abort?.().catch(() => undefined);
    throw error;
  }
  return mapSourceFingerprint(text);
}

export function downloadMapCopy(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
