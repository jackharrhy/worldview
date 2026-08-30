import type { EditorElements } from './editor-elements.js';
import type { EditorThemePreference } from './editor-shell-state.js';
import { resolveEditorRenderTheme } from './render-theme.js';
import type { EditorState } from './editor-state.js';

const STORAGE_KEY = 'worldview.editor.theme';

function storedPreference(): EditorThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'dark' || value === 'light' || value === 'system' ? value : 'system';
  } catch {
    return 'system';
  }
}

export class ThemePresenter {
  private preference = storedPreference();
  private readonly systemTheme = window.matchMedia('(prefers-color-scheme: light)');

  public constructor(
    private readonly state: EditorState,
    private readonly ui: EditorElements,
  ) {}

  public connect(): void {
    this.ui.theme.bind(
      {
        setPreference: (preference) => {
          this.preference = preference;
          this.ui.theme.setPreference(preference);
          try {
            localStorage.setItem(STORAGE_KEY, preference);
          } catch {
            // Theme selection still applies when storage is unavailable.
          }
          this.apply(true);
        },
      },
      this.preference,
    );
    this.apply(false);
    this.systemTheme.addEventListener('change', () => {
      if (this.preference === 'system') this.apply(true);
    });
  }

  private apply(updateRenderer: boolean): void {
    const theme =
      this.preference === 'system'
        ? this.systemTheme.matches
          ? 'light'
          : 'dark'
        : this.preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute(
        'content',
        theme === 'light' ? 'oklch(96.5% 0.004 255)' : 'oklch(12.63% 0.0069 258.37)',
      );
    if (updateRenderer) this.state.renderer?.setTheme(resolveEditorRenderTheme());
  }
}
