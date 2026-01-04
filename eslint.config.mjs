// eslint.config.mjs
// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // 0) Ignorados
  {
    ignores: [
      'eslint.config.mjs',
      'dist/**',
      'node_modules/**',
      'apps/web/dist/**',
      'apps/web/node_modules/**',
      'apps/web/.vite/**',
      'coverage/**',
    ],
  },

  // 1) Base
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,

  // 2) BACKEND (src/, test/, scripts/)
  {
    files: ['src/**/*.ts', 'test/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        // Importante: type-aware usando el TS config del backend (incluye test/)
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // 3) FRONTEND (apps/web)
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      sourceType: 'module',
      parserOptions: {
        // Vite normalmente usa tsconfig.app.json para el código de React (TSX)
        // Si en tu repo no existe, cambiá a: ['apps/web/tsconfig.json']
        project: ['apps/web/tsconfig.app.json', 'apps/web/tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },

  // 4) Reglas (comunes a todo)
  {
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off',

      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
);
