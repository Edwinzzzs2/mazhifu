import { Pool, type PoolConfig } from "pg";

declare global {
  // Reuse the pool across Next.js hot reloads during local development.
  // eslint-disable-next-line no-var
  var mazhifuPgPool: Pool | undefined;
}

function getPoolConfig(): PoolConfig {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }

  return {
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DATABASE,
  };
}

export function getPool() {
  if (!globalThis.mazhifuPgPool) {
    globalThis.mazhifuPgPool = new Pool(getPoolConfig());
  }

  return globalThis.mazhifuPgPool;
}
