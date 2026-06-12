import type { Express } from 'express';
import type { HealthResponse, ModuleStatus } from '@template-server/shared';

import { Method, type MethodConfig, type MethodTest } from '../_class.js';
import config from './config.js';
import modules from '../../../../modules.js';

export class Health extends Method<MethodConfig, HealthResponse> {
    override getResponse(): HealthResponse {
        const statuses: Record<string, ModuleStatus> = {};
        for (const name in modules) {
            const mod = modules[name];
            if (mod) statuses[name] = mod.getStatus();
        }

        return {
            status: 'ok',
            ...statuses,
        };
    }

    override getTest(): MethodTest {
        return {
            request: {},
            expect: {
                status: 200,
                body: (response: HealthResponse) => response.status === 'ok',
            },
        };
    }

    constructor(url: string, app: Express) {
        super(import.meta.dirname, config, url, app);
    }
}

export default Health;
