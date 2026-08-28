import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Client } from "@/lib/r2";

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
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

export function getCloudflareStreamPlaybackUrl(uid: string) {
  return `https://iframe.videodelivery.net/${uid}`;
}

export async function createR2SignedReadUrl(r2Path: string) {
  const parsed = parseR2Url(r2Path);
  if (!parsed) throw new Error("Invalid R2 path");

  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({
      Bucket: parsed.bucket,
      Key: parsed.objectPath,
    }),
    { expiresIn: 60 * 60 }
  );
}

export async function copyVideoToCloudflareStream(params: {
  videoUrl: string;
  name?: string | null;
}) {
  const accountId = getRequiredEnv("CF_ACCOUNT_ID");
  const token = getRequiredEnv("CF_STREAM_TOKEN");

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/copy`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: params.videoUrl,
        meta: {
          name: params.name || "atomica-video",
        },
      }),
    }
  );

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.success) {
    console.error("CF_STREAM_COPY_ERROR", JSON.stringify(data, null, 2));
    throw new Error(
      data?.errors?.[0]?.message ||
        data?.messages?.[0]?.message ||
        "Cloudflare Stream copy failed"
    );
  }

  const uid = data.result?.uid as string | undefined;
  const ready = Boolean(data.result?.readyToStream);

  if (!uid) throw new Error("Cloudflare Stream did not return uid");

  return {
    uid,
    ready,
    status: ready ? "ready" : "processing",
    playbackUrl: getCloudflareStreamPlaybackUrl(uid),
    raw: data.result,
  };
}

export async function getCloudflareStreamVideoStatus(uid: string) {
  const accountId = getRequiredEnv("CF_ACCOUNT_ID");
  const token = getRequiredEnv("CF_STREAM_TOKEN");

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.success) {
    console.error("CF_STREAM_STATUS_ERROR", JSON.stringify(data, null, 2));
    throw new Error(
      data?.errors?.[0]?.message ||
        data?.messages?.[0]?.message ||
        "Cloudflare Stream status failed"
    );
  }

  const ready = Boolean(data.result?.readyToStream);

  return {
    uid,
    ready,
    status: ready ? "ready" : "processing",
    playbackUrl: getCloudflareStreamPlaybackUrl(uid),
    raw: data.result,
  };
}

export type CloudflareStreamCaption = {
  generated?: boolean;
  label?: string;
  language?: string;
  status?: "ready" | "inprogress" | "error";
};

export async function getCloudflareStreamCaptions(
  uid: string
): Promise<CloudflareStreamCaption[]> {
  const accountId = getRequiredEnv("CF_ACCOUNT_ID");
  const token = getRequiredEnv("CF_STREAM_TOKEN");

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/captions`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    }
  );

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.success) {
    console.error(
      "CF_STREAM_CAPTIONS_ERROR",
      JSON.stringify(data, null, 2)
    );

    throw new Error(
      data?.errors?.[0]?.message ||
        data?.messages?.[0]?.message ||
        "Cloudflare Stream captions request failed"
    );
  }

  return Array.isArray(data.result)
    ? (data.result as CloudflareStreamCaption[])
    : [];
}

export async function generateCloudflareStreamCaption(
  uid: string,
  language: string
): Promise<CloudflareStreamCaption> {
  const accountId = getRequiredEnv("CF_ACCOUNT_ID");
  const token = getRequiredEnv("CF_STREAM_TOKEN");

  const normalizedLanguage = language.trim().toLowerCase();

  if (!normalizedLanguage) {
    throw new Error("Caption language is required");
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/captions/${encodeURIComponent(
      normalizedLanguage
    )}/generate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.success) {
    console.error(
      "CF_STREAM_CAPTION_GENERATE_ERROR",
      JSON.stringify(data, null, 2)
    );

    throw new Error(
      data?.errors?.[0]?.message ||
        data?.messages?.[0]?.message ||
        "Cloudflare Stream caption generation failed"
    );
  }

  return data.result as CloudflareStreamCaption;
}