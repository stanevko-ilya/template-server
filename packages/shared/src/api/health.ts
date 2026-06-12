import type { ModuleStatus } from '../enums.js';

/** Ответ GET /api/health: status:'ok' + статус каждого модуля по имени */
export interface HealthResponse {
    status: 'ok';
    [moduleName: string]: 'ok' | ModuleStatus;
}
