// src/app/api/videos/[id]/route.ts
import { NextResponse } from "next/server";
import db from "@/db";

type Ctx<T extends Record<string, string>> = { params: Promise<T> };
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(_req: Request, context: Ctx<{ id: string }>) {
  const { id } = await context.params;

  const { rows } = await db.query(
    `
    SELECT
      id,
      file_name,
      file_key,
      file_path,
      r2_path,
      cf_stream_uid,
      cf_stream_status,
      cf_stream_ready,
      cf_stream_playback_url
    FROM uploads
    WHERE id = $1
      AND (is_deleted IS NOT TRUE)
    LIMIT 1
    `,
    [id]
  );

  if (!rows.length) {
    return NextResponse.json(
      { error: "Video no encontrado" },
      { status: 404 }
    );
  }

  const row = rows[0];

  const url =
    row.cf_stream_ready && row.cf_stream_playback_url
      ? row.cf_stream_playback_url
      : row.r2_path
        ? `/api/r2/proxy?url=${encodeURIComponent(row.r2_path)}`
        : null;

  return NextResponse.json({
    id: row.id,
    name: row.file_name,
    key: row.file_key,
    url,
    r2_path: row.r2_path ?? null,
    cf_stream_uid: row.cf_stream_uid ?? null,
    cf_stream_status: row.cf_stream_status ?? null,
    cf_stream_ready: Boolean(row.cf_stream_ready),
  });
}

export async function DELETE(_req: Request, context: Ctx<{ id: string }>) {
  const { id } = await context.params;
  const { rowCount } = await db.query(
    `UPDATE uploads
     SET is_deleted = TRUE, deleted_at = NOW()
     WHERE id = $1 AND (is_deleted IS NOT TRUE)`, [id]
  );
  if (rowCount === 0) {
    return NextResponse.json({ ok: false, message: "No encontrado o ya eliminado" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
