export interface DbConfig {
    url: string;
    dbName?: string;
    user?: string;
    password?: string;
    replicaSet?: string;
    directory: string;
    maxPoolSize: number;
    minPoolSize: number;
    socketTimeoutMS: number;
    serverSelectionTimeoutMS: number;
    maxIdleTimeMS: number;
    use?: boolean;
}

const config = {
    url: process.env.DB_URL ?? 'mongodb://localhost:27017/mydb',
    dbName: process.env.MONGO_DB_NAME || undefined,
    user: process.env.MONGO_USER || undefined,
    password: process.env.MONGO_PASSWORD || undefined,
    replicaSet: process.env.MONGO_REPLICA_SET || undefined,

    directory: './models',

    maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 20,
    minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE) || 5,
    socketTimeoutMS: 30000,
    serverSelectionTimeoutMS: 5000,
    maxIdleTimeMS: 60000,
} satisfies DbConfig;

export default config;
