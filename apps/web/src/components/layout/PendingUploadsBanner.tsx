"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Loader2,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

type PendingUploadsResponse = {
  total: number;
  summary: {
    incomplete: number;
    empty: number;
    withoutFicha: number;
  };
  uploads: Array<{
    id: string;
    fileName: string;
    uploadedAt: string;
    ficha: {
      status: "INCOMPLETE" | "EMPTY" | "WITHOUT_FICHA";
      completion: number;
      missingFields: string[];
    };
  }>;
};

const DISMISSED_STORAGE_KEY = "pending-uploads-banner-dismissed";

async function fetchPendingUploads(): Promise<PendingUploadsResponse> {
  const response = await fetch("/api/me/pendientes", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);

    throw new Error(
      data?.error || "No se pudieron consultar las fichas pendientes"
    );
  }

  return response.json();
}

export default function PendingUploadsBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [storageChecked, setStorageChecked] = useState(false);

  useEffect(() => {
    const wasDismissed =
      window.sessionStorage.getItem(DISMISSED_STORAGE_KEY) === "true";

    setDismissed(wasDismissed);
    setStorageChecked(true);
  }, []);

  const {
    data,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["me", "pendientes"],
    queryFn: fetchPendingUploads,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  function dismissBanner() {
    window.sessionStorage.setItem(DISMISSED_STORAGE_KEY, "true");
    setDismissed(true);
  }

  if (!storageChecked || dismissed) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="relative flex items-center gap-3 rounded-2xlborder border-white/10 bg-white/5 px-4 py-3 pr-12 text-sm text-white/60">
        <Loader2 className="h-4 w-4 animate-spin" />
        Revisando fichas pendientes...

        <button
          type="button"
          onClick={dismissBanner}
          aria-label="Cerrar aviso"
          title="Cerrar aviso"
          className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (isError || !data || data.total === 0) {
    return null;
  }

  const message =
    data.total === 1
      ? "Tienes 1 ficha técnica pendiente."
      : `Tienes ${data.total} fichas técnicas pendientes.`;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-400/30 bg-amber-400/10 shadow-lg shadow-amber-950/10">
      <button
        type="button"
        onClick={dismissBanner}
        aria-label="Cerrar aviso"
        title="Cerrar aviso"
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-amber-100/60 transition hover:bg-black/20 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex flex-col gap-3 px-4 py-3 pr-12">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/15">
            <AlertTriangle className="h-5 w-5 text-amber-300" />
          </div>

          <div className="min-w-0">
            <p className="font-semibold text-amber-100">
              Información pendiente
            </p>

            <p className="mt-1 text-sm text-amber-100/75">
              {message} Complétalas para mantener los archivos correctamente
              organizados.
            </p>
          </div>
        </div>

        <Link
          href="/mis-pendientes"
          className="mt-1 inline-flex w-fit items-center justify-center gap-2 rounded-lg bg-amber-300 px-3 py-2 text-xs font-semibold text-black transition hover:bg-amber-200"
        >
          Revisar pendientes
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}