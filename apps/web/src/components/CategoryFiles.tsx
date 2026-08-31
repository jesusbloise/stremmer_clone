"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

/* ============ Modo datos en vivo ============ */
const DEMO_MODE = false;
const API_PATH = "/api/uploads";

type Group = { label: string };

type CategoryFromApi = {
  id: string;
  slug: string;
  label: string;
  description?: string;
  cover?: string;
  is_active: boolean;
  sort_order: number;
  subcategories: {
    id: string;
    label: string;
    is_active: boolean;
    sort_order: number;
  }[];
};


const OFFICE_OPTIONS = ["Chile", "Mexico"] as const;
const COLOR_PUBLICIDAD = ["3D", "IA", "Musica", "Sonido"] as const;
const COLOR_ENTRETENIMIENTO = ["3D", "IA", "Musica", "Sonido", "VFX", "Edicion"] as const;

type UploadItem = {
  id: string;
  file_name: string;
  file_path: string;
  url?: string;
  uploaded_at?: string;
  size_in_bytes?: number;
  tipo?: "video" | "documento" | null;
  category?: string | null;
  subcategory?: string | null;
  thumbnail_url?: string | null;
  display_name?: string;
  titulo?: string;
};

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;
const PDF_EXT = /\.pdf$/i;
const DOCX_EXT = /\.docx$/i;
const DOC_EXT = /\.doc$/i;

function stripExt(s?: string | null) {
  if (!s) return "Archivo";

  let safe = s;
  try {
    safe = decodeURIComponent(s);
  } catch {
    safe = s;
  }

  const base = safe.split("/").pop() || safe;
  return base.replace(/\.[^.\/\\]+$/g, "");
}
function getExt(item: UploadItem) {
  const source = item.file_name || item.display_name || item.titulo || item.file_path || item.url || "";
  return source.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase() || "";
}
function proxiedUrl(u?: string | null) {
  if (!u) return "";
  const s = String(u).trim();

  if (s.startsWith("/api/proxy?url=")) return s;
  if (s.startsWith("/api/r2/proxy?url=")) return s;

  if (s.startsWith("r2://")) {
    return `/api/r2/proxy?url=${encodeURIComponent(s)}`;
  }

  if (s.startsWith("gs://")) {
    return `/api/proxy?url=${encodeURIComponent(s)}`;
  }

  if (s.startsWith("http://") || s.startsWith("https://")) {
    return s;
  }

  return s;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function getPerPage(w: number) {
  if (w < 480) return 1;
  if (w < 768) return 2;
  if (w < 1024) return 3;
  if (w < 1280) return 4;
  return 5;
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)");
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);

    setIsMobile(mql.matches);

    try {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    } catch {
      mql.addListener(onChange);
      return () => mql.removeListener(onChange);
    }
  }, []);

  return isMobile;
}

function VideoStaticPreview({
  src,
  poster,
}: {
  src: string;
  poster?: string | null;
}) {
  const posterUrl = poster ? proxiedUrl(poster) : "";

  return (
    <div className="absolute inset-0 bg-black">
      {posterUrl ? (
        <img
          src={posterUrl}
          alt="Vista previa de video"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-black">
          <div className="text-center">
            <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full border border-orange-500/40 bg-orange-500/10 text-orange-300 text-2xl font-black">
              ▶
            </div>
            <p className="text-xs text-zinc-400">Vista previa de video</p>
          </div>
        </div>
      )}

      <div className="absolute inset-0 bg-black/15" />
    </div>
  );
}

function DocumentPreview({
  url,
  kind,
  isMobile,
}: {
  url: string;
  kind: "pdf" | "docx" | "doc";
  isMobile: boolean;
}) {
  const label = kind === "pdf" ? "PDF" : kind === "docx" ? "WORD" : "DOC";

  return (
    <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-black">
      <div className="text-center">
        <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl border border-orange-500/40 bg-orange-500/10 text-orange-300 text-xl font-black">
          {label}
        </div>
        <p className="text-xs text-zinc-400">Vista previa de documento</p>
      </div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (next: number) => void;
}) {
  if (totalPages <= 1) return null;

  const current = page + 1;
  const maxButtons = 5;

  let start = Math.max(1, current - Math.floor(maxButtons / 2));
  let end = start + maxButtons - 1;

  if (end > totalPages) {
    end = totalPages;
    start = Math.max(1, end - maxButtons + 1);
  }

  const nums: number[] = [];
  for (let i = start; i <= end; i++) nums.push(i);

  return (
    <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
      <button
        onClick={() => onPage(Math.max(0, page - 1))}
        disabled={page === 0}
        className="h-9 w-9 grid place-items-center rounded-full border border-zinc-700 disabled:opacity-50 hover:border-zinc-500 text-zinc-200"
      >
        ‹
      </button>

      {nums.map((n) => {
        const active = n === current;

        return (
          <button
            key={n}
            onClick={() => onPage(n - 1)}
            className={[
              "h-9 min-w-9 px-3 grid place-items-center rounded-full border text-sm transition",
              active
                ? "border-orange-500/60 bg-orange-500/15 text-orange-300"
                : "border-zinc-700 hover:border-zinc-500 text-zinc-200",
            ].join(" ")}
          >
            {n}
          </button>
        );
      })}

      <button
        onClick={() => onPage(Math.min(totalPages - 1, page + 1))}
        disabled={page >= totalPages - 1}
        className="h-9 w-9 grid place-items-center rounded-full border border-zinc-700 disabled:opacity-50 hover:border-zinc-500 text-zinc-200"
      >
        ›
      </button>
    </div>
  );
}

export default function CategoryFiles({ slug }: { slug: string }) {
  const [activeSlug, setActiveSlug] = useState(slug);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<UploadItem[]>([]);
  const [menuMain, setMenuMain] = useState<string>("");
  const [menuOffice, setMenuOffice] = useState<string>("");
  const [menuColor, setMenuColor] = useState<string>("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoverMain, setHoverMain] = useState<string>("");
  const menuWrapRef = useRef<HTMLDivElement | null>(null);
  const [fullViewSub, setFullViewSub] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [fullPage, setFullPage] = useState(0);
  const FULL_PAGE_SIZE = 8;
  const [activeShelf, setActiveShelf] = useState<string>("Todo");
  const [categories, setCategories] = useState<CategoryFromApi[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  useEffect(() => setActiveSlug(slug), [slug]);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);

        if (DEMO_MODE) {
          setRows([]);
          return;
        }

        const url = new URL(API_PATH, window.location.origin);
        url.searchParams.set("category", activeSlug);
        url.searchParams.set("limit", "80");

        const res = await fetch(url.toString(), {
          cache: "no-store",
        });

        const arr = await res.json();

        if (!alive) return;

        const list: UploadItem[] = Array.isArray(arr) ? arr : [];

        list.sort(
          (a, b) =>
            (Date.parse(b.uploaded_at || "") || 0) -
            (Date.parse(a.uploaded_at || "") || 0)
        );

        setRows(list);
      } catch (e) {
        console.error("Carga categoría error:", e);
        if (alive) setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, [activeSlug]);
  useEffect(() => {
    let alive = true;

    async function loadCategories() {
      try {
        setLoadingCategories(true);

        const res = await fetch("/api/categories", {
          cache: "no-store",
        });

        const data = await res.json();

        if (!alive) return;

        const list: CategoryFromApi[] = Array.isArray(data?.categories)
          ? data.categories
          : [];

        setCategories(list);
      } catch (err) {
        console.error("Error cargando categorías:", err);
        if (alive) setCategories([]);
      } finally {
        if (alive) setLoadingCategories(false);
      }
    }

    loadCategories();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setMenuMain("");
    setMenuOffice("");
    setMenuColor("");
    setMenuOpen(false);
    setHoverMain("");
    setFullViewSub(null);
    setActiveShelf("Todo");
  }, [activeSlug]);

  useEffect(() => {
    if (fullViewSub) setFullPage(0);
  }, [fullViewSub]);

  const activeCategory = categories.find((c) => c.slug === activeSlug) || null;

  const featuredItem = rows[0] || null;

  const carouselRows = useMemo(() => {
    return rows;
  }, [rows]);

  const groups: Group[] =
    activeCategory?.subcategories
      ?.filter((s) => s.is_active)
      .map((s) => ({ label: s.label })) || [];
  const hasGroups = groups.length > 0;

  const colorsForSlug = useMemo(() => {
    return activeSlug === "entretenimiento"
      ? Array.from(COLOR_ENTRETENIMIENTO)
      : Array.from(COLOR_PUBLICIDAD);
  }, [activeSlug]);

  const navTarget = useMemo(() => {
    if (!menuMain) return null;
    if (menuMain === "Oficina") return menuOffice || null;
    if (menuMain === "Tipo") return menuColor || null;
    return menuMain;
  }, [menuMain, menuOffice, menuColor]);

  const grouped = useMemo(() => {
    if (!hasGroups) return new Map<string, UploadItem[]>([["__all__", carouselRows]]);

    const map = new Map<string, UploadItem[]>();

    for (const it of carouselRows) {
      const sub = (it.subcategory || "").toString().trim();

      if (sub) {
        if (!map.has(sub)) map.set(sub, []);
        map.get(sub)!.push(it);
        continue;
      }

      const defaultKey =
        activeSlug === "publicidad"
          ? "Marca"
          : activeSlug === "entretenimiento"
            ? "Estudio"
            : activeSlug === "ia"
              ? "Generativo"
              : "Producción";

      if (!map.has(defaultKey)) map.set(defaultKey, []);
      map.get(defaultKey)!.push(it);
    }

    return map;
  }, [carouselRows, hasGroups, activeSlug]);

  const groupEntries = useMemo(() => {
    return [...grouped.entries()].filter(([, items]) => items.length > 0);
  }, [grouped]);

  const totalAssets = rows.length;
  const totalGroups = groupEntries.length;

  const visibleEntries = useMemo(() => {
    if (activeShelf === "Todo") return groupEntries;
    return groupEntries.filter(([sub]) => sub === activeShelf);
  }, [activeShelf, groupEntries]);

  const title = activeCategory?.label ?? "Sección";

  useEffect(() => {
    if (!navTarget) return;
    const id = slugify(navTarget);
    const el = sectionRefs.current[id];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [navTarget]);

  useEffect(() => {
    if (!menuOpen) return;

    const onDown = (e: MouseEvent) => {
      const el = menuWrapRef.current;
      if (!el) return;

      if (!el.contains(e.target as Node)) {
        setMenuOpen(false);
        setHoverMain("");
      }
    };

    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const fullItems = useMemo(() => {
    if (!fullViewSub) return [];

    return rows.filter((r) => {
      const sub = (r.subcategory || "").toString().trim();

      if (sub) return sub === fullViewSub;

      const defaultKey =
        activeSlug === "publicidad"
          ? "Marca"
          : activeSlug === "entretenimiento"
            ? "Estudio"
            : activeSlug === "ia"
              ? "Generativo"
              : "Producción";

      return defaultKey === fullViewSub;
    });
  }, [fullViewSub, rows, activeSlug]);

  const fullTotalPages = Math.max(1, Math.ceil(fullItems.length / FULL_PAGE_SIZE));

  const fullPageItems = useMemo(() => {
    const start = fullPage * FULL_PAGE_SIZE;
    return fullItems.slice(start, start + FULL_PAGE_SIZE);
  }, [fullItems, fullPage]);

  const currentLabel = useMemo(() => {
    if (!menuMain) return "Estructura";
    if (menuMain === "Oficina" && menuOffice) return `Oficina / ${menuOffice}`;
    if (menuMain === "Tipo" && menuColor) return `Color / ${menuColor}`;
    if (menuMain === "Oficina") return "Oficina";
    if (menuMain === "Tipo") return "Tipo";
    return menuMain;
  }, [menuMain, menuOffice, menuColor]);

  const onPickLeaf = (leaf: string) => {
    setMenuMain(leaf);
    setMenuOffice("");
    setMenuColor("");
    setMenuOpen(false);
    setHoverMain("");
  };

  const onPickOffice = (v: string) => {
    setMenuMain("Oficina");
    setMenuOffice(v);
    setMenuColor("");
    setMenuOpen(false);
    setHoverMain("");
  };

  const onPickColor = (v: string) => {
    setMenuMain("Tipo");
    setMenuColor(v);
    setMenuOffice("");
    setMenuOpen(false);
    setHoverMain("");
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 md:px-6 -mt-8 pb-6 text-white">

      {!loading && featuredItem && (
        <section className="relative mb-6 mt-0">
          <div className="absolute top-4 left-5 right-5 z-20 flex flex-col md:flex-row md:items-start md:justify-between gap-4 pointer-events-none">
            <div className="pointer-events-auto">
              <h1 className="text-3xl md:text-4xl font-bold text-white drop-shadow">
                {title}
              </h1>

              <p className="mt-1 text-sm text-zinc-300 drop-shadow">
                {totalAssets} archivo{totalAssets === 1 ? "" : "s"} disponibles
              </p>
            </div>

            {hasGroups && (
              <div className="pointer-events-auto flex gap-2 overflow-x-auto pb-1">
                {["Todo", ...groupEntries.map(([sub]) => sub)].map((sub) => {
                  const active = activeShelf === sub;

                  return (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => setActiveShelf(sub)}
                      className={[
                        "shrink-0 rounded-full px-4 py-2 text-sm border transition backdrop-blur",
                        active
                          ? "border-orange-500 bg-orange-500 text-black font-semibold"
                          : "border-zinc-700 bg-black/50 text-zinc-300 hover:text-white hover:border-orange-500",
                      ].join(" ")}
                    >
                      {sub}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <FeaturedCard item={featuredItem} compactTop />
        </section>
      )}

      {loading ? (
        <div className="text-zinc-400 py-10">Cargando…</div>
      ) : grouped.size === 0 ? (
        <div className="text-zinc-400 py-10">No hay archivos en esta sección.</div>
      ) : (
        <>
          {visibleEntries.map(([sub, items]) => {
            if (!items.length) return null;

            const id = slugify(sub);

            return (
              <div
                key={sub}
                ref={(el) => {
                  sectionRefs.current[id] = el;
                }}
                id={`sub-${id}`}
                className="relative mb-0"
              >
                <div className="absolute left-12 right-12 md:left-16 md:right-16 top-3 z-40 flex items-start justify-between pointer-events-none">
                  <div className="pointer-events-auto rounded-xl bg-black/35 px-3 py-2 backdrop-blur-sm">
                    <h2 className="text-xl md:text-2xl font-semibold leading-none">{sub}</h2>
                    <p className="text-xs text-zinc-400 mt-1">
                      {items.length} archivo{items.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  <button
                    onClick={() => setFullViewSub(sub)}
                    className="pointer-events-auto text-xs px-3 py-1.5 rounded-full border border-zinc-700 bg-black/35 backdrop-blur-sm hover:border-orange-500 text-zinc-300 hover:text-orange-300 transition"
                    title="Ver todos los archivos"
                  >
                    Ver todos
                  </button>
                </div>

                <CategoryCarousel items={items} />
              </div>
            );
          })}

          <div className="flex w-full justify-center overflow-visible">
  <div className="w-full max-w-[1540px] overflow-visible px-2 pb-12 pt-6 md:px-3">
    <h1 className="mb-5 text-center text-xl font-bold md:text-2xl">
      Categorías principales
    </h1>

    <div className="flex w-full flex-wrap items-center justify-center gap-4 overflow-visible xl:flex-nowrap xl:gap-5">
      {categories.map((c, i) => (
        <Link
          key={c.slug}
          href={`/organizar/${c.slug}`}
          prefetch={false}
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
                src={c.cover || "/Publicidad.avif"}
                alt={c.label}
                fill
                className="
                  object-cover
                  transition-all
                  duration-300
                  group-hover:scale-[1.04]
                "
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 245px"
                priority={i === 0}
              />
            </div>

            <div className="mt-auto p-3 text-center">
              <h3 className="truncate text-center text-sm font-bold uppercase tracking-wide text-white md:text-base">
                {c.label}
              </h3>
            </div>
          </article>
        </Link>
      ))}
    </div>
  </div>
</div>
        </>
      )}

      {fullViewSub && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative z-50 h-full overflow-y-auto">
            <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6">
              <div className="relative z-20 -mb-8 px-12 md:px-16 flex items-center justify-between">
                <h2 className="text-2xl md:text-3xl font-bold">{fullViewSub}</h2>
                <button
                  onClick={() => setFullViewSub(null)}
                  className="px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500 text-sm text-zinc-300 hover:text-white"
                >
                  Volver
                </button>
              </div>

              {fullItems.length === 0 ? (
                <div className="text-zinc-400 py-12">Sin archivos.</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {fullPageItems.map((u) => (
                      <CardItemOverlay key={u.id} item={u} />
                    ))}
                  </div>

                  <Pagination
                    page={fullPage}
                    totalPages={fullTotalPages}
                    onPage={setFullPage}
                  />
                </>
              )}

              <div className="h-8" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FeaturedCard({
  item,
  compactTop = false,
}: {
  item: UploadItem;
  compactTop?: boolean;
}) {
  const isMobile = useIsMobile();

  const rawUrl = item.url || item.file_path || "";
  const name = stripExt(
    item.display_name ||
    item.titulo ||
    item.file_name ||
    rawUrl
  );

  const previewUrl = proxiedUrl(rawUrl);
  const ext = getExt(item);

  const isVideo = item.tipo === "video" || ["mp4", "webm", "mov", "m4v"].includes(ext);
  const isPdf = ext === "pdf";
  const isDocx = ext === "docx";
  const isDoc = ext === "doc";

  return (
    <motion.article className="group overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
      <div className="relative h-[420px] md:h-[460px] lg:h-[500px] w-full overflow-hidden bg-zinc-900">
        {isVideo ? (
          <VideoStaticPreview src={previewUrl} poster={item.thumbnail_url} />
        ) : isPdf ? (
          <DocumentPreview url={rawUrl} kind="pdf" isMobile={isMobile} />
        ) : isDocx ? (
          <DocumentPreview url={rawUrl} kind="docx" isMobile={isMobile} />
        ) : isDoc ? (
          <DocumentPreview url={rawUrl} kind="doc" isMobile={isMobile} />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-zinc-300 text-xs">
            Sin vista previa
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/35 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />

        <div className="absolute left-6 right-6 bottom-8 md:left-10 md:bottom-10">
          <p className="mb-2 text-[10px] md:text-xs uppercase tracking-[0.18em] font-bold text-orange-300">
            Último agregado
          </p>

          <h2 className="text-2xl md:text-4xl lg:text-5xl font-black text-white drop-shadow line-clamp-2">
            {name}
          </h2>

          <Link href={`/videos/${item.id}`} prefetch={false}>
            <button className="mt-5 rounded-lg border border-orange-400 bg-orange-500/10 px-5 py-2 text-sm font-semibold text-orange-300 hover:bg-orange-500 hover:text-black transition">
              Reproducir
            </button>
          </Link>
        </div>
      </div>
    </motion.article>
  );
}

function CardItem({ item }: { item: UploadItem }) {
  const isMobile = useIsMobile();

  const rawUrl = item.url || item.file_path || "";
  const name = stripExt(
    item.display_name ||
    item.titulo ||
    item.file_name ||
    rawUrl
  );
  const previewUrl = proxiedUrl(rawUrl);

  const typeSource = `${item.file_name || ""} ${item.file_path || ""} ${item.url || ""}`;

  const ext = getExt(item);

  const isVideo = item.tipo === "video" || ["mp4", "webm", "mov", "m4v"].includes(ext);
  const isPdf = ext === "pdf";
  const isDocx = ext === "docx";
  const isDoc = ext === "doc";

  return (
    <motion.article
      className="group relative h-full flex flex-col rounded-xl border border-white/5 bg-zinc-950 overflow-hidden shadow-lg transition-all duration-300 ease-out hover:border-orange-500/70 hover:shadow-[0_24px_70px_rgba(0,0,0,0.85)]"
      initial={isMobile ? undefined : "rest"}
      animate={isMobile ? undefined : "rest"}
      whileHover={isMobile ? undefined : "hover"}
    >
      <div className="relative aspect-video w-full bg-black overflow-hidden">
        {isVideo ? (
          <VideoStaticPreview src={previewUrl} poster={item.thumbnail_url} />
        ) : isPdf ? (
          <DocumentPreview url={rawUrl} kind="pdf" isMobile={isMobile} />
        ) : isDocx ? (
          <DocumentPreview url={rawUrl} kind="docx" isMobile={isMobile} />
        ) : isDoc ? (
          <DocumentPreview url={rawUrl} kind="doc" isMobile={isMobile} />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-zinc-300 text-xs">
            Sin vista previa
          </div>
        )}

        {isMobile ? (
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/55" />
        ) : (
          <motion.div
            className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent"
            variants={{
              rest: { opacity: 0.72 },
              hover: { opacity: 0.92, transition: { duration: 0.25 } },
            }}
          />
        )}

        <div className="absolute inset-x-0 bottom-0 px-4 pb-4 md:px-5 md:pb-5 pointer-events-none">
          <div className="pointer-events-auto text-left">
            <p className="text-white text-lg md:text-xl font-semibold tracking-tight drop-shadow-lg line-clamp-2">
              {name}
            </p>

            <div className="mt-3 flex items-center justify-start gap-3 flex-wrap md:opacity-0 md:translate-y-2 md:group-hover:opacity-100 md:group-hover:translate-y-0 transition-all duration-300">
              <Link
                href={`/videos/${item.id}`}
                prefetch={false}
                aria-label={`Ver más sobre ${name}`}
              >
                <motion.button
                  whileHover={{ scale: 1.07 }}
                  whileTap={{ scale: 0.96 }}
                  className="text-xs px-3.5 py-1.5 rounded-md border border-orange-400/80 bg-black/35 backdrop-blur-sm text-orange-300 hover:bg-orange-500 hover:text-black transition"
                >
                  Ver más
                </motion.button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function CardItemOverlay({ item }: { item: UploadItem }) {
  const isMobile = useIsMobile();

  const rawUrl = item.url || item.file_path || "";
  const name = stripExt(
    item.display_name ||
    item.titulo ||
    item.file_name ||
    rawUrl
  );
  const previewUrl = proxiedUrl(rawUrl);

  const typeSource = `${item.file_name || ""} ${item.file_path || ""} ${item.url || ""}`;

  const ext = getExt(item);

  const isVideo = item.tipo === "video" || ["mp4", "webm", "mov", "m4v"].includes(ext);
  const isPdf = ext === "pdf";
  const isDocx = ext === "docx";
  const isDoc = ext === "doc";

  return (
    <motion.article className="group h-full flex flex-col rounded-2xl border border-zinc-800/80 bg-zinc-900 overflow-hidden shadow-sm">
      <div className="relative h-[52vh] sm:h-[54vh] md:h-[20rem] lg:h-[26rem] xl:h-[28rem] bg-zinc-800 overflow-hidden">
        {isVideo ? (
          <VideoStaticPreview src={previewUrl} poster={item.thumbnail_url} />
        ) : isPdf ? (
          <DocumentPreview url={rawUrl} kind="pdf" isMobile={isMobile} />
        ) : isDocx ? (
          <DocumentPreview url={rawUrl} kind="docx" isMobile={isMobile} />
        ) : isDoc ? (
          <DocumentPreview url={rawUrl} kind="doc" isMobile={isMobile} />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-zinc-300 text-xs">
            Sin vista previa
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/50" />

        <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pointer-events-none">
          <div className="pointer-events-auto text-left">
            <p className="text-white text-lg md:text-xl font-bold drop-shadow line-clamp-2">
              {name}
            </p>

            <div className="mt-3 flex items-center justify-start gap-3 flex-wrap">
              <Link
                href={`/videos/${item.id}`}
                prefetch={false}
                aria-label={`Ver más sobre ${name}`}
              >
                <motion.button className="text-sm px-4 py-2 rounded border text-orange-400 hover:text-orange-500 border-orange-400 hover:border-orange-500 transition">
                  Ver más
                </motion.button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function CategoryCarousel({ items }: { items: UploadItem[] }) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);

  const [hoveredCard, setHoveredCard] = useState<{
    item: UploadItem;
    left: number;
    top: number;
    width: number;
  } | null>(null);

  const scrollByAmount = (dir: "left" | "right") => {
    const el = rowRef.current;
    if (!el) return;

    setHoveredCard(null);

    const amount = Math.floor(el.clientWidth * 0.85);

    el.scrollBy({
      left: dir === "right" ? amount : -amount,
      behavior: "smooth",
    });
  };

  const showHoveredCard = (
    item: UploadItem,
    element: HTMLDivElement
  ) => {
    const section = sectionRef.current;
    if (!section) return;

    const cardRect = element.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();

    setHoveredCard({
      item,
      left: cardRect.left - sectionRect.left,
      top: cardRect.top - sectionRect.top,
      width: cardRect.width,
    });
  };

  if (!items.length) return null;

  return (
    <section
      ref={sectionRef}
      className="relative group overflow-visible px-10 md:px-16 pt-8 pb-8"
      onMouseLeave={() => setHoveredCard(null)}
    >
      <button
        type="button"
        onClick={() => scrollByAmount("left")}
        aria-label="Anterior"
        className="hidden md:grid absolute left-0 top-1/2 -translate-y-1/2 z-30 h-14 w-10 place-items-center text-white/85 text-5xl font-light hover:text-white transition"
      >
        ‹
      </button>

      <div
        ref={rowRef}
        className="overflow-x-auto scroll-smooth"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        <div className="flex gap-6 md:gap-8 py-8">
          {items.map((u) => (
            <div
              key={u.id}
              onMouseEnter={(event) =>
                showHoveredCard(u, event.currentTarget)
              }
              className={[
                "relative shrink-0 w-[78vw] sm:w-[300px] md:w-[320px] lg:w-[350px] xl:w-[370px]",
                hoveredCard?.item.id === u.id
                  ? "md:opacity-0"
                  : "",
              ].join(" ")}
            >
              <CardItem item={u} />
            </div>
          ))}
        </div>
      </div>

      {hoveredCard && (
        <div
          className="
            pointer-events-auto
            absolute
            z-50
            hidden
            origin-center
            md:block
            transition-all
            duration-300
            ease-out
            -translate-y-4
            scale-[1.55]
          "
          style={{
            left: hoveredCard.left,
            top: hoveredCard.top,
            width: hoveredCard.width,
          }}
          onMouseLeave={() => setHoveredCard(null)}
        >
          <CardItem item={hoveredCard.item} />
        </div>
      )}

      <button
        type="button"
        onClick={() => scrollByAmount("right")}
        aria-label="Siguiente"
        className="hidden md:grid absolute right-0 top-1/2 -translate-y-1/2 z-30 h-14 w-10 place-items-center text-white/85 text-5xl font-light hover:text-white transition"
      >
        ›
      </button>
    </section>
  );
}