import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

import pool from "@/db";
import {
  generateCloudflareStreamCaption,
  getCloudflareStreamCaptions,
} from "@/lib/cloudflareStream";

export const runtime = "nodejs";
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

type UploadCaptionAccessRow = {
  cf_stream_uid: string | null;
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

    const payload = jwt.verify(
      decodeURIComponent(rawToken),
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

async function getUploadAccess(
  uploadId: string,
  currentUser: AuthUser
): Promise<UploadCaptionAccessRow | null> {
  const result = await pool.query<UploadCaptionAccessRow>(
    `
      SELECT
        u.cf_stream_uid,
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
                ON gm.group_id::text = rule.target_id::text
              WHERE
                rule.target_type = 'GROUP'
                AND gm.user_id::text = $2::text

                AND (
                  (
                    rule.resource_type = 'UPLOAD'
                    AND rule.resource_id::text = u.id::text
                  )

                  OR (
                    rule.resource_type = 'CATEGORY'
                    AND EXISTS (
                      SELECT 1
                      FROM categories category_rule
                      WHERE
                        category_rule.id::text = rule.resource_id::text
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
                        subcategory_rule.id::text = rule.resource_id::text
                        AND LOWER(BTRIM(subcategory_rule.label)) =
                            LOWER(BTRIM(COALESCE(u.subcategory, '')))
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
    [uploadId, currentUser.id]
  );

  return result.rows[0] ?? null;
}

function canViewUpload(
  upload: UploadCaptionAccessRow,
  currentUser: AuthUser
) {
  const isOwner =
    upload.created_by_id?.toString() ===
    currentUser.id.toString();

  const isSuperAdmin =
    currentUser.role === "SUPER_ADMIN";

  return (
    upload.visibility === "PUBLIC" ||
    isOwner ||
    isSuperAdmin ||
    upload.is_assigned
  );
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = getAuthenticatedUser(req);

    if (!currentUser) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const upload = await getUploadAccess(id, currentUser);

    if (!upload) {
      return NextResponse.json(
        { error: "Archivo no encontrado" },
        { status: 404 }
      );
    }

    if (!canViewUpload(upload, currentUser)) {
      return NextResponse.json(
        { error: "No tienes permiso para ver este archivo" },
        { status: 403 }
      );
    }

    if (!upload.cf_stream_uid) {
      return NextResponse.json(
        { error: "Este archivo no tiene video en Cloudflare Stream" },
        { status: 400 }
      );
    }

    const captions =
      await getCloudflareStreamCaptions(
        upload.cf_stream_uid
      );

    return NextResponse.json({
      ok: true,
      captions,
    });
  } catch (error) {
    console.error("GET_STREAM_CAPTIONS_ERROR", error);

    return NextResponse.json(
      { error: "No se pudieron obtener los subtítulos" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = getAuthenticatedUser(req);

    if (!currentUser) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const upload = await getUploadAccess(id, currentUser);

    if (!upload) {
      return NextResponse.json(
        { error: "Archivo no encontrado" },
        { status: 404 }
      );
    }

    if (!canViewUpload(upload, currentUser)) {
      return NextResponse.json(
        { error: "No tienes permiso para ver este archivo" },
        { status: 403 }
      );
    }

    if (!upload.cf_stream_uid) {
      return NextResponse.json(
        { error: "Este archivo no tiene video en Cloudflare Stream" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);

    const language =
      typeof body?.language === "string"
        ? body.language.trim().toLowerCase()
        : "";

    if (!language) {
      return NextResponse.json(
        { error: "Debes indicar el idioma" },
        { status: 400 }
      );
    }

    const caption =
      await generateCloudflareStreamCaption(
        upload.cf_stream_uid,
        language
      );

    return NextResponse.json({
      ok: true,
      caption,
    });
  } catch (error) {
    console.error("GENERATE_STREAM_CAPTION_ERROR", error);

    return NextResponse.json(
      { error: "No se pudo generar el subtítulo" },
      { status: 500 }
    );
  }
}
