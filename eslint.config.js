import js from '@eslint/js';
import globals from 'globals';

export default [
    { ignores: ['node_modules/', 'public/css/', 'coverage/', 'data/'] },
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
            eqeqeq: ['error', 'smart'],
            'no-console': ['error', { allow: ['error'] }],
            'prefer-const': 'error',
        },
    },
    {
        files: ['public/**/*.js'],
        languageOptions: { globals: { ...globals.browser, Chart: 'readonly', SwaggerUIBundle: 'readonly' } },
    },
    {
        files: ['public/js/worker.js'],
        languageOptions: { globals: { ...globals.worker } },
    },
];
