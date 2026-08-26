"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  ShieldCheck,
  LockKeyhole,
  CheckCheck,
} from "lucide-react";

import AppShell from "@/components/layout/AppShell";
import Navbar from "@/components/layout/Navbar";
import Sidebar from "@/components/layout/Sidebar";
import Footer from "@/components/layout/Footer";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  upload_id?: string | null;
  action_url?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  read_at?: string | null;
  banner_dismissed_at?: string | null;
  resolved_at?: string | null;
};

type NotificationsResponse = {
  unread: number;
  total: number;
  notifications: NotificationItem[];
};

export default function NotificationsPage() {
  const [notifications, setNotifications] =
    useState<NotificationItem[]>([]);

  const [unread, setUnread] = useState(0);

  const [loading, setLoading] = useState(true);

  const [error, setError] =
    useState<string | null>(null);

  async function loadNotifications() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        "/api/notifications",
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error(
          "No se pudieron cargar las notificaciones"
        );
      }

      const data: NotificationsResponse =
        await response.json();

      setNotifications(
        Array.isArray(data.notifications)
          ? data.notifications
          : []
      );

      setUnread(
        Number(data.unread || 0)
      );
    } catch (error: any) {
      setError(
        error?.message ||
          "Error cargando notificaciones"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();
  }, []);

  async function markAsRead(id: string) {
    try {
      await fetch(
        `/api/notifications/${id}/read`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      await loadNotifications();
    } catch (error) {
      console.error(
        "Error marcando notificación:",
        error
      );
    }
  }

  function getIcon(type: string) {
    if (type === "TWO_FACTOR_PENDING") {
      return ShieldCheck;
    }

    if (
      type ===
      "RESTRICTED_UPLOAD_SHARED"
    ) {
      return LockKeyhole;
    }

    return Bell;
  }

  return (
    <AppShell
      header={<Navbar />}
      sidebar={<Sidebar />}
      footer={<Footer />}
    >
      <div className="w-full px-6 py-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-7 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">
                Notificaciones
              </h1>

              <p className="mt-1 text-sm text-zinc-400">
                Revisa tus avisos, accesos y
                recomendaciones de seguridad.
              </p>
            </div>

            {unread > 0 && (
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-sm text-orange-200">
                <Bell className="h-4 w-4" />

                {unread === 1
                  ? "1 nueva"
                  : `${unread} nuevas`}
              </div>
            )}
          </div>

          {loading ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-6 py-12 text-center text-sm text-zinc-400">
              Cargando notificaciones...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-200">
              {error}
            </div>
          ) : notifications.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-6 py-14 text-center">
              <CheckCheck className="mx-auto mb-3 h-9 w-9 text-emerald-400" />

              <p className="font-semibold text-white">
                Todo al día
              </p>

              <p className="mt-1 text-sm text-zinc-400">
                No tienes notificaciones
                pendientes.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((item) => {
                const unreadItem =
                  !item.read_at;

                  const displayMessage =
  item.type === "RESTRICTED_UPLOAD_SHARED"
    ? `${item.metadata?.fileName || item.message} fue compartido contigo de forma restringida.`
    : item.message;
    
                const Icon =
                  getIcon(item.type);

                const content = (
                  <div
                    className={[
                      "flex items-start gap-4 rounded-2xl border p-4 transition",
                      unreadItem
                        ? "border-orange-500/20 bg-orange-500/[0.05]"
                        : "border-zinc-800 bg-zinc-900/70",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                        item.type ===
                        "TWO_FACTOR_PENDING"
                          ? "bg-amber-500/10 text-amber-300"
                          : item.type ===
                            "RESTRICTED_UPLOAD_SHARED"
                          ? "bg-orange-500/10 text-orange-300"
                          : "bg-zinc-800 text-zinc-300",
                      ].join(" ")}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <h2
                          className={[
                            "flex-1 text-sm",
                            unreadItem
                              ? "font-semibold text-white"
                              : "font-medium text-zinc-300",
                          ].join(" ")}
                        >
                          {item.title}
                        </h2>

                        {unreadItem && (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-400" />
                        )}
                      </div>

                      <p className="mt-1 text-sm leading-6 text-zinc-400">
                        {displayMessage}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        {item.action_url && (
                          <Link
                            href={
                              item.action_url
                            }
                            onClick={() => {
                              if (unreadItem) {
                                markAsRead(
                                  item.id
                                );
                              }
                            }}
                            className="text-sm font-medium text-orange-300 hover:text-orange-200"
                          >
                            Ver detalle
                          </Link>
                        )}

                        {unreadItem && (
                          <button
                            type="button"
                            onClick={() =>
                              markAsRead(
                                item.id
                              )
                            }
                            className="text-xs text-zinc-500 hover:text-zinc-300"
                          >
                            Marcar como leída
                          </button>
                        )}

                        <span className="text-xs text-zinc-600">
                          {new Date(
                            item.created_at
                          ).toLocaleString(
                            "es-CL"
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                );

                return (
                  <div key={item.id}>
                    {content}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}