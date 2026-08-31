import type { EditorState } from './editor-state.js';

/**
 * A compile-time view of the application model used by one presenter or input adapter.
 *
 * Presenter files deliberately cannot depend on `EditorState` directly. Each presenter names the
 * exact state it reads and, separately, the fields it owns and may mutate. Everything else is
 * readonly. The composition root remains responsible for supplying the shared backing model, so C3
 * can replace that model without widening these boundaries.
 */
export type EditorStatePort<
  Keys extends keyof EditorState,
  WritableKeys extends Keys = never,
> = Readonly<Pick<EditorState, Exclude<Keys, WritableKeys>>> & Pick<EditorState, WritableKeys>;
