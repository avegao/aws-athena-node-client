import {type Row} from '@aws-sdk/client-athena';
import {expect, test} from 'vitest';

import type {Column} from '../src/Column.js';
import {ResultObjectParser} from '../src/ResultParser.js';
import {createRepresentativeResultSet} from './helpers/athenaResultSet.js';

interface BenchmarkSample {
    readonly durationMs: number;
    readonly heapDeltaMb: number;
}

const defaultIterations = 15;
const defaultRows = 7000;

function calculateAverage(values: readonly number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculatePercentile(sortedValues: readonly number[], percentile: number): number {
    const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * percentile) - 1));

    return sortedValues[index] as number;
}

function getHeapUsedInMb(): number {
    return process.memoryUsage().heapUsed / 1024 / 1024;
}

function runGarbageCollection(): void {
    (globalThis as {gc?: () => void}).gc?.();
}

function legacyParseRow<T extends object>(row: Row, columns: Column[]): T {
    const result = {} as T;
    const dataLength = row.Data?.length ?? 0;

    for (let rowDataIndex = 0; rowDataIndex < dataLength; rowDataIndex++) {
        const rowData = row.Data?.[rowDataIndex];
        const column = columns[rowDataIndex] as Column;

        let value: unknown | null = null;

        if (rowData?.VarCharValue != null) {
            value = column.parse(rowData.VarCharValue);
        }

        Reflect.set(result, column.name, value);
    }

    return result;
}

function legacyParseRows<T extends object>(rows: Row[], columns: Column[], isFirstPage = false): T[] {
    const results: T[] = [];

    for (let rowIndex = isFirstPage ? 1 : 0, rowCount = rows.length; rowIndex < rowCount; rowIndex++) {
        results.push(legacyParseRow(rows[rowIndex] as Row, columns));
    }

    return results;
}

function runCase<T>(callback: () => T): {readonly result: T} & BenchmarkSample {
    runGarbageCollection();

    const heapBefore = getHeapUsedInMb();
    const startTime = performance.now();
    const result = callback();
    const durationMs = performance.now() - startTime;
    runGarbageCollection();
    const heapAfter = getHeapUsedInMb();

    return {
        result,
        durationMs,
        heapDeltaMb: heapAfter - heapBefore,
    };
}

test('reports parser timing and heap cost for representative Athena results', () => {
    const iterations = Number(process.env.PARSE_BENCH_ITERATIONS ?? defaultIterations);
    const rowCount = Number(process.env.PARSE_BENCH_ROWS ?? defaultRows);
    const resultSet = createRepresentativeResultSet(rowCount);
    const parser = new ResultObjectParser(resultSet);
    const rows = resultSet.Rows ?? [];
    const warmupResults: Array<Record<string, unknown>> = [];
    const warmupLegacyResults = legacyParseRows<Record<string, unknown>>(rows, parser.columns, true);
    let warmupStreamCount = 0;

    parser.appendRows(warmupResults, rows, true);
    for (const _ of parser.iterateRows(rows, true)) {
        warmupStreamCount++;
    }
    expect(warmupResults).toHaveLength(rowCount);
    expect(warmupLegacyResults).toEqual(warmupResults);
    expect(warmupStreamCount).toBe(rowCount);

    const optimizedSamples: BenchmarkSample[] = [];
    const legacySamples: BenchmarkSample[] = [];
    const streamingSamples: BenchmarkSample[] = [];

    for (let iteration = 0; iteration < iterations; iteration++) {
        const legacyRun = runCase(() => legacyParseRows<Record<string, unknown>>(rows, parser.columns, true));
        const optimizedRun = runCase(() => {
            const parsedRows: Array<Record<string, unknown>> = [];

            parser.appendRows(parsedRows, rows, true);

            return parsedRows;
        });
        const streamingRun = runCase(() => {
            let parsedRowCount = 0;

            for (const _ of parser.iterateRows(rows, true)) {
                parsedRowCount++;
            }

            return parsedRowCount;
        });

        expect(legacyRun.result).toHaveLength(rowCount);
        expect(optimizedRun.result).toHaveLength(rowCount);
        expect(streamingRun.result).toBe(rowCount);

        legacySamples.push(legacyRun);
        optimizedSamples.push(optimizedRun);
        streamingSamples.push(streamingRun);
    }

    const optimizedDurations = optimizedSamples.map((sample) => sample.durationMs).sort((left, right) => left - right);
    const optimizedHeapDeltas = optimizedSamples
        .map((sample) => sample.heapDeltaMb)
        .sort((left, right) => left - right);
    const legacyDurations = legacySamples.map((sample) => sample.durationMs).sort((left, right) => left - right);
    const legacyHeapDeltas = legacySamples.map((sample) => sample.heapDeltaMb).sort((left, right) => left - right);
    const streamingDurations = streamingSamples.map((sample) => sample.durationMs).sort((left, right) => left - right);
    const streamingHeapDeltas = streamingSamples
        .map((sample) => sample.heapDeltaMb)
        .sort((left, right) => left - right);
    const averageLegacyDuration = calculateAverage(legacyDurations);
    const averageOptimizedDuration = calculateAverage(optimizedDurations);
    const averageStreamingDuration = calculateAverage(streamingDurations);
    const averageLegacyHeap = calculateAverage(legacyHeapDeltas);
    const averageOptimizedHeap = calculateAverage(optimizedHeapDeltas);
    const averageStreamingHeap = calculateAverage(streamingHeapDeltas);
    const durationReduction = ((averageLegacyDuration - averageOptimizedDuration) / averageLegacyDuration) * 100;
    const heapReduction = ((averageLegacyHeap - averageOptimizedHeap) / averageLegacyHeap) * 100;
    const streamingHeapReduction = ((averageOptimizedHeap - averageStreamingHeap) / averageOptimizedHeap) * 100;

    console.info(
        [
            '',
            `[parse-benchmark] rows=${rowCount}`,
            `[parse-benchmark] columns=${parser.columns.length}`,
            `[parse-benchmark] iterations=${iterations}`,
            `[parse-benchmark] legacyAvg=${averageLegacyDuration.toFixed(2)}ms`,
            `[parse-benchmark] optimizedAvg=${averageOptimizedDuration.toFixed(2)}ms`,
            `[parse-benchmark] streamingAvg=${averageStreamingDuration.toFixed(2)}ms`,
            `[parse-benchmark] optimizedP95=${calculatePercentile(optimizedDurations, 0.95).toFixed(2)}ms`,
            `[parse-benchmark] durationReduction=${durationReduction.toFixed(2)}%`,
            `[parse-benchmark] legacyAvgHeapDelta=${averageLegacyHeap.toFixed(2)}MB`,
            `[parse-benchmark] optimizedAvgHeapDelta=${averageOptimizedHeap.toFixed(2)}MB`,
            `[parse-benchmark] streamingAvgHeapDelta=${averageStreamingHeap.toFixed(2)}MB`,
            `[parse-benchmark] optimizedHeapP95=${calculatePercentile(optimizedHeapDeltas, 0.95).toFixed(2)}MB`,
            `[parse-benchmark] heapReduction=${heapReduction.toFixed(2)}%`,
            `[parse-benchmark] streamingHeapReduction=${streamingHeapReduction.toFixed(2)}%`,
        ].join('\n'),
    );
});
