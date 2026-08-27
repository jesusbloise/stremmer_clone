import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import db from "@/db";

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

type RowVideo = {
  id: string;
  file_name: string | null;
  display_name: string | null;
  titulo: string | null;
  file_key: string | null;
  file_path: string | null;
  r2_path: string | null;
  size_in_bytes: number | null;
  uploaded_at: string | null;
  tipo: string | null;
  views?: number | null;
  category?: string | null;
  subcategory?: string | null;
  thumbnail_url?: string | null;
  cf_stream_uid?: string | null;
  cf_stream_status?: string | null;
  cf_stream_ready?: boolean | null;
  cf_stream_playback_url?: string | null;
  visibility?: "PUBLIC" | "RESTRICTED" | null;
  requires_approval?: boolean | null;
  approval_status?: string | null;
  created_by_id?: string | null;
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

    const role = String(payload.role ?? "")
      .trim()
      .toUpperCase();

    return {
      id: String(id),
      role,
    };
  } catch {
    return null;
  }
}

function buildReadableUrl(row: RowVideo) {
  if (
    row.cf_stream_ready &&
    row.cf_stream_playback_url
  ) {
    return row.cf_stream_playback_url;
  }

  if (row.r2_path) {
    return row.r2_path;
  }

  if (row.file_path) {
    return row.file_path;
  }

  return null;
}

export async function GET(req: Request) {
  const currentUser = getAuthenticatedUser(req);

  if (!currentUser) {
    return NextResponse.json(
      {
        error: "No autorizado",
      },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const url = new URL(req.url);

  const limitParam = Number(
    url.searchParams.get("limit") ?? 200
  );

  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 500)
    : 200;

  const only = (
    url.searchParams.get("only") || "video"
  ).toLowerCase();

  const isExt = (extensions: string) =>
    `(u.file_key ~* '\\.(${extensions})$' OR u.file_name ~* '\\.(${extensions})$')`;

  let whereKind = "TRUE";

  if (only === "video") {
    whereKind = `
      (
        u.tipo = 'video'
        OR ${isExt("mp4|mov|mkv|webm|avi|m4v")}
      )
    `;
  } else if (only === "documento") {
    whereKind = `
      (
        u.tipo = 'documento'
        OR ${isExt(
      "pdf|docx|doc|txt|md|csv|log|srt|vtt"
    )}
      )
    `;
  } else if (only === "image") {
    whereKind = `
      (
        u.tipo = 'image'
        OR ${isExt("jpg|jpeg|png|gif|webp|avif")}
      )
    `;
  } else if (only === "audio") {
    whereKind = `
      (
        u.tipo = 'audio'
        OR ${isExt("mp3|wav|ogg|m4a")}
      )
    `;
  }

  try {
    const { rows } = await db.query<RowVideo>(
      `
      SELECT
        u.id,
        u.file_name,
        ft.titulo,
        COALESCE(
          NULLIF(ft.titulo, ''),
          u.file_name
        ) AS display_name,
        u.file_key,
        u.file_path,
        u.r2_path,
        u.size_in_bytes,
        u.uploaded_at,
        u.tipo,
        COALESCE(u.views, 0) AS views,
        u.category,
        u.subcategory,
        u.thumbnail_url,
        u.cf_stream_uid,
        u.cf_stream_status,
        u.cf_stream_ready,
        u.cf_stream_playback_url,
        COALESCE(u.visibility, 'PUBLIC') AS visibility,
        COALESCE(u.requires_approval, FALSE)
          AS requires_approval,
        u.approval_status,
        u.created_by_id
      FROM uploads u
      LEFT JOIN ficha_tecnica ft
        ON ft.upload_id::text = u.id::text
      WHERE
        ${whereKind}

        AND u.is_deleted IS NOT TRUE

        AND (
          u.r2_path IS NOT NULL
          OR u.cf_stream_playback_url IS NOT NULL
          OR u.file_path IS NOT NULL
        )

        AND (
          COALESCE(u.visibility, 'PUBLIC') = 'PUBLIC'

          OR $2::text = 'SUPER_ADMIN'

          OR u.created_by_id::text = $1::text

         OR EXISTS (
  SELECT 1
  FROM upload_permissions permission
  WHERE
    permission.upload_id = u.id::text
    AND permission.target_type = 'USER'
    AND permission.target_id = $1::text
)

OR EXISTS (
  SELECT 1
  FROM upload_permissions permission
  INNER JOIN user_group_members gm
    ON gm.group_id::text =
      permission.target_id
  WHERE
    permission.upload_id = u.id::text
    AND permission.target_type = 'GROUP'
    AND gm.user_id::text = $1::text
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
      $1::text

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

      ORDER BY u.uploaded_at DESC NULLS LAST
      LIMIT $3
      `,
      [
        currentUser.id,
        currentUser.role,
        limit,
      ]
    );

    const enriched = rows.map((row) => ({
      ...row,

      url: buildReadableUrl(row),

      using_cloudflare_stream: Boolean(
        row.cf_stream_ready &&
        row.cf_stream_playback_url
      ),

      using_r2: Boolean(row.r2_path),
    }));

    return new NextResponse(
      JSON.stringify(enriched),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("API_VIDEOS_ERROR", error);

    return NextResponse.json(
      {
        error: "No se pudieron cargar los videos",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}