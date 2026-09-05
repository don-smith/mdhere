export type ThemeAppearance = 'light' | 'dark';

export interface ShellColors {
  background: string;
  panel: string;
  surface: string;
  raisedSurface: string;
  foreground: string;
  foregroundStrong: string;
  muted: string;
  faint: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentForeground: string;
  accentSoft: string;
  hover: string;
  selected: string;
  focus: string;
  danger: string;
  warning: string;
  overlay: string;
}

export interface Theme {
  schemaVersion: 2;
  id: string;
  name: string;
  appearance: ThemeAppearance;
  shell: ShellColors;
  css: string;
  builtin: boolean;
}

export interface PresentationSnapshot {
  revision: number;
  themes: Theme[];
  selected: Theme;
  diagnostics: string[];
  frontMatterExpanded: boolean;
  sidebarWidth: number;
  zoom: number;
}
