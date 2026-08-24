import { NextRequest, NextResponse } from "next/server";
import pool from "@/db";
import jwt from "jsonwebtoken";
import {
  randomUUID,
  createHmac,
  timingSafeEqual,
} from "crypto";
import { spawn } from "child_process";
import path from "path";
import { Readable } from "stream";
// import { Storage } from "@google-cloud/storage";
import fs from "fs/promises";
import os from "os";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  PutObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2BucketName, getR2Client } from "@/lib/r2";
import {
  copyVideoToCloudflareStream,
  createR2SignedReadUrl,
} from "@/lib/cloudflareStream";

console.log("UPLOAD_ROUTE_HIT (R2 primary + Cloudflare Stream)");

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-cambia-esto";

type AuthenticatedUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
};

function getAuthenticatedUser(req: NextRequest): AuthenticatedUser | null {
  try {
    const cookie = (req.headers.get("cookie") || "")
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith("auth="));

    const rawToken = cookie?.split("=")?.[1];

    if (!rawToken) {
      return null;
    }

    const token = decodeURIComponent(rawToken);
    const payload = jwt.verify(token, JWT_SECRET) as any;

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
      name: payload.name ?? null,
      email: payload.email ?? null,
      role: String(payload.role ?? "").trim().toUpperCase(),
    };
  } catch (error) {
    console.error("UPLOAD_AUTH_ERROR", error);
    return null;
  }
}

function webStreamToNodeReadable(webStream: ReadableStream<Uint8Array>): Readable {
  const reader = webStream.getReader();

  return new Readable({
    highWaterMark: 1024 * 64,
    async read() {
      const { done, value } = await reader.read();
      this.push(done ? null : value);
    },
  });
}

function sanitizeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");
}

// const storage = new Storage();
// const BUCKET = process.env.GCS_BUCKET;

async function uploadBufferToR2(params: {
  key: string;
  buffer: Buffer;
  contentType?: string | null;
}) {
  try {
    const r2Client = getR2Client();
    const bucket = getR2BucketName();

    await r2Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: params.key,
        Body: params.buffer,
        ContentType: params.contentType || "application/octet-stream",
      })
    );

    return `r2://${bucket}/${params.key}`;
  } catch (error) {
    console.error("R2_UPLOAD_COPY_ERROR", error);
    return null;
  }
}

async function sendVideoToCloudflareStream(params: {
  rowId: string;
  fileName: string;
  r2Path: string | null;
}) {
  const { rowId, fileName, r2Path } = params;

  let cfStreamUid: string | null = null;
  let cfStreamReady = false;
  let cfStreamStatus: string | null = null;
  let cfStreamPlaybackUrl: string | null = null;

  if (!r2Path) {
    return {
      cfStreamUid,
      cfStreamReady,
      cfStreamStatus,
      cfStreamPlaybackUrl,
    };
  }

  try {
    const signedR2Url = await createR2SignedReadUrl(r2Path);

    const cf = await copyVideoToCloudflareStream({
      videoUrl: signedR2Url,
      name: fileName,
    });

    cfStreamUid = cf.uid;
    cfStreamReady = cf.ready;
    cfStreamStatus = cf.status;
    cfStreamPlaybackUrl = cf.playbackUrl;

    await pool.query(
      `
      UPDATE uploads
      SET cf_stream_uid = $1,
          cf_stream_status = $2,
          cf_stream_ready = $3,
          cf_stream_playback_url = $4
      WHERE id = $5
      `,
      [cfStreamUid, cfStreamStatus, cfStreamReady, cfStreamPlaybackUrl, rowId]
    );

    console.log("CF_STREAM_COPY_OK", {
      rowId,
      cfStreamUid,
      cfStreamReady,
      cfStreamPlaybackUrl,
    });
  } catch (cfErr) {
    cfStreamStatus = "error";
    console.error("CF_STREAM_COPY_FAILED", cfErr);

    await pool
      .query(
        `
        UPDATE uploads
        SET cf_stream_status = $1
        WHERE id = $2
        `,
        [cfStreamStatus, rowId]
      )
      .catch(() => { });
  }

  return {
    cfStreamUid,
    cfStreamReady,
    cfStreamStatus,
    cfStreamPlaybackUrl,
  };
}

type CatSlug = string;
type UploadVisibility = "PUBLIC" | "RESTRICTED";

type UploadAccessLevel = "VIEWER" | "APPROVER" | "EDITOR";

type AssignedUploadUser = {
  userId: string;
  accessLevel: UploadAccessLevel;
};

type AssignedUploadGroup = {
  groupId: string;
  accessLevel: UploadAccessLevel;
};

type UploadPrivacyInput = {
  visibility: UploadVisibility;
  requiresApproval: boolean;
  approvalStatus: "NOT_REQUIRED" | "PENDING";
  assignedUsers: AssignedUploadUser[];
  assignedGroups: AssignedUploadGroup[];
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizeAccessLevel(value: unknown): UploadAccessLevel {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();

  if (
    normalized === "APPROVER" ||
    normalized === "EDITOR" ||
    normalized === "VIEWER"
  ) {
    return normalized;
  }

  return "VIEWER";
}

function parseAssignedUsers(value: unknown): AssignedUploadUser[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueUsers = new Map<string, AssignedUploadUser>();

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const rawItem = item as {
      userId?: unknown;
      accessLevel?: unknown;
    };

    const userId = String(rawItem.userId || "").trim();

    if (!isUuid(userId)) {
      continue;
    }

    uniqueUsers.set(userId, {
      userId,
      accessLevel: normalizeAccessLevel(rawItem.accessLevel),
    });
  }

  return Array.from(uniqueUsers.values());
}

function parseAssignedGroups(
  value: unknown
): AssignedUploadGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueGroups =
    new Map<string, AssignedUploadGroup>();

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const rawItem = item as {
      groupId?: unknown;
      accessLevel?: unknown;
    };

    const groupId = String(
      rawItem.groupId || ""
    ).trim();

    if (!isUuid(groupId)) {
      continue;
    }

    uniqueGroups.set(groupId, {
      groupId,
      accessLevel: normalizeAccessLevel(
        rawItem.accessLevel
      ),
    });
  }

  return Array.from(
    uniqueGroups.values()
  );
}

function parseUploadPrivacy(input: {
  visibility?: unknown;
  requiresApproval?: unknown;
  assignedUsers?: unknown;
  assignedGroups?: unknown;
}): UploadPrivacyInput {
  const visibility: UploadVisibility =
    String(input.visibility || "")
      .trim()
      .toUpperCase() === "RESTRICTED"
      ? "RESTRICTED"
      : "PUBLIC";

  const requiresApproval =
    input.requiresApproval === true ||
    String(input.requiresApproval || "")
      .trim()
      .toLowerCase() === "true";

  return {
    visibility,
    requiresApproval,
    approvalStatus: requiresApproval ? "PENDING" : "NOT_REQUIRED",
    assignedUsers:
      visibility === "RESTRICTED"
        ? parseAssignedUsers(input.assignedUsers)
        : [],
        assignedGroups:
  visibility === "RESTRICTED"
    ? parseAssignedGroups(
        input.assignedGroups
      )
    : [],
  };
}

async function isValidCat(c: string) {
  const { rows } = await pool.query(
    `
    SELECT slug
    FROM categories
    WHERE slug = $1
      AND is_active = true
    LIMIT 1
    `,
    [c]
  );

  return rows.length > 0;
}

type FichaInput = {
  titulo?: string;
  marca?: string;
  agencia?: string;
  productora?: string;
  contacto?: string;
  oficina?: string;
  tipo?: string[] | string;
  estudio?: string;
  director?: string;
  productor?: string;
  produccion?: string;
  corporativo?: string;
  nuevosNegocios?: string;
  nuevos_negocios?: string;

  otros?: string;
  duracion?: string;
  formato?: string;
  version?: string;
  fecha?: string;
};

type PendingDirectUpload = {
  rowId: string;
  fileName: string;
  fileKey: string;
  r2Path: string;
  size: number;
  contentType: string;
  category: CatSlug;
  subcategory: string | null;
  ficha: FichaInput | null;
  createdById: string;
  visibility: UploadVisibility;
  requiresApproval: boolean;
  approvalStatus: "NOT_REQUIRED" | "PENDING";
  assignedUsers: AssignedUploadUser[];
  assignedGroups: AssignedUploadGroup[];
};


type CreateUploadWithPrivacyInput = {
  rowId: string;
  fileName: string;
  fileKey: string;
  filePath: string | null;
  size: number;
  tipo: string;
  category: CatSlug;
  subcategory: string | null;
  r2Path: string;
  createdById: string;
  visibility: UploadVisibility;
  requiresApproval: boolean;
  approvalStatus: "NOT_REQUIRED" | "PENDING";
  assignedUsers: AssignedUploadUser[];
  assignedGroups: AssignedUploadGroup[];
};

async function createUploadWithPrivacy(
  input: CreateUploadWithPrivacyInput
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO uploads
        (
          id,
          file_name,
          file_key,
          file_path,
          size_in_bytes,
          status,
          uploaded_at,
          tipo,
          category,
          subcategory,
          r2_path,
          storage_provider,
          created_by_id,
          visibility,
          requires_approval,
          approval_status
        )
      VALUES
        (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          NOW(),
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15
        )
      `,
      [
        input.rowId,
        input.fileName,
        input.fileKey,
        input.filePath,
        input.size,
        "uploaded",
        input.tipo,
        input.category,
        input.subcategory,
        input.r2Path,
        "r2",
        input.createdById,
        input.visibility,
        input.requiresApproval,
        input.approvalStatus,
      ]
    );

    if (
      input.visibility === "RESTRICTED" &&
      input.assignedUsers.length > 0
    ) {
      const assignedUserIds = input.assignedUsers.map(
        (assignedUser) => assignedUser.userId
      );

      const existingUsersResult = await client.query(
        `
        SELECT id::text AS id
        FROM users
        WHERE id = ANY($1::uuid[])
        `,
        [assignedUserIds]
      );

      const existingUserIds = new Set<string>(
        existingUsersResult.rows.map((row) => String(row.id))
      );

      const missingUserIds = assignedUserIds.filter(
        (userId) => !existingUserIds.has(userId)
      );

      if (missingUserIds.length > 0) {
        throw new Error(
          `Usuarios asignados inexistentes: ${missingUserIds.join(", ")}`
        );
      }

      for (const assignedUser of input.assignedUsers) {
        await client.query(
          `
          INSERT INTO upload_access_users
            (
              upload_id,
              user_id,
              access_level,
              approval_decision,
              assigned_by_id,
              created_at,
              updated_at
            )
          VALUES
            (
              $1,
              $2,
              $3,
              'PENDING',
              $4,
              NOW(),
              NOW()
            )
          ON CONFLICT (upload_id, user_id)
          DO UPDATE SET
            access_level = EXCLUDED.access_level,
            assigned_by_id = EXCLUDED.assigned_by_id,
            updated_at = NOW()
          `,
          [
            input.rowId,
            assignedUser.userId,
            assignedUser.accessLevel,
            input.createdById,
          ]
        );
      }
    }

    /*
 * Permisos unificados de usuarios.
 * Mantenemos upload_access_users temporalmente
 * para compatibilidad con las consultas antiguas.
 */
if (
  input.visibility === "RESTRICTED" &&
  input.assignedUsers.length > 0
) {
  for (
    const assignedUser of
    input.assignedUsers
  ) {
    await client.query(
      `
      INSERT INTO upload_permissions
        (
          upload_id,
          target_type,
          target_id,
          access_level,
          assigned_by_id,
          created_at,
          updated_at
        )
      VALUES
        (
          $1,
          'USER',
          $2,
          $3,
          $4,
          NOW(),
          NOW()
        )
      ON CONFLICT
        (upload_id, target_type, target_id)
      DO UPDATE SET
        access_level =
          EXCLUDED.access_level,
        assigned_by_id =
          EXCLUDED.assigned_by_id,
        updated_at = NOW()
      `,
      [
        input.rowId,
        assignedUser.userId,
        assignedUser.accessLevel,
        input.createdById,
      ]
    );
  }
}

/*
 * Permisos por grupo.
 */
if (
  input.visibility === "RESTRICTED" &&
  input.assignedGroups.length > 0
) {
  const assignedGroupIds =
    input.assignedGroups.map(
      (group) => group.groupId
    );

  const existingGroupsResult =
    await client.query(
      `
      SELECT id::text AS id
      FROM user_groups
      WHERE
        id::text = ANY($1::text[])
        AND is_active IS TRUE
      `,
      [assignedGroupIds]
    );

  const existingGroupIds =
    new Set<string>(
      existingGroupsResult.rows.map(
        (row) => String(row.id)
      )
    );

  const missingGroupIds =
    assignedGroupIds.filter(
      (groupId) =>
        !existingGroupIds.has(groupId)
    );

  if (missingGroupIds.length > 0) {
    throw new Error(
      `Grupos asignados inexistentes o inactivos: ${missingGroupIds.join(
        ", "
      )}`
    );
  }

  for (
    const assignedGroup of
    input.assignedGroups
  ) {
    await client.query(
      `
      INSERT INTO upload_permissions
        (
          upload_id,
          target_type,
          target_id,
          access_level,
          assigned_by_id,
          created_at,
          updated_at
        )
      VALUES
        (
          $1,
          'GROUP',
          $2,
          $3,
          $4,
          NOW(),
          NOW()
        )
      ON CONFLICT
        (upload_id, target_type, target_id)
      DO UPDATE SET
        access_level =
          EXCLUDED.access_level,
        assigned_by_id =
          EXCLUDED.assigned_by_id,
        updated_at = NOW()
      `,
      [
        input.rowId,
        assignedGroup.groupId,
        assignedGroup.accessLevel,
        input.createdById,
      ]
    );
  }
}

/*
 * Notificaciones para usuarios que reciben
 * acceso a un archivo restringido.
 *
 * Unificamos:
 * - usuarios asignados directamente
 * - miembros de grupos asignados
 *
 * UNION evita duplicados si una persona
 * recibe acceso por más de una vía.
 */
if (input.visibility === "RESTRICTED") {
  await client.query(
    `
    WITH recipients AS (
      SELECT
        permission.target_id::uuid AS user_id

      FROM upload_permissions permission

      INNER JOIN users target_user
        ON target_user.id::text =
          permission.target_id

      WHERE
        permission.upload_id =
          $1::text

        AND
          permission.target_type =
            'USER'

        AND
          target_user.is_active IS TRUE

      UNION

      SELECT
        group_member.user_id

      FROM upload_permissions permission

      INNER JOIN user_group_members group_member
        ON group_member.group_id::text =
          permission.target_id

      INNER JOIN users target_user
        ON target_user.id =
          group_member.user_id

      WHERE
        permission.upload_id =
          $1::text

        AND
          permission.target_type =
            'GROUP'

        AND
          target_user.is_active IS TRUE
    )

    INSERT INTO notifications
      (
        user_id,
        type,
        title,
        message,
        upload_id,
        action_url,
        metadata,
        created_at
      )

    SELECT
      recipients.user_id,

      'RESTRICTED_UPLOAD_SHARED',

      'Nuevo archivo compartido contigo',

      $2::text ||
        ' fue compartido contigo de forma restringida.',

      $1::uuid,

      '/videos/' || $1::text,

      jsonb_build_object(
        'fileName',
        $2::text,
        'sharedByUserId',
        $3::text
      ),

      NOW()

    FROM recipients

    WHERE
      recipients.user_id::text <>
        $3::text

      AND NOT EXISTS (
        SELECT 1

        FROM notifications existing_notification

        WHERE
          existing_notification.user_id =
            recipients.user_id

          AND
            existing_notification.upload_id =
              $1::uuid

          AND
            existing_notification.type =
              'RESTRICTED_UPLOAD_SHARED'

          AND
            existing_notification.resolved_at
              IS NULL
      )
    `,
    [
      input.rowId,
      input.fileName,
      input.createdById,
    ]
  );
}
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

type FinalizeTokenPayload = PendingDirectUpload & {
  issuedAt: number;
  expiresAt: number;
};

const FINALIZE_TOKEN_SECRET =
  process.env.NEXTAUTH_SECRET ||
  process.env.JWT_SECRET ||
  "dev-finalize-secret-cambiar";

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signFinalizePayload(encodedPayload: string) {
  return createHmac("sha256", FINALIZE_TOKEN_SECRET)
    .update(encodedPayload)
    .digest("base64url");
}

function createFinalizeToken(
  payload: PendingDirectUpload
) {
  const now = Date.now();

  const tokenPayload: FinalizeTokenPayload = {
    ...payload,
    issuedAt: now,
    expiresAt: now + 24 * 60 * 60 * 1000,
  };

  const encodedPayload = toBase64Url(
    JSON.stringify(tokenPayload)
  );

  const signature =
    signFinalizePayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

function verifyFinalizeToken(
  token: string
): PendingDirectUpload | null {
  try {
    const [encodedPayload, receivedSignature] =
      token.split(".");

    if (
      !encodedPayload ||
      !receivedSignature
    ) {
      return null;
    }

    const expectedSignature =
      signFinalizePayload(encodedPayload);

    const receivedBuffer = Buffer.from(
      receivedSignature,
      "utf8"
    );

    const expectedBuffer = Buffer.from(
      expectedSignature,
      "utf8"
    );

    if (
      receivedBuffer.length !==
      expectedBuffer.length
    ) {
      return null;
    }

    if (
      !timingSafeEqual(
        receivedBuffer,
        expectedBuffer
      )
    ) {
      return null;
    }

    const parsed = JSON.parse(
      fromBase64Url(encodedPayload)
    ) as FinalizeTokenPayload;

    if (
      !parsed?.expiresAt ||
      Date.now() > parsed.expiresAt
    ) {
      return null;
    }

    const {
      issuedAt: _issuedAt,
      expiresAt: _expiresAt,
      ...pending
    } = parsed;

    return pending;
  } catch {
    return null;
  }
}
function getTipoFromExt(ext: string) {
  return ["mp4", "mov", "mkv", "webm", "m4v"].includes(ext)
    ? "video"
    : ["pdf", "doc", "docx", "txt"].includes(ext)
      ? "documento"
      : "desconocido";
}

function isVideoExt(ext: string) {
  return ["mp4", "mov", "mkv", "webm", "m4v"].includes(ext);
}

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      shell: false,
    });

    child.stdout.on("data", (d) => console.log(`[${command} stdout]`, d.toString()));
    child.stderr.on("data", (d) => console.log(`[${command} stderr]`, d.toString()));
    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function uploadCustomThumbnail(rowId: string, thumbnail: File | null) {
  if (!thumbnail) return null;
  if (!thumbnail.type.startsWith("image/")) return null;

  const originalName = sanitizeFileName(thumbnail.name || "thumbnail.jpg");
  const ext = originalName.split(".").pop()?.toLowerCase() || "jpg";
  const thumbnailKey = `thumbnails/${rowId}-${randomUUID()}.${ext}`;

  const buffer = Buffer.from(await thumbnail.arrayBuffer());

  const r2ThumbnailUri = await uploadBufferToR2({
    key: thumbnailKey,
    buffer,
    contentType: thumbnail.type || "image/jpeg",
  });

  if (!r2ThumbnailUri) return null;

  await pool.query(
    `
    UPDATE uploads
    SET thumbnail_url = $1
    WHERE id = $2
    `,
    [r2ThumbnailUri, rowId]
  );

  return r2ThumbnailUri;
}


async function upsertFichaTecnica(rowId: string, ficha: FichaInput | null) {
  if (!ficha) return;

  const normString = (v: any) => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  };

  const normTipo = (v: any): string[] => {
    if (!v) return [];
    if (Array.isArray(v)) return v.map(String).map((x) => x.trim()).filter(Boolean);
    if (typeof v === "string") {
      return v.split(",").map((x) => x.trim()).filter(Boolean);
    }
    return [];
  };

  const payload = {
    titulo: normString(ficha.titulo),
    marca: normString(ficha.marca),
    agencia: normString(ficha.agencia),
    productora: normString(ficha.productora),
    contacto: normString(ficha.contacto),
    oficina: normString(ficha.oficina),
    tipo: normTipo(ficha.tipo),
    estudio: normString(ficha.estudio),
    director: normString(ficha.director),
    productor: normString(ficha.productor),
    produccion: normString(ficha.produccion),
    corporativo: normString(ficha.corporativo),
    nuevos_negocios: normString(ficha.nuevosNegocios ?? ficha.nuevos_negocios),
    otros: normString(ficha.otros),
    duracion: normString(ficha.duracion),
    formato: normString(ficha.formato),
    version: normString(ficha.version),
    fecha: normString(ficha.fecha),
  };

  try {
    await pool.query(
      `
  INSERT INTO ficha_tecnica (
    upload_id,
    titulo,
    marca, agencia, productora, contacto,
    oficina,
    tipo,
    estudio, director, productor,
    produccion, corporativo,
    nuevos_negocios,
    otros,
    duracion,
    formato,
    version,
    fecha
  )
  VALUES (
    $1,
    $2,
    $3, $4, $5, $6,
    $7,
    $8::text[],
    $9, $10, $11,
    $12, $13,
    $14,
    $15, $16, $17, $18, $19
  )
  ON CONFLICT (upload_id) DO UPDATE SET
    titulo = EXCLUDED.titulo,
    marca = EXCLUDED.marca,
    agencia = EXCLUDED.agencia,
    productora = EXCLUDED.productora,
    contacto = EXCLUDED.contacto,
    oficina = EXCLUDED.oficina,
    tipo = EXCLUDED.tipo,
    estudio = EXCLUDED.estudio,
    director = EXCLUDED.director,
    productor = EXCLUDED.productor,
    produccion = EXCLUDED.produccion,
    corporativo = EXCLUDED.corporativo,
    nuevos_negocios = EXCLUDED.nuevos_negocios,
    otros = EXCLUDED.otros,
    duracion = EXCLUDED.duracion,
    formato = EXCLUDED.formato,
    version = EXCLUDED.version,
    fecha = EXCLUDED.fecha
  `,
      [
        rowId,
        payload.titulo,
        payload.marca,
        payload.agencia,
        payload.productora,
        payload.contacto,
        payload.oficina,
        payload.tipo,
        payload.estudio,
        payload.director,
        payload.productor,
        payload.produccion,
        payload.corporativo,
        payload.nuevos_negocios,
        payload.otros,
        payload.duracion,
        payload.formato,
        payload.version,
        payload.fecha,
      ]
    );
  } catch (err: any) {
    if (err?.code !== "42703") throw err;

    await pool.query(
      `
      INSERT INTO ficha_tecnica (
        upload_id,
        titulo,
        marca, agencia, productora_ficha, contacto,
        oficina,
        tipo,
        estudio, director, productor,
        produccion, corporativo,
        nuevos_negocios
      )
      VALUES (
        $1,
        $2,
        $3, $4, $5, $6,
        $7,
        $8::text[],
        $9, $10, $11,
        $12, $13,
        $14
      )
      ON CONFLICT (upload_id) DO UPDATE SET
        titulo = EXCLUDED.titulo,
        marca = EXCLUDED.marca,
        agencia = EXCLUDED.agencia,
        productora_ficha = EXCLUDED.productora_ficha,
        contacto = EXCLUDED.contacto,
        oficina = EXCLUDED.oficina,
        tipo = EXCLUDED.tipo,
        estudio = EXCLUDED.estudio,
        director = EXCLUDED.director,
        productor = EXCLUDED.productor,
        produccion = EXCLUDED.produccion,
        corporativo = EXCLUDED.corporativo,
        nuevos_negocios = EXCLUDED.nuevos_negocios
      `,
      [
        rowId,
        payload.titulo,
        payload.marca,
        payload.agencia,
        payload.productora,
        payload.contacto,
        payload.oficina,
        payload.tipo,
        payload.estudio,
        payload.director,
        payload.productor,
        payload.produccion,
        payload.corporativo,
        payload.nuevos_negocios,
      ]
    );
  }
}

async function triggerPostProcess(
  rowId: string,
  ext: string,
  _gcsUri: string | null,
  fileKey: string,
  r2Path?: string | null
) {
  const python =
    process.env.PYTHON_BIN ||
    (process.platform === "win32"
      ? "C:\\Users\\ALLINONE06\\AppData\\Local\\Programs\\Python\\Python310\\python.exe"
      : "python3");

  let scriptPath = "";
  if (isVideoExt(ext)) {
    scriptPath = path.join(process.cwd(), "processor", "procesar_subtitulos.py");
  } else if (["pdf", "docx", "txt", "doc"].includes(ext)) {
    scriptPath = path.join(process.cwd(), "processor", "procesar_texto.py");
  }

  if (!scriptPath) return;

  try {
    let signedUrl: string | null = null;
    let processSource: "r2" | "gcs" | null = null;

    if (r2Path) {
      try {
        signedUrl = await createR2SignedReadUrl(r2Path);
        processSource = "r2";
      } catch (r2Err) {
        console.error("POSTPROCESS_R2_SIGNED_URL_ERROR", r2Err);
      }
    }
    if (!signedUrl) {
      console.error("POSTPROCESS_NO_R2_SOURCE", {
        rowId,
        ext,
        fileKey,
        r2Path,
      });
      return;
    }
  
    console.log("POSTPROCESS_SOURCE_SELECTED", {
      rowId,
      ext,
      processSource,
    });

    const proceso = spawn(python, [scriptPath, rowId, signedUrl], {
      cwd: process.cwd(),
      shell: false,
    });

    proceso.stdout.on("data", (d) => console.log(`[STDOUT ${ext}]:`, d.toString()));
    proceso.stderr.on("data", (d) => console.error(`[STDERR ${ext}]:`, d.toString()));
    proceso.on("error", (e) => console.error("Spawn error:", e));
  } catch (e) {
    console.error("Error generando signed URL para postprocess:", e);
  }
}

async function handleDirectR2Init(req: NextRequest) {
  const authenticatedUser = getAuthenticatedUser(req);

  if (!authenticatedUser) {
    return NextResponse.json(
      { error: "Debes iniciar sesión para subir archivos" },
      { status: 401 }
    );
  }
  const body = await req.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const rawCat = String(body.category || "").trim().toLowerCase();

  if (!(await isValidCat(rawCat))) {
    return NextResponse.json({ error: "Categoría inválida" }, { status: 400 });
  }

  const fileName = String(body.fileName || "").trim();

  if (!fileName) {
    return NextResponse.json({ error: "Falta fileName" }, { status: 400 });
  }

  const size = Number(body.size || 0);

  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "Tamaño inválido" }, { status: 400 });
  }

  const contentType = String(body.contentType || "application/octet-stream");
  const category: CatSlug = rawCat;

  const subcategory =
    body.subcategory && String(body.subcategory).trim()
      ? String(body.subcategory).trim()
      : null;

  const ficha = (body.ficha as FichaInput | null) || null;

 const privacy = parseUploadPrivacy({
  visibility: body.visibility,
  requiresApproval: body.requiresApproval,
  assignedUsers: body.assignedUsers,
  assignedGroups: body.assignedGroups,
});

  const safeFileName = sanitizeFileName(fileName);
  const fileKey = `${randomUUID()}_${safeFileName}`;
  const rowId = randomUUID();

  const r2Client = getR2Client();
  const bucket = getR2BucketName();
  const r2Path = `r2://${bucket}/${fileKey}`;

  const uploadUrl = await getSignedUrl(
    r2Client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: fileKey,
      ContentType: contentType,
    }),
    { expiresIn: 60 * 30 }
  );

  const pending: PendingDirectUpload = {
    rowId,
    fileName,
    fileKey,
    r2Path,
    size,
    contentType,
    category,
    subcategory,
    ficha,
    createdById: authenticatedUser.id,
    visibility: privacy.visibility,
    requiresApproval: privacy.requiresApproval,
    approvalStatus: privacy.approvalStatus,
    assignedUsers: privacy.assignedUsers,
    assignedGroups: privacy.assignedGroups,
  };

  const finalizeToken = createFinalizeToken(pending);
 

  return NextResponse.json({
    ok: true,
    uploadUrl,
    finalizeToken,
    rowId,
    key: fileKey,
    r2_path: r2Path,
  });
}

async function handleMultipartR2Init(req: NextRequest) {
  const authenticatedUser = getAuthenticatedUser(req);

  if (!authenticatedUser) {
    return NextResponse.json(
      {
        error:
          "Debes iniciar sesión para subir archivos",
      },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null);

  if (!body) {
    return NextResponse.json(
      { error: "Body inválido" },
      { status: 400 }
    );
  }

  const rawCat = String(
    body.category || ""
  )
    .trim()
    .toLowerCase();

  if (!(await isValidCat(rawCat))) {
    return NextResponse.json(
      { error: "Categoría inválida" },
      { status: 400 }
    );
  }

  const fileName = String(
    body.fileName || ""
  ).trim();

  if (!fileName) {
    return NextResponse.json(
      { error: "Falta fileName" },
      { status: 400 }
    );
  }

  const size = Number(body.size || 0);

  if (
    !Number.isFinite(size) ||
    size <= 0
  ) {
    return NextResponse.json(
      { error: "Tamaño inválido" },
      { status: 400 }
    );
  }

  const MAX_MULTIPART_SIZE_BYTES =
    30 * 1024 * 1024 * 1024;

  if (size > MAX_MULTIPART_SIZE_BYTES) {
    return NextResponse.json(
      {
        error:
          "El archivo supera el máximo permitido de 30 GB",
      },
      { status: 413 }
    );
  }

  const contentType = String(
    body.contentType ||
      "application/octet-stream"
  );

  const category: CatSlug = rawCat;

  const subcategory =
    body.subcategory &&
    String(body.subcategory).trim()
      ? String(body.subcategory).trim()
      : null;

  const ficha =
    (body.ficha as FichaInput | null) ||
    null;

  const privacy = parseUploadPrivacy({
    visibility: body.visibility,
    requiresApproval:
      body.requiresApproval,
    assignedUsers: body.assignedUsers,
    assignedGroups: body.assignedGroups,
  });

  const safeFileName =
    sanitizeFileName(fileName);

  const fileKey =
    `${randomUUID()}_${safeFileName}`;

  const rowId = randomUUID();

  const r2Client = getR2Client();
  const bucket = getR2BucketName();

  const r2Path =
    `r2://${bucket}/${fileKey}`;

  const multipartResult =
    await r2Client.send(
      new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: fileKey,
        ContentType: contentType,
      })
    );

  const uploadId =
    multipartResult.UploadId;

  if (!uploadId) {
    return NextResponse.json(
      {
        error:
          "R2 no devolvió el identificador multipart",
      },
      { status: 500 }
    );
  }

  const pending: PendingDirectUpload = {
    rowId,
    fileName,
    fileKey,
    r2Path,
    size,
    contentType,
    category,
    subcategory,
    ficha,
    createdById:
      authenticatedUser.id,
    visibility: privacy.visibility,
    requiresApproval:
      privacy.requiresApproval,
    approvalStatus:
      privacy.approvalStatus,
    assignedUsers:
      privacy.assignedUsers,
    assignedGroups:
      privacy.assignedGroups,
  };

  const finalizeToken =
    createFinalizeToken(pending);

  /*
   * 64 MB por parte:
   * una película de 30 GB produce unas 480 partes.
   */
  const partSize =
    64 * 1024 * 1024;

  const totalParts =
    Math.ceil(size / partSize);

  return NextResponse.json({
    ok: true,
    mode: "multipart-r2",
    uploadId,
    finalizeToken,
    rowId,
    key: fileKey,
    r2_path: r2Path,
    partSize,
    totalParts,
  });
}

async function handleMultipartR2SignPart(
  req: NextRequest
) {
  const authenticatedUser =
    getAuthenticatedUser(req);

  if (!authenticatedUser) {
    return NextResponse.json(
      {
        error:
          "Debes iniciar sesión para subir archivos",
      },
      { status: 401 }
    );
  }

  const body = await req
    .json()
    .catch(() => null);

  if (!body) {
    return NextResponse.json(
      { error: "Body inválido" },
      { status: 400 }
    );
  }

  const uploadId = String(
    body.uploadId || ""
  ).trim();

  const finalizeToken = String(
    body.finalizeToken || ""
  ).trim();

  const partNumber = Number(
    body.partNumber
  );

  if (!uploadId) {
    return NextResponse.json(
      {
        error:
          "Falta el identificador multipart",
      },
      { status: 400 }
    );
  }

  if (
    !Number.isInteger(partNumber) ||
    partNumber < 1 ||
    partNumber > 10_000
  ) {
    return NextResponse.json(
      {
        error:
          "Número de fragmento inválido",
      },
      { status: 400 }
    );
  }

  const pending =
    verifyFinalizeToken(finalizeToken);

  if (!pending) {
    return NextResponse.json(
      {
        error:
          "Token de subida inválido o expirado",
      },
      { status: 400 }
    );
  }

  if (
    String(pending.createdById) !==
    String(authenticatedUser.id)
  ) {
    return NextResponse.json(
      {
        error:
          "No tienes permiso para esta subida",
      },
      { status: 403 }
    );
  }

  const r2Client = getR2Client();
  const bucket = getR2BucketName();

  const uploadUrl = await getSignedUrl(
    r2Client,
    new UploadPartCommand({
      Bucket: bucket,
      Key: pending.fileKey,
      UploadId: uploadId,
      PartNumber: partNumber,
    }),
    {
      expiresIn: 60 * 60,
    }
  );

  return NextResponse.json({
    ok: true,
    uploadUrl,
    uploadId,
    partNumber,
  });
}
async function handleMultipartR2Complete(
  req: NextRequest
) {
  const authenticatedUser =
    getAuthenticatedUser(req);

  if (!authenticatedUser) {
    return NextResponse.json(
      {
        error:
          "Debes iniciar sesión para subir archivos",
      },
      { status: 401 }
    );
  }

  const body = await req
    .json()
    .catch(() => null);

  if (!body) {
    return NextResponse.json(
      { error: "Body inválido" },
      { status: 400 }
    );
  }

  const uploadId = String(
    body.uploadId || ""
  ).trim();

  const finalizeToken = String(
    body.finalizeToken || ""
  ).trim();

  const rawParts = Array.isArray(body.parts)
    ? body.parts
    : [];

  if (!uploadId) {
    return NextResponse.json(
      {
        error:
          "Falta el identificador multipart",
      },
      { status: 400 }
    );
  }

  const pending =
    verifyFinalizeToken(finalizeToken);

  if (!pending) {
    return NextResponse.json(
      {
        error:
          "Token de subida inválido o expirado",
      },
      { status: 400 }
    );
  }

  if (
    String(pending.createdById) !==
    String(authenticatedUser.id)
  ) {
    return NextResponse.json(
      {
        error:
          "No tienes permiso para completar esta subida",
      },
      { status: 403 }
    );
  }

  type CompletedMultipartPart = {
  PartNumber: number;
  ETag: string;
};

 const parts: CompletedMultipartPart[] = rawParts
  .map((part: any): CompletedMultipartPart => ({
    PartNumber: Number(
      part?.partNumber ??
        part?.PartNumber
    ),
    ETag: String(
      part?.etag ??
        part?.ETag ??
        ""
    ).trim(),
  }))
  .filter(
    (
      part: CompletedMultipartPart
    ) =>
      Number.isInteger(
        part.PartNumber
      ) &&
      part.PartNumber >= 1 &&
      part.PartNumber <= 10_000 &&
      Boolean(part.ETag)
  )
  .sort(
    (
      a: CompletedMultipartPart,
      b: CompletedMultipartPart
    ) =>
      a.PartNumber -
      b.PartNumber
  );
  if (!parts.length) {
    return NextResponse.json(
      {
        error:
          "No se recibieron fragmentos válidos",
      },
      { status: 400 }
    );
  }

 const uniquePartNumbers =
  new Set<number>(
    parts.map(
      (
        part: CompletedMultipartPart
      ) => part.PartNumber
    )
  );

  if (
    uniquePartNumbers.size !==
    parts.length
  ) {
    return NextResponse.json(
      {
        error:
          "Hay fragmentos repetidos",
      },
      { status: 400 }
    );
  }

  const r2Client = getR2Client();
  const bucket = getR2BucketName();

  try {
    const completed =
      await r2Client.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: pending.fileKey,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: parts,
          },
        })
      );

    return NextResponse.json({
      ok: true,
      uploadId,
      key: pending.fileKey,
      r2_path: pending.r2Path,
      etag:
        completed.ETag || null,
      location:
        completed.Location || null,
      finalizeToken,
    });
  } catch (error) {
    console.error(
      "MULTIPART_R2_COMPLETE_ERROR",
      error
    );

    return NextResponse.json(
      {
        error:
          "R2 no pudo completar la subida multipart",
      },
      { status: 500 }
    );
  }
}

async function handleMultipartR2Abort(
  req: NextRequest
) {
  const authenticatedUser =
    getAuthenticatedUser(req);

  if (!authenticatedUser) {
    return NextResponse.json(
      {
        error:
          "Debes iniciar sesión para cancelar la subida",
      },
      { status: 401 }
    );
  }

  const body = await req
    .json()
    .catch(() => null);

  if (!body) {
    return NextResponse.json(
      { error: "Body inválido" },
      { status: 400 }
    );
  }

  const uploadId = String(
    body.uploadId || ""
  ).trim();

  const finalizeToken = String(
    body.finalizeToken || ""
  ).trim();

  if (!uploadId) {
    return NextResponse.json(
      {
        error:
          "Falta el identificador multipart",
      },
      { status: 400 }
    );
  }

  const pending =
    verifyFinalizeToken(finalizeToken);

  if (!pending) {
    return NextResponse.json(
      {
        error:
          "Token de subida inválido o expirado",
      },
      { status: 400 }
    );
  }

  if (
    String(pending.createdById) !==
    String(authenticatedUser.id)
  ) {
    return NextResponse.json(
      {
        error:
          "No tienes permiso para cancelar esta subida",
      },
      { status: 403 }
    );
  }

  const r2Client = getR2Client();
  const bucket = getR2BucketName();

  try {
    await r2Client.send(
      new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: pending.fileKey,
        UploadId: uploadId,
      })
    );

    return NextResponse.json({
      ok: true,
      aborted: true,
      uploadId,
      key: pending.fileKey,
    });
  } catch (error) {
    console.error(
      "MULTIPART_R2_ABORT_ERROR",
      error
    );

    return NextResponse.json(
      {
        error:
          "No se pudo cancelar la subida multipart",
      },
      { status: 500 }
    );
  }
}
async function handleDirectR2Finalize(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

 const finalizeToken =
  String(body.finalizeToken || "");

const pending =
  verifyFinalizeToken(finalizeToken);

  if (!pending) {
    return NextResponse.json(
      { error: "Token de finalización inválido o expirado" },
      { status: 400 }
    );
  }
 const {
  rowId,
  fileName,
  fileKey,
  r2Path,
  size,
  category,
  subcategory,
  ficha,
  contentType,
  createdById,
  visibility,
  requiresApproval,
  approvalStatus,
  assignedUsers,
  assignedGroups,
} = pending;
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const tipo = getTipoFromExt(ext);
  const gcsUri: string | null = null;
  const streamingPath: string | null = null;

  try {
    await createUploadWithPrivacy({
      rowId,
      fileName,
      fileKey,
      filePath: gcsUri,
      size,
      tipo,
      category,
      subcategory,
      r2Path,
      createdById,
      visibility,
      requiresApproval,
      approvalStatus,
      assignedUsers,
      assignedGroups,
    });
    await upsertFichaTecnica(rowId, ficha);

    const cfData =
      tipo === "video"
        ? await sendVideoToCloudflareStream({
          rowId,
          fileName,
          r2Path,
        })
        : {
          cfStreamUid: null as string | null,
          cfStreamReady: false,
          cfStreamStatus: null as string | null,
          cfStreamPlaybackUrl: null as string | null,
        };

    await triggerPostProcess(rowId, ext, gcsUri, fileKey, r2Path);

    

   return NextResponse.json({
  id: rowId,
  message: `Archivo ${ext.toUpperCase()} subido correctamente`,
  url: gcsUri,
  file_path: gcsUri,
  r2_path: r2Path,
  streaming_path: streamingPath,
  cf_stream_uid: cfData.cfStreamUid,
  cf_stream_ready: cfData.cfStreamReady,
  cf_stream_status: cfData.cfStreamStatus,
  cf_stream_playback_url: cfData.cfStreamPlaybackUrl,
  key: fileKey,
  tipo,
  category,
  subcategory,
  contentType,
  visibility,
  requires_approval: requiresApproval,
  approval_status: approvalStatus,
  assigned_users: assignedUsers,
});
  } catch (error) {
    console.error("Error finalize direct R2:", error);

    return NextResponse.json(
      { error: "Error al finalizar subida directa a R2" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  console.log("UPLOAD_POST", new Date().toISOString());

  try {
    const authenticatedUser = getAuthenticatedUser(req);

    if (!authenticatedUser) {
      return NextResponse.json(
        { error: "Debes iniciar sesión para subir archivos" },
        { status: 401 }
      );
    }

    const requestContentType = req.headers.get("content-type") || "";

    if (requestContentType.includes("application/json")) {
      const clone = req.clone();
      const body = await clone.json().catch(() => null);
      const mode = body?.mode;

     if (mode === "direct-r2") {
  return handleDirectR2Init(req);
}

if (mode === "multipart-r2-init") {
  return handleMultipartR2Init(req);
}

if (mode === "multipart-r2-sign-part") {
  return handleMultipartR2SignPart(req);
}

if (mode === "multipart-r2-complete") {
  return handleMultipartR2Complete(req);
}

if (mode === "multipart-r2-abort") {
  return handleMultipartR2Abort(req);
}
if (mode === "finalize-direct-r2") {
  return handleDirectR2Finalize(req);
}
      return NextResponse.json({ error: "Modo no soportado" }, { status: 400 });
    }



    const fileSize = Number(req.headers.get("x-filesize") || 0);
    if (fileSize > 2 * 1024 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Archivo demasiado grande para este endpoint. Use direct upload." },
        { status: 413 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const thumbnail = formData.get("thumbnail") as File | null;
    const rawCat = ((formData.get("category") as string | null)?.trim().toLowerCase() || "");

    if (!(await isValidCat(rawCat))) {
      return NextResponse.json({ error: "Categoría inválida" }, { status: 400 });
    }

    const category: CatSlug = rawCat;

    const subcategory =
      formData.get("subcategory") && String(formData.get("subcategory")).trim()
        ? String(formData.get("subcategory")).trim()
        : null;

    let ficha: FichaInput | null = null;
    const fichaStr = (formData.get("ficha") as string | null) || "";

    if (fichaStr) {
      try {
        ficha = JSON.parse(fichaStr);
      } catch {
        ficha = null;
      }
    }
let assignedUsersInput: unknown = [];
let assignedGroupsInput: unknown = [];

const assignedUsersStr =
  (formData.get("assignedUsers") as string | null) || "";

if (assignedUsersStr) {
  try {
    assignedUsersInput = JSON.parse(assignedUsersStr);
  } catch {
    assignedUsersInput = [];
  }
}

const assignedGroupsStr =
  (formData.get(
    "assignedGroups"
  ) as string | null) || "";

if (assignedGroupsStr) {
  try {
    assignedGroupsInput =
      JSON.parse(
        assignedGroupsStr
      );
  } catch {
    assignedGroupsInput = [];
  }
}
const privacy = parseUploadPrivacy({
  visibility:
    formData.get("visibility"),

  requiresApproval:
    formData.get(
      "requiresApproval"
    ),

  assignedUsers:
    assignedUsersInput,

  assignedGroups:
    assignedGroupsInput,
});

    const filename = file.name;
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    const safeFileName = sanitizeFileName(filename);
    const fileKey = `${randomUUID()}_${safeFileName}`;
    const rowId = randomUUID();
    const tipo = getTipoFromExt(ext);
    const gcsUri: string | null = null;

    let r2Path: string | null = null;

    try {
      const buffer = Buffer.from(await file.arrayBuffer());

      r2Path = await uploadBufferToR2({
        key: fileKey,
        buffer,
        contentType: file.type || "application/octet-stream",
      });

      console.log("R2_FORMDATA_UPLOAD_RESULT", {
        rowId,
        fileKey,
        r2Path,
      });
    } catch (r2Err) {
      console.error("R2_FORMDATA_UPLOAD_FAILED", r2Err);
    }

    if (!r2Path) {
      return NextResponse.json(
        { error: "No se pudo guardar el archivo en R2" },
        { status: 500 }
      );
    }

   await createUploadWithPrivacy({
  rowId,
  fileName: filename,
  fileKey,
  filePath: gcsUri,
  size: file.size,
  tipo,
  category,
  subcategory,
  r2Path,
  createdById: authenticatedUser.id,
  visibility: privacy.visibility,
  requiresApproval: privacy.requiresApproval,
  approvalStatus: privacy.approvalStatus,
  assignedUsers: privacy.assignedUsers,
  assignedGroups:
  privacy.assignedGroups,
});

    await upsertFichaTecnica(rowId, ficha);

    const thumbnailUrl = await uploadCustomThumbnail(rowId, thumbnail);

    const streamingPath: string | null = null;

    const cfData =
      tipo === "video"
        ? await sendVideoToCloudflareStream({
          rowId,
          fileName: filename,
          r2Path,
        })
        : {
          cfStreamUid: null as string | null,
          cfStreamReady: false,
          cfStreamStatus: null as string | null,
          cfStreamPlaybackUrl: null as string | null,
        };

    await triggerPostProcess(rowId, ext, gcsUri, fileKey, r2Path);

    return NextResponse.json({
  id: rowId,
  message: `Archivo ${ext.toUpperCase()} subido correctamente`,
  url: gcsUri,
  file_path: gcsUri,
  r2_path: r2Path,
  streaming_path: streamingPath,
  thumbnail_url: thumbnailUrl,
  cf_stream_uid: cfData.cfStreamUid,
  cf_stream_ready: cfData.cfStreamReady,
  cf_stream_status: cfData.cfStreamStatus,
  cf_stream_playback_url: cfData.cfStreamPlaybackUrl,
  key: fileKey,
  tipo,
  category,
  subcategory,
  visibility: privacy.visibility,
  requires_approval: privacy.requiresApproval,
  approval_status: privacy.approvalStatus,
  assigned_users: privacy.assignedUsers,
  assigned_groups: privacy.assignedGroups,
});
  } catch (error) {
    console.error("Error general:", error);
    return NextResponse.json(
      { error: "Error al subir archivo o procesar automáticamente" },
      { status: 500 }
    );
  }
}