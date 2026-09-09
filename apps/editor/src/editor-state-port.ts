import type { EditorState } from './editor-state.js';

/** Presenters declare their readable state and the fields they own and may mutate. */
export type EditorStatePort<
  Keys extends keyof EditorState,
  WritableKeys extends Keys = never,
> = Readonly<Pick<EditorState, Exclude<Keys, WritableKeys>>> & Pick<EditorState, WritableKeys>;
