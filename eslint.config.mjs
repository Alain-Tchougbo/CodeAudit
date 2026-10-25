import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['packages/analysis-jobs/test/fixtures/**', 'packages/analyzer/test/fixtures/**', '**/dist/**', '**/node_modules/**', '**/coverage/**', '**/generated/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.{js,mjs,cjs,ts,vue}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser }, parserOptions: { parser: tseslint.parser } },
  },
);
