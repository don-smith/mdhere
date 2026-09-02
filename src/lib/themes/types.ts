export type ThemeAppearance = 'light' | 'dark';

export interface ShellColors {
  background: string;
  foreground: string;
  muted: string;
  border: string;
  accent: string;
}

export interface Theme {
  schemaVersion: 1;
  id: string;
  name: string;
  appearance: ThemeAppearance;
  shell: ShellColors;
  css: string;
  builtin: boolean;
}

export interface ThemeSnapshot {
  themes: Theme[];
  selected: Theme;
  diagnostics: string[];
}
