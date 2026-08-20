import { Pool } from "pg";

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

let poolInstance: Pool | null = null;

function getPool(): Pool {
  if (!poolInstance) {
    poolInstance = new Pool({
      user: getRequiredEnv("PGUSER"),
      host: getRequiredEnv("PGHOST"),
      database: getRequiredEnv("PGDATABASE"),
      password: getRequiredEnv("PGPASSWORD"),
      port: Number(process.env.PGPORT || 5432),
    });
  }

  return poolInstance;
}

const pool = new Proxy({} as Pool, {
  get(_target, property) {
    const instance = getPool();
    const value = Reflect.get(instance, property);

    return typeof value === "function"
      ? value.bind(instance)
      : value;
  },
});

export default pool;
