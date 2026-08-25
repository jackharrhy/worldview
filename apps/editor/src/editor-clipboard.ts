import {
  objectClipboardPasteOffset,
  createSequentialIdFactory,
  parseFaceAttributeClipboard,
  parseMap,
  selectedFaceReferences,
  serializeFaceAttributeClipboard,
  serializeObjectClipboard,
  type EditorPointerPositionEvent,
  type EditorSelection,
  type EditorSession,
} from '@jackharrhy/worldview-editor';

export interface EditorClipboardContext {
  readonly pointer: EditorPointerPositionEvent | null;
  readonly textureLock: boolean;
  readonly targetGroupId: string | null;
  readonly selectToolActive: boolean;
}

export interface EditorClipboardOptions {
  readonly session: () => EditorSession;
  readonly context: () => EditorClipboardContext;
  readonly activateSelectTool: () => void;
  readonly setStatus: (message: string) => void;
}

/** Owns clipboard parsing, fallback storage, paste IDs, and user-facing outcomes. */
export class EditorClipboard {
  private sequence = 0;
  private fallbackText: string | null = null;

  public constructor(private readonly options: EditorClipboardOptions) {}

  public selectionText(
    selection: EditorSelection | null = this.options.session().selection,
  ): string | null {
    const session = this.options.session();
    try {
      const text = selection?.faceId
        ? serializeFaceAttributeClipboard(session.document, selection)
        : serializeObjectClipboard(session.document, selection);
      if (text) this.fallbackText = text;
      return text;
    } catch (error) {
      this.options.setStatus(error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  public async copy(
    selection: EditorSelection | null = this.options.session().selection,
  ): Promise<void> {
    const text = this.selectionText(selection);
    if (!text) {
      this.options.setStatus('Select one or more objects or a face before copying.');
      return;
    }
    const faceAttributes = Boolean(selection?.faceId);
    try {
      await navigator.clipboard?.writeText(text);
      this.options.setStatus(
        faceAttributes
          ? 'Copied face material and attributes.'
          : 'Copied selected objects as map text.',
      );
    } catch {
      this.options.setStatus(
        faceAttributes
          ? 'Copied face material and attributes inside Worldview.'
          : 'Copied selected objects inside Worldview.',
      );
    }
  }

  public async paste(atPointer: boolean, targetFace: EditorSelection | null = null): Promise<void> {
    const text = await this.readText();
    if (!text) {
      this.options.setStatus('The clipboard does not contain map text or face attributes.');
      return;
    }
    this.pasteText(text, atPointer, targetFace);
  }

  public pasteText(
    text: string,
    atPointer: boolean,
    targetFace: EditorSelection | null = null,
  ): boolean {
    try {
      const faceAttributes = parseFaceAttributeClipboard(text);
      if (faceAttributes) return this.pasteFaceAttributes(text, faceAttributes, targetFace);
      return this.pasteObjects(text, atPointer);
    } catch (error) {
      this.options.setStatus(
        `Clipboard: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  private async readText(): Promise<string | null> {
    try {
      const systemText = await navigator.clipboard?.readText();
      if (systemText?.trim()) return systemText;
    } catch {
      // Clipboard permission is optional; copies made inside the editor remain available.
    }
    return this.fallbackText;
  }

  private pasteFaceAttributes(
    text: string,
    attributes: NonNullable<ReturnType<typeof parseFaceAttributeClipboard>>,
    targetFace: EditorSelection | null,
  ): boolean {
    const session = this.options.session();
    if (targetFace?.brushId && targetFace.faceId) {
      session.selectFace({ brushId: targetFace.brushId, faceId: targetFace.faceId });
    }
    const targets = selectedFaceReferences(session.selection);
    if (targets.length === 0 || !session.pasteFaceAttributes(attributes)) {
      this.options.setStatus('Select one or more target faces before pasting face attributes.');
      return false;
    }
    this.fallbackText = text;
    this.options.setStatus(
      `Pasted ${attributes.material} and its attributes onto ${targets.length} ${targets.length === 1 ? 'face' : 'faces'} as one undo step.`,
    );
    return true;
  }

  private pasteObjects(text: string, atPointer: boolean): boolean {
    const session = this.options.session();
    const context = this.options.context();
    this.sequence += 1;
    const clipboard = parseMap(
      text,
      createSequentialIdFactory(`clipboard-source-${this.sequence}`),
    );
    const pointer = atPointer ? context.pointer : null;
    if (atPointer && !pointer) {
      this.options.setStatus('Move the pointer over a source viewport before using Paste here.');
      return false;
    }
    const offset = pointer
      ? objectClipboardPasteOffset(clipboard, pointer.point, pointer.surfaceNormal)
      : ([0, 0, 0] as const);
    if (!offset) {
      this.options.setStatus('The clipboard map contains no pasteable objects.');
      return false;
    }
    if (!context.selectToolActive) this.options.activateSelectTool();
    const changed = session.pasteObjects(
      clipboard,
      createSequentialIdFactory(`clipboard-paste-${this.sequence}`),
      offset,
      context.textureLock,
      context.targetGroupId,
    );
    if (!changed) {
      this.options.setStatus('The clipboard map contains no pasteable objects.');
      return false;
    }
    this.fallbackText = text;
    this.options.setStatus(
      pointer
        ? `Pasted objects at the ${pointer.viewport.toUpperCase()} pointer as one undo step.`
        : 'Pasted objects at their copied position as one undo step.',
    );
    return true;
  }
}
