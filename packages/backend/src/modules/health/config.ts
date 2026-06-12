export interface HealthConfig {
    use: boolean;
    port: string | number;
}

const config = {
    use: true,
    port: process.env.HEALTH_PORT ?? '3001',
} satisfies HealthConfig;

export default config;
