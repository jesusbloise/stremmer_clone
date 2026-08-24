"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { VideoInfo, FilterKey } from "./types";
import BulkActionsBar from "./BulkActionsBar";
import FileGrid from "./FileGrid";
import Pagination from "./Pagination";
import { navSubscribe } from "@/components/layout/navBus";

function normalizePlayableUrl(u?: string | null) {
  if (!u) return "";

  const s = String(u).trim();
  if (!s) return "";

  if (s.startsWith("/api/r2/proxy?url=")) {
    return s;
  }

  if (s.startsWith("r2://")) {
    return `/api/r2/proxy?url=${encodeURIComponent(s)}`;
  }

  if (
    s.startsWith("http://") ||
    s.startsWith("https://")
  ) {
    return s;
  }

  return s;
}

function mapAnyToVideoInfo(file: any, subtitulos: any[]): VideoInfo | null {
  if (!file?.id) return null;

  const subtituloTexto = Array.isArray(subtitulos)
    ? subtitulos
        .filter((s: any) => s.video_id === file.id)
        .map((s: any) => s.text)
        .join(" ")
        .toLowerCase()
    : undefined;

  const rawUrl: string =
    file.url ||
    file.r2_path ||
    file.file_path ||
    file.path ||
    (file.file_key ? `/api/files/${file.file_key}` : "");

  if (!rawUrl) return null;

  return {
    id: file.id,
    name:
      file.titulo ||
      file.ficha?.titulo ||
      file.display_name ||
      file.file_name ||
      file.name ||
      "sin_nombre",
    url: normalizePlayableUrl(rawUrl),
    thumbnail_url: file.thumbnail_url || null,
    subtituloTexto,
    mimeType: file.contentType || file.mimeType || file.type || undefined,
    sizeBytes: file.size || file.sizeBytes,
    created_at: file.created_at || file.uploaded_at,
    views: file.views || 0,
  } as VideoInfo;
}

export default function UploadVideo() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "ultimos";

  const [videos, setVideos] = useState<VideoInfo[]>([]);
  const [filtered, setFiltered] = useState<VideoInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const videosPerPage = 16;

  const applyLocalFilters = (baseItems: VideoInfo[], filter: FilterKey) => {
    let base = [...baseItems];

    if (filter === "con_subtitulos") {
      base = base.filter((v) => !!v.subtituloTexto);
    } else if (filter === "sin_subtitulos") {
      base = base.filter((v) => !v.subtituloTexto);
    } else if (filter === "hoy") {
      const hoy = new Date().toISOString().split("T")[0];
      base = base.filter((v) => v.created_at?.startsWith(hoy));
    }

    return base;
  };

  const loadVideos = async () => {
    try {
      const [videosRes, subtitulosRes] = await Promise.all([
        fetch("/api/videos?only=all", { cache: "no-store" }),
        fetch("/api/subtitulos-completos", { cache: "no-store" }),
      ]);

      const files = await videosRes.json();
      const subtitulos = await subtitulosRes.json();

      const arrFiles = Array.isArray(files) ? files : [];
      const arrSubs = Array.isArray(subtitulos) ? subtitulos : [];

      const formateados = arrFiles
        .map((f: any) => mapAnyToVideoInfo(f, arrSubs))
        .filter(Boolean) as VideoInfo[];

      setVideos(formateados);
      setFiltered(applyLocalFilters(formateados, activeFilter));
      setCurrentPage(1);
    } catch (e) {
      console.error("Error cargando videos:", e);
      setVideos([]);
      setFiltered([]);
    }
  };

  useEffect(() => {
    loadVideos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const debouncedSearch = useMemo(
    () => searchTerm.trim().toLowerCase(),
    [searchTerm]
  );

  useEffect(() => {
    const unsubscribe = navSubscribe({
      onSearch: (q) => setSearchTerm(q ?? ""),
      onFilter: (key) => {
        setActiveFilter(key);
        setFiltered(applyLocalFilters(videos, key));
        setCurrentPage(1);
      },
      onToggleSelect: () => {
        setSelectionMode((v) => {
          const next = !v;
          if (!next) setSelectedIds([]);
          return next;
        });
      },
    });

    return () => unsubscribe();
  }, [videos]);

  useEffect(() => {
    const run = async () => {
      if (!debouncedSearch) {
        setFiltered(applyLocalFilters(videos, activeFilter));
        setCurrentPage(1);
        return;
      }

      try {
        const res = await fetch(
          `/api/buscar?q=${encodeURIComponent(debouncedSearch)}`,
          { cache: "no-store" }
        );

        if (!res.ok) throw new Error("HTTP " + res.status);

        const data = await res.json();
        const resultados = Array.isArray(data?.results) ? data.results : [];

        let mapped = resultados
          .map((r: any) => mapAnyToVideoInfo(r, []))
          .filter(Boolean) as VideoInfo[];

        mapped = applyLocalFilters(mapped, activeFilter);

        setFiltered(mapped);
        setCurrentPage(1);
      } catch (e) {
        console.error("buscar falló:", e);
        setFiltered([]);
        setCurrentPage(1);
      }
    };

    run();
  }, [debouncedSearch, activeFilter, videos]);

  const sortedFiltered = useMemo(() => {
    const arr = [...filtered];

    if (activeTab === "mas-vistos") {
      return arr.sort((a: any, b: any) => {
        const av = Number(a.views || 0);
        const bv = Number(b.views || 0);
        return bv - av;
      });
    }

    return arr.sort((a, b) => {
      const ad = new Date(a.created_at || 0).getTime();
      const bd = new Date(b.created_at || 0).getTime();
      return bd - ad;
    });
  }, [filtered, activeTab]);

  const totalPages = Math.max(
    1,
    Math.ceil(sortedFiltered.length / videosPerPage)
  );

  const currentItems = sortedFiltered.slice(
    (currentPage - 1) * videosPerPage,
    currentPage * videosPerPage
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const clearSelection = () => setSelectedIds([]);

  const handleDeleted = (id: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== id));
    setFiltered((prev) => prev.filter((v) => v.id !== id));
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  };

  const handleBulkDeleted = (_n: number) => {
    const ids = new Set(selectedIds);

    setVideos((prev) => prev.filter((v) => !ids.has(v.id)));
    setFiltered((prev) => prev.filter((v) => !ids.has(v.id)));
    setSelectedIds([]);
    setSelectionMode(false);
    setCurrentPage(1);
  };

  return (
    <div className="text-white">
      <div className="w-full max-w-[1200px] mx-auto px-4 md:px-6 py-4">
        <h1 className="text-center text-3xl font-bold mb-3">
          {activeTab === "mas-vistos"
            ? "Archivos más vistos"
            : "Últimos archivos agregados"}
        </h1>

        <BulkActionsBar
          selectedIds={selectedIds}
          clearSelection={clearSelection}
          onBulkDeleted={handleBulkDeleted}
        />

        <div className="mt-4 mx-auto">
          <FileGrid
            items={currentItems}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onDeleted={handleDeleted}
            makeHref={(id) => {
              const q = searchTerm.trim();
              return q
                ? `/videos/${id}?q=${encodeURIComponent(q)}`
                : `/videos/${id}`;
            }}
          />
        </div>

        <div className="mt-6">
          <Pagination
            current={currentPage}
            total={totalPages}
            onChange={setCurrentPage}
          />
        </div>
      </div>
    </div>
  );
}
