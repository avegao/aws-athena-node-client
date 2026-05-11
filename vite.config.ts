import {defineConfig} from 'vite-plus';

const ignorePatterns = [
    '**/coverage/**/*',
    '**/.aws-sam/**/*',
    '**/.output/**/*',
    '**/.build/**/*',
    '**/.serverless/**/*',
    '**/.vscode/**/*',
    '**/build/**/*',
    '**/node_modules/**/*',
];

export default defineConfig({
    build: {
        lib: {
            entry: 'src/index.ts',
            fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
            formats: ['es', 'cjs'],
        },
        outDir: 'dist',
        sourcemap: true,
        target: 'es2021',
    },
    test: {
        coverage: {
            provider: 'v8',
        },
        reporters: process.env.GITHUB_ACTIONS ? ['dot', 'github-actions'] : ['dot'],
    },
    staged: {
        '*.{js,ts,cjs,mjs,d.cts,d.mts,jsx,tsx}': ['vp fmt --write --no-error-on-unmatched-pattern', 'vp lint --fix'],
        '*.{json,jsonc,md,mdx,html,css,less,scss,vue,graphql,gql,mjml,toml,yml,yaml}': [
            'vp fmt --write --no-error-on-unmatched-pattern',
        ],
    },
    fmt: {
        arrowParens: 'always',
        bracketSameLine: false,
        bracketSpacing: false,
        ignorePatterns,
        jsxSingleQuote: true,
        printWidth: 120,
        quoteProps: 'as-needed',
        semi: true,
        singleQuote: true,
        sortImports: true,
        sortPackageJson: true,
        tabWidth: 4,
        trailingComma: 'all',
        useTabs: false,
    },
    lint: {
        ignorePatterns,
        options: {
            typeAware: true,
            typeCheck: true,
        },
        rules: {
            'await-thenable': 'error',
            'default-param-last': 'error',
            eqeqeq: ['error', 'always', {null: 'ignore'}],
            'no-console': 'error',
            'no-else-return': 'error',
            'no-param-reassign': 'error',
            'no-unused-vars': 'error',
            'prefer-as-const': 'error',
            'prefer-enum-initializers': 'error',
            'typescript/consistent-type-imports': 'error',
            'typescript/unbound-method': 'off',
        },
    },
    pack: {
        dts: true,
        entry: 'src/index.ts',
        format: ['esm', 'cjs'],
        outDir: 'dist',
    },
});
