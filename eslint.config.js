const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = tseslint.config(
    {
        ignores: [
            '**/dist/**',
            '**/node_modules/**',
            '**/logs/**',
            '**/public/**',
            '**/.nx/**',
            '**/swagger.json',
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.ts'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: { ...globals.node },
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
            'no-console': 'off',
        },
    },
    {
        // Скрипты сборки и конфиги на чистом JS/ESM
        files: ['**/*.mjs', '**/*.cjs', '**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            globals: { ...globals.node },
        },
        rules: {
            'no-console': 'off',
        },
    },
    {
        // Тестовые файлы (vitest globals доступны через явные импорты)
        files: ['**/tests/**/*.ts'],
        languageOptions: {
            globals: { ...globals.node },
        },
    },
    prettier,
);
