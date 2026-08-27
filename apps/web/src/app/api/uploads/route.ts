import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import pool from "@/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const JWT_SECRET =
  process.env.JWT_SECRET ?? "dev-secret-cambia-esto";

type JwtPayload = {
  id?: string;
  sub?: string;
  userId?: string;
  role?: string;
};

type AuthUser = {
  id: string;
  role: string;
};

type RowUpload = {
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

function getAuthenticatedUser(req: NextRequest): AuthUser | null {
  try {
    const raw = req.cookies.get("auth")?.value;

    if (!raw) {
      return null;
    }

    const token = decodeURIComponent(raw);

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

function buildReadableUrl(row: RowUpload) {
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

export async function GET(req: NextRequest) {
  const currentUser = getAuthenticatedUser(req);

  if (!currentUser) {
    return NextResponse.json(
      { error: "No autorizado" },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const { searchParams } = new URL(req.url);

  const category =
    searchParams
      .get("category")
      ?.trim()
      .toLowerCase() || null;

  const subcategory =
    searchParams
      .get("subcategory")
      ?.trim() || null;

  const requestedLimit = Number(
    searchParams.get("limit") || 500
  );

  const limit = Number.isFinite(requestedLimit)
    ? Math.min(
      Math.max(requestedLimit, 1),
      1000
    )
    : 500;

  try {
    const where: string[] = [
      `(u.is_deleted IS NOT TRUE)`,
    ];

    const params: Array<string | number> = [];
    let i = 1;

    if (category) {
      where.push(`LOWER(u.category) = $${i++}`);
      params.push(category);
    }

    if (subcategory) {
      where.push(`u.subcategory = $${i++}`);
      params.push(subcategory);
    }

    where.push(`
      (
        u.r2_path IS NOT NULL
        OR u.cf_stream_playback_url IS NOT NULL
        OR u.file_path IS NOT NULL
      )
    `);

    const userIdParameter = i++;
    params.push(currentUser.id);

    const userRoleParameter = i++;
    params.push(currentUser.role);

    where.push(`
      (
        COALESCE(u.visibility, 'PUBLIC') = 'PUBLIC'

        OR $${userRoleParameter}::text = 'SUPER_ADMIN'

        OR u.created_by_id::text =
          $${userIdParameter}::text

        OR EXISTS (
  SELECT 1
  FROM upload_permissions permission
  WHERE
    permission.upload_id = u.id::text
    AND permission.target_type = 'USER'
    AND permission.target_id =
      $${userIdParameter}::text
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
    AND gm.user_id::text =
      $${userIdParameter}::text
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
      $${userIdParameter}::text

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
    `);

    const limitParameter = i++;
    params.push(limit);

    const sql = `
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
        u.category,
        u.subcategory,
        u.thumbnail_url,
        u.cf_stream_uid,
        u.cf_stream_status,
        u.cf_stream_ready,
        u.cf_stream_playback_url,

        COALESCE(
          u.visibility,
          'PUBLIC'
        ) AS visibility,

        COALESCE(
          u.requires_approval,
          FALSE
        ) AS requires_approval,

        u.approval_status,
        u.created_by_id

      FROM uploads u

      LEFT JOIN ficha_tecnica ft
        ON ft.upload_id::text = u.id::text

      WHERE ${where.join(" AND ")}

      ORDER BY
        u.uploaded_at DESC NULLS LAST

      LIMIT $${limitParameter}
    `;

    const { rows } =
      await pool.query<RowUpload>(
        sql,
        params
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

    return NextResponse.json(enriched, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error(
      "GET /api/uploads error:",
      e
    );

    return NextResponse.json(
      {
        error:
          "No se pudieron cargar los archivos",
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