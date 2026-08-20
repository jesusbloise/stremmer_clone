export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { GoogleAuth } from "google-auth-library";
import { NextResponse } from "next/server";
import pool from "@/db";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl as getR2SignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Client } from "@/lib/r2";

function parseR2Url(raw?: string | null) {
  if (!raw || !raw.startsWith("r2://")) {
    return null;
  }

  const clean = raw.slice(5);
  const slash = clean.indexOf("/");

  if (slash === -1) {
    return null;
  }

  const bucket = clean.slice(0, slash);
  const objectPath = clean.slice(slash + 1);

  if (!bucket || !objectPath) {
    return null;
  }

  return {
    bucket,
    objectPath,
  };
}

async function buildR2SignedUrl(r2Path: string) {
  const parsed = parseR2Url(r2Path);

  if (!parsed) {
    throw new Error("r2_path inválido");
  }

  const r2Client = getR2Client();

  const command = new GetObjectCommand({
    Bucket: parsed.bucket,
    Key: parsed.objectPath,
  });

  return getR2SignedUrl(r2Client, command, {
    expiresIn: 60 * 60,
  });
}

async function startTranscriptionJob(
  videoId: string,
  videoUrl: string
) {
  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT;

  if (!projectId) {
    throw new Error("Missing GOOGLE_CLOUD_PROJECT or GCLOUD_PROJECT");
  }

  const region = "us-central1";
  const jobName = process.env.TRANSCRIPTION_JOB_NAME;

  if (!jobName) {
    throw new Error("Missing TRANSCRIPTION_JOB_NAME");
  }

  const auth = new GoogleAuth({
    scopes: [
      "https://www.googleapis.com/auth/cloud-platform",
    ],
  });

  const client = await auth.getClient();

  const runJobUrl =
    `https://run.googleapis.com/v2/projects/${projectId}` +
    `/locations/${region}/jobs/${jobName}:run`;

  const response = await client.request({
    url: runJobUrl,
    method: "POST",
    data: {
      overrides: {
        containerOverrides: [
          {
            args: [
              videoId,
              videoUrl,
            ],
          },
        ],
      },
    },
  });

  return response.data;
}

export async function POST(
  _req: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const { id: videoId } =
    await context.params;

  try {
    /*
     * Si ya existen subtítulos para este video,
     * no volvemos a disparar otra transcripción.
     */
    const pre = await pool.query(
      `
      SELECT 1
      FROM video_subtitulos
      WHERE video_id = $1
      LIMIT 1
      `,
      [videoId]
    );

    if (
      pre.rowCount &&
      pre.rowCount > 0
    ) {
      return NextResponse.json({
        success: true,
        processing: false,
        message: "Ya procesado",
      });
    }

    /*
     * Buscamos el original almacenado en R2.
     */
    const q = await pool.query(
      `
      SELECT
        id,
        r2_path,
        file_path,
        file_key
      FROM uploads
      WHERE id = $1
      LIMIT 1
      `,
      [videoId]
    );

    const row = q.rows[0];

    if (!row) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Upload no existe",
        },
        {
          status: 404,
        }
      );
    }

    const r2Path:
      | string
      | null =
      row.r2_path ?? null;

    if (
      !r2Path ||
      !r2Path.startsWith("r2://")
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "El video no está disponible en R2 para procesar subtítulos",
          details: {
            id: row.id,
            r2_path:
              row.r2_path,
            file_path:
              row.file_path,
            file_key:
              row.file_key,
          },
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Creamos URL temporal del original.
     * El Job independiente la utilizará
     * para descargar el video.
     */
    const videoUrl =
      await buildR2SignedUrl(
        r2Path
      );

        /*
     * IMPORTANTE:
     * Whisper ya NO se ejecuta dentro
     * de la aplicación web.
     *
     * Solamente disparamos el Job
     * de transcripción configurado.
     */
    const execution =
      await startTranscriptionJob(
        videoId,
        videoUrl
      );

    /*
     * Respondemos inmediatamente.
     * El frontend seguirá consultando
     * /api/subtitulos/[id] mediante polling.
     */
    return NextResponse.json(
      {
        success: true,
        processing: true,
        message:
          "Transcripción iniciada",
        videoId,
        execution,
      },
      {
        status: 202,
      }
    );
  } catch (err: any) {
    console.error(
      "POST /api/procesar-subtitulos/[id] error:",
      err
    );

    return NextResponse.json(
      {
        success: false,
        processing: false,
        message:
          err?.message ||
          "Error procesando subtítulos",
      },
      {
        status: 500,
      }
    );
  }
}