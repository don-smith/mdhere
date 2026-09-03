import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/', 'src-tauri/gen/', 'src-tauri/target/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx}']
  })),
  ...svelte.configs['flat/recommended'],
  {
    files: ['**/*.svelte'],
    languageOptions: { parserOptions: { parser: tseslint.parser } }
  },
  {
    files: ['**/*.{js,mjs,ts,svelte}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } }
  }
];
