import { Pool } from "pg";

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

const pool = new Pool({
  user: getRequiredEnv("PGUSER"),
  host: getRequiredEnv("PGHOST"),
  database: getRequiredEnv("PGDATABASE"),
  password: getRequiredEnv("PGPASSWORD"),
  port: Number(process.env.PGPORT || 5432),
});

export default pool;