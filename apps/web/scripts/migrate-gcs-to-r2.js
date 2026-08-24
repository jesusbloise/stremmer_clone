const { Pool } = require("pg");
const { Storage } = require("@google-cloud/storage");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

const storage = new Storage();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function parseGsUrl(raw) {
  if (!raw || !raw.startsWith("gs://")) return null;
  const clean = raw.slice(5);
  const slash = clean.indexOf("/");
  if (slash === -1) return null;

  return {
    bucket: clean.slice(0, slash),
    objectPath: clean.slice(slash + 1),
  };
}

async function main() {
  const limit = Number(process.env.MIGRATION_LIMIT || 1);

  const accountId = required("R2_ACCOUNT_ID");
  const accessKeyId = required("R2_ACCESS_KEY_ID");
  const secretAccessKey = required("R2_SECRET_ACCESS_KEY");
  const bucket = required("R2_BUCKET_NAME");

  const r2 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const { rows } = await pool.query(
    `
    SELECT id, file_name, file_path
    FROM uploads
    WHERE r2_path IS NULL
      AND file_path LIKE 'gs://%'
    ORDER BY uploaded_at ASC
    LIMIT $1
    `,
    [limit]
  );

  console.log("MIGRATION_GCS_TO_R2_START", { limit, found: rows.length });

  for (const row of rows) {
    const parsed = parseGsUrl(row.file_path);

    if (!parsed) {
      console.log("MIGRATION_SKIP_INVALID_GCS", {
        id: row.id,
        file_path: row.file_path,
      });
      continue;
    }

    console.log("MIGRATION_COPY_START", {
      id: row.id,
      file_name: row.file_name,
      source: row.file_path,
    });

    const [buffer] = await storage
      .bucket(parsed.bucket)
      .file(parsed.objectPath)
      .download();

    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: parsed.objectPath,
        Body: buffer,
        ContentType: "application/octet-stream",
      })
    );

    const r2Path = `r2://${bucket}/${parsed.objectPath}`;

    await pool.query(
      `
      UPDATE uploads
      SET r2_path = $1
      WHERE id = $2
      `,
      [r2Path, row.id]
    );

    console.log("MIGRATION_COPY_OK", {
      id: row.id,
      r2Path,
    });
  }

  console.log("MIGRATION_GCS_TO_R2_DONE");
}

main()
  .catch((err) => {
    console.error("MIGRATION_GCS_TO_R2_ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });