import { AthenaClientException } from './AthenaClientException.js';

export class QueryCanceledException extends AthenaClientException {
	public constructor() {
		super('Query cancelled');

		this.name = 'AthenaQueryCancelled';
	}
}
