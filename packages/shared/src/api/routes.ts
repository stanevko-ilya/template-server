/** Все пути API-эндпоинтов */
export const API_ROUTES = {
    ping: '/api/ping',
    health: '/api/health',
} as const;

export type ApiRoute = (typeof API_ROUTES)[keyof typeof API_ROUTES];
