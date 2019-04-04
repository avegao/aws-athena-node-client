import { Athena } from 'aws-sdk';
export declare class AthenaClientConfig {
    readonly awsConfig: Athena.ClientConfiguration;
    readonly database: string;
    readonly workGroup?: string;
    readonly bucketUri?: string;
    readonly waitTime: number;
}
