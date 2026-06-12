import type { JwtPayload } from 'jsonwebtoken';

declare global {
    namespace Express {
        interface Request {
            /** Расшифрованный JWT-пейлоад (после auth-проверки) */
            user?: string | JwtPayload;
            user_id?: string | number | null;
            /** UUID запроса для трассировки */
            requestId?: string;
            /** Контейнер входных данных (query для GET, body иначе) */
            container_data?: Record<string, unknown>;
        }
    }
}

export {};
