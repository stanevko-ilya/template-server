import type { CorsOptions } from 'cors';

export interface RateLimitConfig {
    windowMs: number;
    max: number;
}

export interface ApiHeader {
    name: string;
    value: string;
}

export interface ApiPaths {
    methods: string;
    static: string;
}

export interface ApiConfig {
    port: string | number;
    sub_url: string;
    paths: ApiPaths;
    headers: ApiHeader[];
    bodyLimit: string;
    rateLimit: RateLimitConfig;
    userRateLimit: RateLimitConfig;
    cors?: CorsOptions;
    use?: boolean;
}

const config = {
    port: process.env.API_PORT ?? '3000',
    sub_url: 'api',

    paths: {
        methods: './methods',
        static: './public',
    },

    headers: [] as ApiHeader[],

    bodyLimit: '512kb',
    rateLimit: {
        windowMs: 1000,
        max: 100,
    },
    userRateLimit: {
        windowMs: 1000,
        max: 40,
    },
} satisfies ApiConfig;

export default config;
