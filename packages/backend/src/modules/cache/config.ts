export interface CacheConfig {
    masterName?: string;
    password?: string;
    username?: string;
    sentinelsJson?: string;
    directHost?: string;
    directPort?: string | number;
    use?: boolean;
}

const config = {
    masterName: process.env.REDIS_MASTER_NAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    username: process.env.REDIS_USERNAME || undefined,
    sentinelsJson: process.env.REDIS_SENTINELS_JSON || undefined,
    directHost: process.env.REDIS_HOST || undefined,
    directPort: process.env.REDIS_PORT || undefined,
} satisfies CacheConfig;

export default config;
