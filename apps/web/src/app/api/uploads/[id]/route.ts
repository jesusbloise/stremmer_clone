import { NextResponse } from "next/server";
import pool from "@/db";
// import { Storage } from "@google-cloud/storage";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl as getR2SignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2BucketName, getR2Client } from "@/lib/r2";
import { getCloudflareStreamVideoStatus } from "@/lib/cloudflareStream";
import jwt from "jsonwebtoken";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const JWT_SECRET =
  process.env.JWT_SECRET ?? "dev-secret-cambia-esto";

type AuthUser = {
  id: string;
  role: string;
};

type JwtPayload = {
  id?: string;
  sub?: string;
  userId?: string;
  role?: string;
};

type UploadAccessRow = {
  visibility: "PUBLIC" | "RESTRICTED";
  created_by_id: string | null;
  is_assigned: boolean;
};

function getAuthenticatedUser(req: Request): AuthUser | null {
  try {
    const cookie = (req.headers.get("cookie") || "")
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith("auth="));

    const rawToken = cookie?.slice("auth=".length);

    if (!rawToken) {
      return null;
    }

    const token = decodeURIComponent(rawToken);

    const payload = jwt.verify(
      token,
      JWT_SECRET
    ) as JwtPayload;

    const id =
      payload.id ??
      payload.sub ??
      payload.userId ??
      null;

    if (!id) {
      return null;
    }

    return {
      id: String(id),
      role: String(payload.role ?? "")
        .trim()
        .toUpperCase(),
    };
  } catch {
    return null;
  }
}

// const storage = new Storage();
// const GCS_BUCKET = process.env.GCS_BUCKET;

type RowUploadBase = {
  id: string;
  tipo: string | null;
  file_path: string | null;
  r2_path?: string | null;
  file_name: string | null;
  file_key: string | null;
  uploaded_at: string | null;
  views?: number | null;
  category?: string | null;
  subcategory?: string | null;
  cf_stream_uid?: string | null;
  cf_stream_status?: string | null;
  cf_stream_ready?: boolean | null;
  cf_stream_playback_url?: string | null;
};

type RowUploadWithMore = RowUploadBase & {
  content_type: string | null;
  streaming_path?: string | null;
  vimeo_id?: string | null;
  duration_sec?: number | null;
  thumbnail_url?: string | null;
};

type RowFicha = {
  upload_id: string;
  titulo: string | null;
  director: string | null;
  productor: string | null;
  jefe_produccion: string | null;
  director_fotografia: string | null;
  sonido: string | null;
  direccion_arte: string | null;
  asistente_direccion: string | null;
  montaje: string | null;
  otro_cargo: string | null;
  contacto_principal: string | null;
  correo: string | null;
  curso: string | null;
  profesor: string | null;
  anio: number | null;
  duracion: string | null;
  sinopsis: string | null;
  proceso_anterior: string | null;
  pendientes: string | null;
  visto: boolean | null;
  reunion: string | null;
  formato: string | null;
  estado: string | null;
  delivery_estimado: string | null;
  seleccion: string | null;
  link: string | null;
  foto: string | null;
};

function inferExt(name?: string | null) {
  const n = (name || "").split("?")[0].split("#")[0];
  return n.includes(".") ? n.split(".").pop()!.toLowerCase() : "";
}

function extToMime(ext: string): string | null {
  const map: Record<string, string> = {
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    webm: "video/webm",
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    log: "text/plain",
    srt: "text/plain",
    vtt: "text/vtt",
  };

  return map[ext] || null;
}

function inferTipo(ext: string, contentType?: string | null): "video" | "documento" | null {
  const ct = (contentType || "").toLowerCase();

  if (ct.startsWith("video/")) return "video";
  if (ct.startsWith("application/pdf")) return "documento";
  if (ct.includes("wordprocessingml.document")) return "documento";
  if (ct.startsWith("text/")) return "documento";

  if (["mp4", "mov", "mkv", "webm", "m4v"].includes(ext)) return "video";
  if (["pdf", "docx", "doc", "txt", "md", "csv", "log", "srt", "vtt"].includes(ext)) {
    return "documento";
  }

  return null;
}


function parseR2Url(raw?: string | null) {
  if (!raw || !raw.startsWith("r2://")) return null;

  const withoutScheme = raw.slice(5);
  const firstSlash = withoutScheme.indexOf("/");
  if (firstSlash === -1) return null;

  const bucket = withoutScheme.slice(0, firstSlash);
  const objectPath = withoutScheme.slice(firstSlash + 1);

  if (!bucket || !objectPath) return null;

  return { bucket, objectPath };
}

function hashShareToken(token: string) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

async function buildR2SignedUrl(params: {
  r2Path?: string | null;
  contentType?: string | null;
  fileName?: string | null;
}) {
  const parsed = parseR2Url(params.r2Path);
  if (!parsed) return null;

  const bucket = parsed.bucket || getR2BucketName();
  const r2Client = getR2Client();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: parsed.objectPath,
    ResponseContentType: params.contentType || undefined,
    ResponseContentDisposition: params.fileName
      ? `inline; filename="${params.fileName.replace(/"/g, "")}"`
      : "inline",
  });

  const signedUrl = await getR2SignedUrl(r2Client, command, {
    expiresIn: 60 * 60 * 6,
  });

  return signedUrl;
}



function mapFichaToCamel(row?: RowFicha | null) {
  if (!row) return null;

  return {
    titulo: row.titulo ?? undefined,
    director: row.director ?? undefined,
    productor: row.productor ?? undefined,
    jefeProduccion: row.jefe_produccion ?? undefined,
    directorFotografia: row.director_fotografia ?? undefined,
    sonido: row.sonido ?? undefined,
    direccionArte: row.direccion_arte ?? undefined,
    asistenteDireccion: row.asistente_direccion ?? undefined,
    montaje: row.montaje ?? undefined,
    otroCargo: row.otro_cargo ?? undefined,
    contactoPrincipal: row.contacto_principal ?? undefined,
    correo: row.correo ?? undefined,
    curso: row.curso ?? undefined,
    profesor: row.profesor ?? undefined,
    anio: row.anio ?? undefined,
    duracion: row.duracion ?? undefined,
    sinopsis: row.sinopsis ?? undefined,
    procesoAnterior: row.proceso_anterior ?? undefined,
    pendientes: row.pendientes ?? undefined,
    visto: row.visto ?? undefined,
    reunion: row.reunion ?? undefined,
    formato: row.formato ?? undefined,
    estado: row.estado ?? undefined,
    deliveryEstimado: row.delivery_estimado ?? undefined,
    seleccion: row.seleccion ?? undefined,
    link: row.link ?? undefined,
    foto: row.foto ?? undefined,
  };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const currentUser = getAuthenticatedUser(req);

  const { searchParams } = new URL(req.url);

  const rawShareToken =
    String(searchParams.get("share") || "").trim();

  let hasValidShareToken = false;

  if (rawShareToken) {
    const tokenHash =
      hashShareToken(rawShareToken);

    const SHOWCASE_VIDEO_IDS = [
      "5909f5b1-20b8-4a6e-aca3-bd70870f6513",
      "0f639512-5ec9-4266-ab0a-abcbce96fb38",
      "eeb2c14c-2f68-4f7b-b477-d32b2a7a6139",
      "ce49f9e7-3c7f-49bc-89f2-31e48760a5e0",
    ];

    const sourceUploadId =
      String(
        searchParams.get("source") || id
      ).trim();

    const shareResult = await pool.query(
      `
    UPDATE upload_share_links
    SET
      last_accessed_at = NOW(),
      access_count = access_count + 1
    WHERE
      upload_id::text = $1::text
      AND token_hash = $2
      AND revoked_at IS NULL
      AND expires_at > NOW()
    RETURNING id
    `,
      [sourceUploadId, tokenHash]
    );

    const tokenBelongsToSource =
      Boolean(shareResult.rowCount);

    const isOriginalSharedUpload =
      sourceUploadId === id;

    const isAllowedShowcaseUpload =
      SHOWCASE_VIDEO_IDS.includes(id);

    hasValidShareToken =
      tokenBelongsToSource &&
      (
        isOriginalSharedUpload ||
        isAllowedShowcaseUpload
      );
  }

  try {
    const accessQuery = await pool.query<UploadAccessRow>(
      `
  SELECT
    COALESCE(u.visibility, 'PUBLIC') AS visibility,
    u.created_by_id,
    CASE
  WHEN $2::text IS NULL THEN FALSE
  ELSE (
    EXISTS (
      SELECT 1
      FROM upload_permissions permission
      WHERE
        permission.upload_id = u.id::text
        AND permission.target_type = 'USER'
        AND permission.target_id = $2::text
    )

    OR EXISTS (
      SELECT 1
      FROM upload_permissions permission
      INNER JOIN user_group_members gm
        ON gm.group_id::text = permission.target_id
      WHERE
        permission.upload_id = u.id::text
        AND permission.target_type = 'GROUP'
        AND gm.user_id::text = $2::text
    )

    OR EXISTS (
  SELECT 1

  FROM access_rules rule

  INNER JOIN user_group_members gm
    ON gm.group_id::text =
      rule.target_id::text

  WHERE
    rule.target_type = 'GROUP'

    AND gm.user_id::text =
      $2::text

    AND (
      (
        rule.resource_type = 'UPLOAD'
        AND rule.resource_id::text =
          u.id::text
      )

      OR (
        rule.resource_type = 'CATEGORY'

        AND EXISTS (
          SELECT 1

          FROM categories category_rule

          WHERE
            category_rule.id::text =
              rule.resource_id::text

            AND LOWER(category_rule.slug) =
              LOWER(COALESCE(u.category, ''))
        )
      )

      OR (
        rule.resource_type = 'SUBCATEGORY'

        AND EXISTS (
          SELECT 1

          FROM subcategories subcategory_rule

          WHERE
            subcategory_rule.id::text =
              rule.resource_id::text

            AND LOWER(
              BTRIM(subcategory_rule.label)
            ) =
              LOWER(
                BTRIM(
                  COALESCE(
                    u.subcategory,
                    ''
                  )
                )
              )
        )
      )
    )
)
  )
END AS is_assigned
  FROM uploads u
  WHERE
    u.id::text = $1::text
    AND u.is_deleted IS NOT TRUE
  LIMIT 1
  `,
      [id, currentUser?.id ?? null]
    );
    const access = accessQuery.rows[0];

    if (!access) {
      return NextResponse.json(
        { error: "Archivo no encontrado" },
        { status: 404 }
      );
    }

    const isOwner =
      Boolean(currentUser) &&
      access.created_by_id?.toString() ===
      currentUser?.id.toString();

    const isSuperAdmin =
      currentUser?.role === "SUPER_ADMIN";

    const canAuthenticatedUserView =
      Boolean(currentUser) &&
      (
        access.visibility === "PUBLIC" ||
        isOwner ||
        isSuperAdmin ||
        access.is_assigned
      );

    const canView =
      hasValidShareToken ||
      canAuthenticatedUserView;

    if (!canView) {
      return NextResponse.json(
        { error: "No tienes permiso para ver este archivo" },
        { status: 403 }
      );
    }
    let row: RowUploadWithMore | null = null;

    try {
      const q1 = await pool.query<RowUploadWithMore>(
        `SELECT id, tipo, file_path, r2_path, file_name, file_key, uploaded_at,
    content_type, streaming_path, views, category, subcategory,
    vimeo_id, duration_sec, thumbnail_url,
    cf_stream_uid, cf_stream_status, cf_stream_ready, cf_stream_playback_url
 FROM uploads
 WHERE id = $1
 LIMIT 1`,
        [id]
      );

      row = q1.rows[0] || null;
    } catch {
      const q2 = await pool.query<RowUploadBase>(
        `SELECT id, tipo, file_path, r2_path, file_name, file_key, uploaded_at, views,
    category, subcategory,
    cf_stream_uid, cf_stream_status, cf_stream_ready, cf_stream_playback_url
FROM uploads
 WHERE id = $1
 LIMIT 1`,
        [id]
      );

      const r = q2.rows[0] || null;

      if (r) {
        row = {
          ...r,
          content_type: null,
          streaming_path: null,
          vimeo_id: null,
          duration_sec: null,
          thumbnail_url: null,
          cf_stream_uid: r.cf_stream_uid ?? null,
          cf_stream_status: r.cf_stream_status ?? null,
          cf_stream_ready: r.cf_stream_ready ?? null,
          cf_stream_playback_url: r.cf_stream_playback_url ?? null,
        };
      }
    }

    if (!row) {
      return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
    }

    let fichaRow: RowFicha | null = null;

    try {
      const qf = await pool.query<RowFicha>(
        `SELECT upload_id, titulo, director, productor, jefe_produccion,
                director_fotografia, sonido, direccion_arte, asistente_direccion,
                montaje, otro_cargo, contacto_principal, correo, curso, profesor,
                anio, duracion, sinopsis, proceso_anterior, pendientes, visto, reunion,
                formato, estado, delivery_estimado, seleccion, link, foto
         FROM ficha_tecnica
         WHERE upload_id = $1
         LIMIT 1`,
        [id]
      );

      fichaRow = qf.rows[0] || null;
    } catch (e: any) {
      if (e?.code !== "42P01") throw e;
    }

    const ext = inferExt(row.file_name || row.file_key);
    const contentType = row.content_type || extToMime(ext);
    const inferredTipo = inferTipo(ext, contentType);
    const tipo = row.tipo ?? inferredTipo;

    if (row.tipo == null && tipo) {
      try {
        await pool.query(`UPDATE uploads SET tipo = $1 WHERE id = $2`, [tipo, id]);
      } catch (e) {
        console.warn("No se pudo actualizar tipo inferido:", e);
      }
    }

    const finalStreamingPath = row.streaming_path || null;

    const preferR2 = Boolean(row.r2_path);

    const usingStreaming =
      tipo === "video" &&
      Boolean(finalStreamingPath) &&
      Boolean(finalStreamingPath?.startsWith("r2://")) &&
      !preferR2;

    const playbackPath = preferR2
      ? row.r2_path
      : usingStreaming
        ? finalStreamingPath
        : row.file_path;

    const playbackContentType = usingStreaming ? "video/mp4" : contentType;

    let url: string | null = null;

    let cfStreamUid = row.cf_stream_uid ?? null;
    let cfStreamStatus = row.cf_stream_status ?? null;
    let cfStreamReady = Boolean(row.cf_stream_ready);
    let cfStreamPlaybackUrl = row.cf_stream_playback_url ?? null;

    if (tipo === "video" && cfStreamUid && !cfStreamReady) {
      try {
        const cf = await getCloudflareStreamVideoStatus(cfStreamUid);

        cfStreamStatus = cf.status;
        cfStreamReady = cf.ready;
        cfStreamPlaybackUrl = cf.playbackUrl;

        await pool.query(
          `
      UPDATE uploads
      SET cf_stream_status = $1,
          cf_stream_ready = $2,
          cf_stream_playback_url = $3
      WHERE id = $4
      `,
          [cfStreamStatus, cfStreamReady, cfStreamPlaybackUrl, row.id]
        );
      } catch (e) {
        console.warn("No se pudo sincronizar estado Cloudflare Stream:", e);
      }
    }
    if (tipo === "video" && cfStreamReady && cfStreamPlaybackUrl) {
      url = cfStreamPlaybackUrl;
    }
    if (!url && preferR2 && row.r2_path) {
      if (tipo === "video") {
        url = await buildR2SignedUrl({
          r2Path: row.r2_path,
          contentType: playbackContentType,
          fileName: row.file_name,
        });
      } else {
        url = `/api/r2/proxy?url=${encodeURIComponent(row.r2_path)}`;
      }
    }
    console.log("PLAYBACK_URL_SELECTED", {
      id: row.id,
      tipo,
      cfStreamReady,
      cfStreamPlaybackUrl,
      finalUrl: url,
    });
    if (!url) {
      return NextResponse.json(
        {
          error: "Archivo no disponible en R2 ni Cloudflare Stream",
          details: {
            id: row.id,
            file_path: row.file_path,
            r2_path: row.r2_path,
            cf_stream_ready: cfStreamReady,
            cf_stream_playback_url: cfStreamPlaybackUrl,
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        upload: {
          id: row.id,
          tipo,
          titulo: fichaRow?.titulo ?? null,
          display_name: fichaRow?.titulo || row.file_name,
          file_name: row.file_name,
          ext,
          content_type: playbackContentType,
          url,
          uploaded_at: row.uploaded_at,
          views: row.views ?? 0,
          category: row.category ?? null,
          subcategory: row.subcategory ?? null,

          visibility: access.visibility,
          created_by_id: access.created_by_id,
          can_manage_privacy: isOwner || isSuperAdmin,

          ficha: mapFichaToCamel(fichaRow),
          vimeo_id: row.vimeo_id ?? null,
          duration_sec: row.duration_sec ?? null,
          thumbnail_url: row.thumbnail_url ?? null,

          file_path: row.file_path ?? null,
          r2_path: row.r2_path ?? null,
          streaming_path: finalStreamingPath ?? null,
          playback_path: playbackPath ?? null,
          using_streaming: usingStreaming,
          using_r2: preferR2,

          cf_stream_uid: cfStreamUid,
          cf_stream_status: cfStreamStatus,
          cf_stream_ready: cfStreamReady,
          cf_stream_playback_url: cfStreamPlaybackUrl,
          using_cloudflare_stream:
            tipo === "video" && cfStreamReady && Boolean(cfStreamPlaybackUrl),
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, max-age=60",
        },
      }
    );
  } catch (e: any) {
    console.error("❌ Error en /api/uploads/[id]:", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const currentUser = getAuthenticatedUser(req);

  if (!currentUser) {
    return NextResponse.json(
      { error: "No autorizado" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();

    const visibility =
      String(body?.visibility || "")
        .trim()
        .toUpperCase();

    if (
      visibility !== "PUBLIC" &&
      visibility !== "RESTRICTED"
    ) {
      return NextResponse.json(
        { error: "Visibilidad inválida" },
        { status: 400 }
      );
    }

    const query = await pool.query<{
      created_by_id: string | null;
    }>(
      `
      SELECT created_by_id
      FROM uploads
      WHERE
        id::text = $1::text
        AND is_deleted IS NOT TRUE
      LIMIT 1
      `,
      [id]
    );

    const upload = query.rows[0];

    if (!upload) {
      return NextResponse.json(
        { error: "Archivo no encontrado" },
        { status: 404 }
      );
    }

    const isOwner =
      upload.created_by_id?.toString() ===
      currentUser.id.toString();

    const isSuperAdmin =
      currentUser.role === "SUPER_ADMIN";

    if (!isOwner && !isSuperAdmin) {
      return NextResponse.json(
        {
          error:
            "No tienes permiso para cambiar la privacidad",
        },
        { status: 403 }
      );
    }

    await pool.query(
      `
      UPDATE uploads
      SET
        visibility = $1,
        updated_at = NOW()
      WHERE id::text = $2::text
      `,
      [visibility, id]
    );

    return NextResponse.json(
      {
        ok: true,
        visibility,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "PATCH /api/uploads/[id] error:",
      error
    );

    return NextResponse.json(
      { error: "No se pudo cambiar la privacidad" },
      { status: 500 }
    );
  }
}