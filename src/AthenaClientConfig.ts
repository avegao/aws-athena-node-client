import { type S3Client } from '@aws-sdk/client-s3';

export interface AthenaClientConfig {
	readonly database: string;
	readonly workGroup?: string;
	readonly bucketUri?: string;
	readonly waitTimeInSeconds: number;
	readonly s3Client?: S3Client;
}
