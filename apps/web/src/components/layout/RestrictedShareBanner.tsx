"use client";

import Link from "next/link";
import {
  LockKeyhole,
  ChevronRight,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  upload_id?: string | null;
  action_url?: string | null;
  metadata?: {
    fileName?: string;
    [key: string]: unknown;
  } | null;
  banner_dismissed_at?: string | null;
};

type NotificationsResponse = {
  notifications: NotificationItem[];
};

export default function RestrictedShareBanner() {
  const [notifications, setNotifications] =
    useState<NotificationItem[]>([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const response = await fetch(
          "/api/notifications",
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          }
        );

        if (!response.ok) {
          return;
        }

        const data: NotificationsResponse =
          await response.json();

        const restricted =
          Array.isArray(data.notifications)
            ? data.notifications.filter(
                (item) =>
                  item.type ===
                    "RESTRICTED_UPLOAD_SHARED" &&
                  !item.banner_dismissed_at
              )
            : [];

        if (alive) {
          setNotifications(restricted);
        }
      } catch (error) {
        console.error(
          "Error cargando avisos de archivos compartidos:",
          error
        );
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      alive = false;
    };
  }, []);

  if (
    loading ||
    notifications.length === 0
  ) {
    return null;
  }

  const notification =
    notifications[0];

  const total =
    notifications.length;

  const fileName =
    notification.metadata?.fileName ||
    notification.message ||
    "un archivo";

  async function dismissBanner() {
    try {
      const response = await fetch(
        `/api/notifications/${notification.id}/dismiss`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error(
          "No se pudo cerrar el aviso"
        );
      }

      setNotifications((current) =>
        current.filter(
          (item) =>
            item.id !== notification.id
        )
      );
    } catch (error) {
      console.error(
        "Error ocultando aviso:",
        error
      );
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-orange-400/30 bg-orange-400/10 shadow-lg shadow-orange-950/10">
      <button
        type="button"
        onClick={dismissBanner}
        aria-label="Cerrar aviso"
        title="Cerrar aviso"
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-orange-100/60 transition hover:bg-black/20 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex flex-col gap-3 px-4 py-3 pr-12">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-400/15">
            <LockKeyhole className="h-5 w-5 text-orange-300" />
          </div>

          <div className="min-w-0">
            <p className="font-semibold text-orange-100">
              Archivo compartido contigo
            </p>

            <p className="mt-1 text-sm text-orange-100/75">
              {total === 1 ? (
                <>
                  Tienes acceso restringido a{" "}
                  <span className="font-semibold text-orange-100">
                    {fileName}
                  </span>
                  .
                </>
              ) : (
                <>
                  Tienes{" "}
                  <span className="font-semibold text-orange-100">
                    {total} archivos
                  </span>{" "}
                  restringidos nuevos compartidos contigo.
                </>
              )}
            </p>
          </div>
        </div>

        <Link
          href={
            notification.action_url ||
            (notification.upload_id
              ? `/videos/${notification.upload_id}`
              : "/notificaciones")
          }
          className="mt-1 inline-flex w-fit items-center justify-center gap-2 rounded-lg bg-orange-300 px-3 py-2 text-xs font-semibold text-black transition hover:bg-orange-200"
        >
          {total === 1
            ? "Ver archivo"
            : "Revisar"}

          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}