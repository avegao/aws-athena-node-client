# AGENTS.md

## Project Overview

This repository is a TypeScript library for querying AWS Athena from Node.js and Bun. The public API is centered on [src/index.ts](src/index.ts), with query lifecycle logic in [src/Query.ts](src/Query.ts), in-flight query tracking in [src/Queue.ts](src/Queue.ts), row parsing in [src/ResultParser.ts](src/ResultParser.ts) and [src/Column.ts](src/Column.ts), shared config types in [src/AthenaClientConfig.ts](src/AthenaClientConfig.ts), and custom errors in [src/exception/](src/exception/).

Use [README.md](README.md) for installation, usage examples, and upgrade history. Treat the source files as the source of truth when README examples drift.

## Working Commands

- Install dependencies: `vp install`
- Build the library package: `vp pack`
- Watch the library package build: `vp pack --watch`
- Run tests: `vp test`
- Run coverage: `vp test run --coverage`
- Run validation checks: `vp check`
- Format code: `vp fmt --write .`
- Check formatting without writes: `vp fmt --check .`
- Run lint without writes: `vp lint`

`vp check` is the preferred validation loop in this repository.

## Code Style

- Use TypeScript strict mode conventions from [tsconfig.json](tsconfig.json).
- Keep ESM import specifiers using `.js` extensions inside TypeScript source files.
- Follow the existing 4-space indentation and single-quote style used across [src/](src/) and [test/](test/).
- Prefer small, explicit types and readonly fields where the existing code already does so.
- Keep custom errors under [src/exception/](src/exception/).

## API and Architecture Notes

- `AthenaNodeClient` is the main entry point exported from [src/index.ts](src/index.ts).
- `executeQuery` returns rows and optionally statistics when `stats` is enabled in the query config.
- `executeQueryStream` returns an async generator and is the memory-sensitive path for large result sets.
- `executeQueryAndGetS3Key` and `executeQueryAndGetDownloadSignedUrl` require S3 client support when downloading results.
- `Query` formats SQL with `pg-promise` named parameters; preserve that behavior when changing query handling.
- `Queue` stores active queries and resolves them by query id; keep its id fallback behavior intact.
- `ResultObjectParser` owns row parsing and pagination-friendly iteration; prefer extending it instead of duplicating parsing loops in the client.
- `Column` contains the per-type Athena value parsers used by `ResultObjectParser`; add new type support there first.
- The build outputs both ESM and CJS bundles via the `pack` block in [vite.config.ts](vite.config.ts).

## Testing

- Unit tests live in [test/](test/).
- Use Vitest conventions already present in [test/Query.test.ts](test/Query.test.ts) and [test/Queue.test.ts](test/Queue.test.ts).
- Parser behavior and streaming behavior are covered in [test/ResultParser.test.ts](test/ResultParser.test.ts) and [test/AthenaNodeClient.test.ts](test/AthenaNodeClient.test.ts).
- Performance benchmarking for parser changes is no longer tracked here (benchmarks removed).
- Add or update tests when changing public behavior, query parsing, queue behavior, streaming, or exception handling.

## Repository-Specific Pitfalls

- The package targets Node.js 24+ or Bun 1.1+.
- This repo uses `pnpm`; keep lockfile and workspace files consistent with that choice.
- Do not rely on README snippets for exact option names if the source exports differ.
- `waitTimeInSeconds` in [src/AthenaClientConfig.ts](src/AthenaClientConfig.ts) is the config field used by the client.
- Keep AWS SDK usage aligned with the current peer and runtime dependency split in [package.json](package.json).
- Preserve Bun compatibility when changing runtime helpers or package assumptions.
