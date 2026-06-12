import type { Express } from 'express';
import type { PingResponse } from '@template-server/shared';

import { Method, type MethodConfig } from '../_class.js';
import config from './config.js';

export class Ping extends Method<MethodConfig, PingResponse> {
    override getResponse(): PingResponse {
        return { ok: true };
    }

    override getTest(): { request: Record<string, never>; expect: { status: number; body: PingResponse } } {
        return {
            request: {},
            expect: { status: 200, body: { ok: true } },
        };
    }

    constructor(url: string, app: Express) {
        super(import.meta.dirname, config, url, app);
    }
}

export default Ping;
