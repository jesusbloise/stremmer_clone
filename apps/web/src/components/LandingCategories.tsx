"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Item = {
  id: string;
  url?: string | null;
  file_path?: string | null;
  r2_path?: string | null;
  file_name?: string;
  display_name?: string | null;
  titulo?: string | null;
  tipo?: string;
  thumbnail_url?: string | null;
  cf_stream_playback_url?: string | null;
  using_cloudflare_stream?: boolean;
};

type CategoryFromApi = {
  id: string;
  slug: string;
  label: string;
  description?: string;
  cover?: string;
  is_active: boolean;
  sort_order: number;
};

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;

function stripExt(s?: string | null) {
  if (!s) return "Archivo";

  let safe = s;

  try {
    safe = decodeURIComponent(s);
  } catch {
    safe = s;
  }

  const base =
    safe.split("/").pop() || safe;

  return base.replace(
    /\.[^.\/\\]+$/g,
    ""
  );
}

function proxiedUrl(
  u?: string | null
) {
  if (!u) return "";

  const s = String(u).trim();

  if (
    s.startsWith("/api/proxy?url=")
  ) {
    return s;
  }

  if (
    s.startsWith(
      "/api/r2/proxy?url="
    )
  ) {
    return s;
  }

  if (s.startsWith("r2://")) {
    return `/api/r2/proxy?url=${encodeURIComponent(
      s
    )}`;
  }

  if (s.startsWith("gs://")) {
    return `/api/proxy?url=${encodeURIComponent(
      s
    )}`;
  }

  return s;
}

export default function LandingCategories() {
  const [items, setItems] =
    useState<Item[]>([]);

  const [index, setIndex] =
    useState(0);

  const [
    categories,
    setCategories,
  ] = useState<
    CategoryFromApi[]
  >([]);

  const timerRef =
    useRef<
      ReturnType<
        typeof setTimeout
      > | null
    >(null);

  const videoRef =
    useRef<HTMLVideoElement | null>(
      null
    );

  const INTERVAL = 6000;
  const selectionMode = false;

  useEffect(() => {
    let cancel = false;

    async function load() {
      try {
        const res = await fetch(
          "/api/videos",
          {
            cache: "no-store",
          }
        );

        if (!res.ok) return;

        const data: Item[] =
          await res.json();

        if (
          !cancel &&
          Array.isArray(data)
        ) {
          const list = data
            .filter(
              (v: Item) =>
                Boolean(v?.id)
            )
            .slice(0, 6);

          setItems(list);
          setIndex(0);
        }
      } catch {}
    }

    void load();

    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    let cancel = false;

    async function loadCategories() {
      try {
        const res = await fetch(
          "/api/categories",
          {
            cache: "no-store",
          }
        );

        if (!res.ok) return;

        const data =
          await res.json();

        if (
          !cancel &&
          Array.isArray(
            data?.categories
          )
        ) {
          setCategories(
            data.categories
          );
        }
      } catch (err) {
        console.error(
          "Error cargando categorías:",
          err
        );
      }
    }

    void loadCategories();

    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!items.length) {
      return;
    }

    if (timerRef.current) {
      clearTimeout(
        timerRef.current
      );
    }

    timerRef.current =
      setTimeout(() => {
        setIndex(
          (i) =>
            (i + 1) %
            items.length
        );
      }, INTERVAL);

    return () => {
      if (
        timerRef.current
      ) {
        clearTimeout(
          timerRef.current
        );
      }
    };
  }, [
    index,
    items.length,
  ]);

  useEffect(() => {
    const v =
      videoRef.current;

    if (!v) {
      return;
    }

    try {
      v.currentTime = 0;
    } catch {}

    v.play().catch(
      () => {}
    );
  }, [index]);

  const current =
    useMemo(() => {
      return (
        items[index] ||
        null
      );
    }, [items, index]);

  const prev = () => {
    if (!items.length) {
      return;
    }

    setIndex(
      (i) =>
        (i -
          1 +
          items.length) %
        items.length
    );
  };

  const next = () => {
    if (!items.length) {
      return;
    }

    setIndex(
      (i) =>
        (i + 1) %
        items.length
    );
  };

  const streamSrc =
    current
      ?.cf_stream_playback_url ||
    current?.url ||
    "";

  const rawSrc =
    current?.r2_path ||
    current?.file_path ||
    current?.url ||
    "";

  const src =
    proxiedUrl(rawSrc);

  const thumbnailSrc =
    proxiedUrl(
      current?.thumbnail_url
    );

  const isCloudflareStream =
    streamSrc.includes(
      "iframe.videodelivery.net"
    );

  const isVideo =
    current?.tipo ===
      "video" ||
    VIDEO_EXT.test(
      rawSrc || ""
    );

  const name =
    stripExt(
      current?.display_name ||
        current?.titulo ||
        current?.file_name
    ) || "Archivo";

  const href = current
    ? `/videos/${current.id}`
    : "#";

  return (
    <div className="w-full overflow-visible">
      {current && (
        <div className="relative w-full overflow-hidden bg-zinc-950">
          <div className="relative h-[clamp(330px,48vh,470px)] bg-zinc-900">
            {thumbnailSrc ? (
              <img
                src={
                  thumbnailSrc
                }
                alt={name}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : isCloudflareStream ? (
              <iframe
                src={
                  streamSrc
                }
                className="absolute inset-0 h-full w-full"
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                allowFullScreen
              />
            ) : isVideo &&
              src ? (
              <video
                key={
                  current.id
                }
                ref={
                  videoRef
                }
                src={src}
                muted
                loop
                playsInline
                autoPlay
                preload="metadata"
                controls={
                  false
                }
                disablePictureInPicture
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-800 text-zinc-300">
                <span className="text-sm">
                  Sin vista
                  previa
                </span>
              </div>
            )}

            <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-7 md:px-8 md:pb-8">
              <div className="max-w-xl">
                <p className="text-left text-xl font-bold text-white drop-shadow-md md:text-2xl">
                  {name}
                </p>

                <div className="mt-2 flex justify-start">
                  <Link
                    href={
                      selectionMode
                        ? "#"
                        : href
                    }
                    aria-disabled={
                      selectionMode
                    }
                  >
                    <motion.button
                      disabled={
                        selectionMode
                      }
                      whileHover={{
                        scale: 1.05,
                      }}
                      whileTap={{
                        scale: 0.95,
                      }}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium backdrop-blur-sm transition ${
                        selectionMode
                          ? "border-zinc-700 bg-black/40 text-zinc-500"
                          : "border-orange-400 bg-black/45 text-orange-400 hover:border-orange-500 hover:bg-black/65 hover:text-orange-500"
                      }`}
                      aria-label={`Ver más sobre ${name}`}
                    >
                      Ver más
                    </motion.button>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {items.length >
            1 && (
            <>
              <button
                onClick={
                  prev
                }
                aria-label="Anterior"
                className="absolute left-3 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full border border-white/15 bg-black/40 text-white hover:bg-black/60"
              >
                ‹
              </button>

              <button
                onClick={
                  next
                }
                aria-label="Siguiente"
                className="absolute right-3 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full border border-white/15 bg-black/40 text-white hover:bg-black/60"
              >
                ›
              </button>

              <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-2">
                {items.map(
                  (_, i) => (
                    <button
                      key={
                        i
                      }
                      onClick={() =>
                        setIndex(
                          i
                        )
                      }
                      aria-label={`Ir al slide ${
                        i +
                        1
                      }`}
                      className={`h-2.5 rounded-full transition-all ${
                        i ===
                        index
                          ? "w-6 bg-white"
                          : "w-2.5 bg-white/50 hover:bg-white/80"
                      }`}
                    />
                  )
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex w-full justify-center overflow-visible">
        <div className="w-full max-w-[1540px] overflow-visible px-2 pb-10 pt-4 md:px-3">
          <h1 className="mb-4 text-center text-xl font-bold md:text-2xl">
            Categorías
            principales
          </h1>

          <div className="flex w-full flex-wrap items-center justify-center gap-4 overflow-visible xl:flex-nowrap xl:gap-5">
            {categories.map(
              (c, i) => (
                <Link
                  key={
                    c.slug
                  }
                  href={`/organizar/${c.slug}`}
                  className="
                    group
                    relative
                    z-0
                    block
                    w-[245px]
                    shrink-0
                    overflow-visible
                    transition-all
                    duration-300
                    ease-out
                    hover:z-50
                  "
                >
                  <article
                    className="
                      flex
                      h-full
                      origin-center
                      flex-col
                      overflow-hidden
                      rounded-xl
                      border
                      border-zinc-800/80
                      bg-zinc-900
                      shadow-sm
                      transition-all
                      duration-300
                      ease-out

                      group-hover:-translate-y-7
                      group-hover:scale-[1.85]
                      group-hover:border-orange-500/70
                      group-hover:shadow-[0_24px_70px_rgba(0,0,0,0.85)]
                    "
                  >
                    <div className="relative aspect-[16/10] w-full overflow-hidden bg-black">
                      <Image
                        src={
                          c.cover ||
                          "/Publicidad.avif"
                        }
                        alt={
                          c.label
                        }
                        fill
                        className="
                          object-cover
                          transition-all
                          duration-300
                          group-hover:scale-[1.04]
                        "
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 245px"
                        priority={
                          i ===
                          0
                        }
                      />
                    </div>

                    <div className="mt-auto p-3 text-center">
                      <h3 className="truncate text-center text-sm font-bold uppercase tracking-wide text-white md:text-base">
                        {
                          c.label
                        }
                      </h3>
                    </div>
                  </article>
                </Link>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}