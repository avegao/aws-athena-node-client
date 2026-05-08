# AGENTS.md

## Project Overview

This repository is a TypeScript library for querying AWS Athena from Node.js. The public API is centered on [src/index.ts](src/index.ts), with query lifecycle logic in [src/Query.ts](src/Query.ts), in-flight query tracking in [src/Queue.ts](src/Queue.ts), result parsing helpers in [src/Column.ts](src/Column.ts), and shared config types in [src/AthenaClientConfig.ts](src/AthenaClientConfig.ts).

Use [README.md](README.md) for installation, usage examples, and upgrade history. Treat the source files as the source of truth when README examples drift.

## Working Commands

- Install dependencies: `pnpm install`
- Build the library: `pnpm build`
- Watch the build: `pnpm dev`
- Run tests: `pnpm test`
- Run coverage: `pnpm coverage`
- Format and lint with write mode: `pnpm check`
- Format only with write mode: `pnpm format`

`pnpm check` is not read-only; it runs Biome with `--write`.

## Code Style

- Use TypeScript strict mode conventions from [tsconfig.json](tsconfig.json).
- Keep ESM import specifiers using `.js` extensions inside TypeScript source files.
- Follow Biome formatting from [biome.json](biome.json): 4-space indentation and single quotes.
- Prefer small, explicit types and readonly fields where the existing code already does so.
- Keep custom errors under [src/exception/](src/exception/).

## API and Architecture Notes

- `AthenaNodeClient` is the main entry point exported from [src/index.ts](src/index.ts).
- `executeQuery` returns rows and optionally statistics when `stats` is enabled in the query config.
- `executeQueryAndGetS3Key` and `executeQueryAndGetDownloadSignedUrl` require S3 client support when downloading results.
- `Query` formats SQL with `pg-promise` named parameters; preserve that behavior when changing query handling.
- `Queue` stores active queries and resolves them by query id; keep its id fallback behavior intact.
- `Column` contains the parsing helpers for Athena result values; prefer extending those helpers instead of duplicating parsing logic elsewhere.

## Testing

- Unit tests live in [test/](test/).
- Use Vitest conventions already present in [test/Query.test.ts](test/Query.test.ts) and [test/Queue.test.ts](test/Queue.test.ts).
- Add or update tests when changing public behavior, query parsing, queue behavior, or exception handling.

## Repository-Specific Pitfalls

- The package targets Node.js 18+.
- This repo uses `pnpm`; keep lockfile and workspace files consistent with that choice.
- Do not rely on README snippets for exact option names if the source exports differ.
- `waitTimeInSeconds` in [src/AthenaClientConfig.ts](src/AthenaClientConfig.ts) is the config field used by the client.
- Keep AWS SDK usage aligned with the current peer and runtime dependency split in [package.json](package.json).
