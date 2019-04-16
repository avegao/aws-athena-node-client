'use strict';

import {AthenaClientException} from './AthenaClientException';

export class QueryCanceledException extends AthenaClientException {
    public constructor() {
        super('Query cancelled');

        this.name = 'AthenaQueryCancelled';
    }
}
