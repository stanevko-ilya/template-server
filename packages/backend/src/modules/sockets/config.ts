import type { CorsOptions } from 'cors';

export interface SocketsConfig {
    port: string | number;
    cors?: CorsOptions;
    paths: { events: string };
    auth?: boolean;
    use?: boolean;
}

const config = {
    port: process.env.SOCKETS_PORT ?? '3001',

    cors: { origin: '*' },

    paths: {
        events: './events',
    },
} satisfies SocketsConfig;

export default config;
