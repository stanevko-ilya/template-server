const js = require('@eslint/js');
const globals = require('globals');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
    js.configs.recommended,
    prettierConfig,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
            },
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
            'no-console': 'off',
        },
    },
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            globals: {
                describe: 'readonly',
                it: 'readonly',
                expect: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                vi: 'readonly',
            },
        },
    },
    {
        ignores: ['node_modules/', 'modules/logger/logs/', 'modules/api/public/'],
    },
];
