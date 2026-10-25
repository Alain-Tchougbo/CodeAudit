import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import type { AnalysisProfile, RuleConfiguration } from './types';
import tseslint from 'typescript-eslint';
import tseslintMetadata from 'typescript-eslint/package.json';
import { jsxUsesVars } from './jsx-uses-vars';
import { version as typescriptVersion } from 'typescript';

export const ANALYSIS_PROFILE_VERSION = 'codeaudit-js-ts-v1';
export const SUPPORTED_EXTENSIONS = Object.freeze(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'] as const);
export const IGNORED_DIRECTORIES = Object.freeze(['node_modules', '.git', 'dist', 'build', 'coverage'] as const);

// CWD et noms de fichiers ESLint appartiennent au moteur, jamais au projet importe.
const trustedRoot = resolve(__dirname, '..');
const unusedOptions = {
  args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_',
  caughtErrors: 'all', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true,
} as const;
const commonRules: Record<string, RuleConfiguration> = {
  'codeaudit/jsx-uses-vars': 'error',
  eqeqeq: ['error', 'always'],
  'no-debugger': 'error',
  'no-unreachable': 'error',
  'no-dupe-args': 'error',
  'no-duplicate-case': 'error',
  'valid-typeof': 'error',
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-console': 'warn',
  'prefer-const': 'warn',
};
const jsRules: Record<string, RuleConfiguration> = {
  ...commonRules,
  'no-undef': 'error',
  'no-unused-vars': ['warn', unusedOptions],
};
const tsRules: Record<string, RuleConfiguration> = {
  ...commonRules,
  'no-undef': 'off',
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': ['warn', unusedOptions],
  '@typescript-eslint/no-explicit-any': 'warn',
};
const globals = Object.fromEntries([
  'console', 'process', 'Buffer', 'require', 'module', 'exports', '__dirname', '__filename',
  'global', 'window', 'document', 'navigator', 'localStorage', 'sessionStorage',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate',
  'queueMicrotask', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder', 'fetch',
  'Request', 'Response', 'Headers', 'AbortController', 'AbortSignal', 'alert', 'confirm',
].map((name) => [name, 'readonly' as const]));

export function getAnalysisProfile(): AnalysisProfile {
  return structuredClone({
    version: ANALYSIS_PROFILE_VERSION,
    engines: {
      eslint: ESLint.version,
      typescript: typescriptVersion,
      typescriptEslint: tseslintMetadata.version,
    },
    ecmaVersion: 2024 as const,
    sourceTypes: { module: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.mts'], commonjs: ['.cjs', '.cts'] },
    supportedExtensions: [...SUPPORTED_EXTENSIONS],
    ignoredDirectories: [...IGNORED_DIRECTORIES],
    globals,
    rules: { javascript: jsRules, typescript: tsRules },
    allowInlineConfig: false,
    fix: false,
    typeInformation: false,
  });
}

export function createControlledLinter(): ESLint {
  return new ESLint({
    cwd: trustedRoot,
    overrideConfigFile: true,
    allowInlineConfig: false,
    fix: false,
    cache: false,
    ignore: false,
    overrideConfig: [
      {
        files: ['**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'],
        languageOptions: {
          ecmaVersion: 2024,
          sourceType: 'module',
          globals,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        linterOptions: { reportUnusedDisableDirectives: 'off' },
        plugins: { codeaudit: { rules: { 'jsx-uses-vars': jsxUsesVars } } },
        rules: structuredClone(jsRules),
      },
      {
        files: ['**/*.{ts,tsx,mts,cts}'],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: {
            project: false,
            projectService: false,
            tsconfigRootDir: trustedRoot,
            ecmaFeatures: { jsx: true },
            jsDocParsingMode: 'none',
          },
        },
        plugins: { '@typescript-eslint': tseslint.plugin as unknown as ESLint.Plugin },
        rules: structuredClone(tsRules),
      },
      { files: ['**/*.{cjs,cts}'], languageOptions: { sourceType: 'commonjs' } },
    ],
  });
}
