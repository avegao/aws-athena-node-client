'use strict';

import {Athena} from 'aws-sdk';

export class AthenaClientConfig {
    public readonly awsConfig: Athena.ClientConfiguration;
    public readonly database: string;
    public readonly workGroup?: string;
    public readonly bucketUri?: string;
    public readonly waitTime: number;
}
