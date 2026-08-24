import { NextRequest } from "next/server";
import { Storage } from "@google-cloud/storage";
import { Readable } from "stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const storage = new Storage();

function parseGsUrl(raw: string) {
  if (!raw.startsWith("gs://")) return null;

  const withoutScheme = raw.slice(5);
  const firstSlash = withoutScheme.indexOf("/");
  if (firstSlash === -1) return null;

  const bucket = withoutScheme.slice(0, firstSlash);
  const objectPath = withoutScheme.slice(firstSlash + 1);

  if (!bucket || !objectPath) return null;

  return { bucket, objectPath };
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseRangeHeader(
  rangeHeader: string | null,
  totalSize: number
) {
  if (!rangeHeader) return null;

  const match = rangeHeader.match(
    /^bytes=(\d*)-(\d*)$/i
  );

  if (!match) return null;

  const startRaw = match[1];
  const endRaw = match[2];

  let start: number;
  let end: number;

  if (startRaw === "" && endRaw === "") {
    return null;
  }

  if (startRaw === "") {
    const suffixLength = Number(endRaw);

    if (
      !Number.isFinite(suffixLength) ||
      suffixLength <= 0
    ) {
      return null;
    }

    start = Math.max(
      totalSize - suffixLength,
      0
    );

    end = totalSize - 1;
  } else {
    start = Number(startRaw);

    end =
      endRaw === ""
        ? totalSize - 1
        : Number(endRaw);
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end)
  ) {
    return null;
  }

  if (
    start < 0 ||
    end < 0 ||
    start > end ||
    start >= totalSize
  ) {
    return null;
  }

  end = Math.min(
    end,
    totalSize - 1
  );

  return { start, end };
}

function nodeStreamToWebReadable(
  stream: Readable
) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on("data", (chunk) => {
        controller.enqueue(
          chunk instanceof Uint8Array
            ? chunk
            : new Uint8Array(chunk)
        );
      });

      stream.on("end", () => {
        controller.close();
      });

      stream.on("error", (err) => {
        console.error(
          "proxy node stream error:",
          err
        );

        controller.error(err);
      });
    },

    cancel() {
      stream.destroy();
    },
  });
}

async function resolveGcsFile(
  bucket: string,
  rawObjectPath: string
) {
  const candidates = Array.from(
    new Set([
      rawObjectPath,
      safeDecodeURIComponent(rawObjectPath),
    ])
  );

  for (const candidate of candidates) {
    const file =
      storage
        .bucket(bucket)
        .file(candidate);

    try {
      const [meta] =
        await file.getMetadata();

      return {
        file,
        metadata: meta,
        objectPath: candidate,
      };
    } catch {
      // Probamos el siguiente candidato.
    }
  }

  return null;
}

async function handleGsRequest(
  rawUrl: string,
  req: NextRequest
) {
  const parsed = parseGsUrl(rawUrl);

  if (!parsed) {
    return new Response(
      "bad gs url",
      { status: 400 }
    );
  }

  const {
    bucket,
    objectPath,
  } = parsed;

  const decodedPath =
    safeDecodeURIComponent(objectPath);

  const file =
    storage
      .bucket(bucket)
      .file(decodedPath);

  try {
    const [metadata] =
      await file.getMetadata();

    const totalSize =
      Number(metadata.size || 0);

    const contentType =
      metadata.contentType ||
      "application/octet-stream";

    const rangeHeader =
      req.headers.get("range");

    const range =
      totalSize > 0
        ? parseRangeHeader(
            rangeHeader,
            totalSize
          )
        : null;

    let responseStream: Readable;
    let status = 200;

    const responseHeaders =
      new Headers({
        "Content-Type":
          contentType,
        "Accept-Ranges":
          "bytes",
        "Cache-Control":
          "public, max-age=3600",
      });

    if (range) {
      status = 206;

      responseStream =
        file.createReadStream({
          start: range.start,
          end: range.end,
        });

      responseHeaders.set(
        "Content-Range",
        `bytes ${range.start}-${range.end}/${totalSize}`
      );

      responseHeaders.set(
        "Content-Length",
        String(
          range.end -
            range.start +
            1
        )
      );
    } else {
      responseStream =
        file.createReadStream();

      if (totalSize > 0) {
        responseHeaders.set(
          "Content-Length",
          String(totalSize)
        );
      }
    }

    const webStream =
      nodeStreamToWebReadable(
        responseStream
      );

    return new Response(
      webStream,
      {
        status,
        headers:
          responseHeaders,
      }
    );
  } catch (err: any) {
    console.error(
      "Error directo de GCS:",
      {
        path: decodedPath,
        message:
          err?.message,
      }
    );

    return new Response(
      "Archivo no encontrado o error de acceso",
      { status: 404 }
    );
  }
}

async function handleGsHead(
  rawUrl: string
) {
  const parsed =
    parseGsUrl(rawUrl);

  if (!parsed) {
    return new Response(
      null,
      { status: 400 }
    );
  }

  const {
    bucket,
    objectPath,
  } = parsed;

  const resolved =
    await resolveGcsFile(
      bucket,
      objectPath
    );

  if (!resolved) {
    console.error(
      "proxy gs HEAD file not found:",
      {
        rawUrl,
        bucket,
        objectPath,
        decodedObjectPath:
          safeDecodeURIComponent(
            objectPath
          ),
      }
    );

    return new Response(
      null,
      { status: 404 }
    );
  }

  const { metadata } =
    resolved;

  const headers =
    new Headers();

  headers.set(
    "content-type",
    metadata.contentType ||
      "application/octet-stream"
  );

  headers.set(
    "accept-ranges",
    "bytes"
  );

  headers.set(
    "cache-control",
    "no-store"
  );

  if (metadata.size) {
    headers.set(
      "content-length",
      String(metadata.size)
    );
  }

  if (metadata.etag) {
    headers.set(
      "etag",
      metadata.etag
    );
  }

  if (metadata.updated) {
    headers.set(
      "last-modified",
      new Date(
        metadata.updated
      ).toUTCString()
    );
  }

  return new Response(
    null,
    {
      status: 200,
      headers,
    }
  );
}

export async function GET(
  req: NextRequest
) {
  const rawUrl =
    req.nextUrl
      .searchParams
      .get("url");

  if (!rawUrl) {
    return new Response(
      "missing url",
      { status: 400 }
    );
  }

  if (
    !rawUrl.startsWith(
      "gs://"
    )
  ) {
    return new Response(
      "unsupported url",
      { status: 400 }
    );
  }

  return handleGsRequest(
    rawUrl,
    req
  );
}

export async function HEAD(
  req: NextRequest
) {
  const rawUrl =
    req.nextUrl
      .searchParams
      .get("url");

  if (!rawUrl) {
    return new Response(
      null,
      { status: 400 }
    );
  }

  if (
    !rawUrl.startsWith(
      "gs://"
    )
  ) {
    return new Response(
      null,
      { status: 400 }
    );
  }

  return handleGsHead(
    rawUrl
  );
}