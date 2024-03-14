import {S3Client} from '@aws-sdk/client-s3';

export class AthenaClientConfig {
    public readonly database: string;
    public readonly workGroup?: string;
    public readonly bucketUri?: string;
    public readonly waitTimeInSeconds: number;
    public readonly s3Client?: S3Client;
}
