"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Filter,
  ChevronDown,
  Bell,
  ShieldCheck,
  LockKeyhole,
} from "lucide-react";
import { navEmitFilter, navEmitSearch, navEmitToggleSelect } from "./navBus";
import type { FilterKey } from "@/components/UploadVideo/types";

type Me =
  | null
  | {
      id?: string; // ← necesitamos el id para pedir el perfil
      name: string;
      role: "ADMIN" | "PROFESOR" | "ESTUDIANTE";
      email?: string | null;
      avatarUrl?: string | null; // pudiera venir, pero preferimos profiles.avatar_url
    };
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
const tabs = [
  { id: "ultimos", label: "Últimos agregados" },
  { id: "mas-vistos", label: "Más vistos" },
];

/** Normaliza: quita espacios extremos, pasa a minúsculas y elimina acentos/diacríticos */
const DIAC = /[\u0300-\u036f]/g;
function normalizeQuery(s: string) {
  return s.normalize("NFD").replace(DIAC, "").toLowerCase().trim();
}

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // qVisible: lo que escribe el usuario (con mayúsculas/acentos)
  // qNorm: versión normalizada, la que usamos para buscar y poner en la URL
  const [qVisible, setQVisible] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  const [session, setSession] = useState<Me>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>("/next.svg"); // ← avatar real mostrado
  const [notificationsOpen, setNotificationsOpen] =
  useState(false);

const [notifications, setNotifications] =
  useState<NotificationItem[]>([]);

const [notificationsUnread, setNotificationsUnread] =
  useState(0);

const [notificationsLoading, setNotificationsLoading] =
  useState(false);
  const isStudent = session?.role === "ESTUDIANTE";

  // cargar sesión + avatar de profiles (preferido)
  async function loadSessionAndAvatar() {
    try {
      const r = await fetch("/api/me", { cache: "no-store" });
      const s = await r.json();
      setSession(s ?? null);

      // Fallback provisional
      let fallback =
        s?.avatarUrl ??
        (s?.email || s?.name
          ? `https://i.pravatar.cc/64?u=${encodeURIComponent(s.email ?? s.name)}`
          : "/next.svg");

      if (s?.id) {
        const det = await fetch(`/api/perfiles/${s.id}`, { cache: "no-store" }).then(res => (res.ok ? res.json() : null));
        const raw = det?.avatar_url || fallback;
        const withBust = raw ? `${raw}${raw.includes("?") ? "&" : "?"}v=${Date.now()}` : "/next.svg";
        setAvatarUrl(withBust);
      } else {
        setAvatarUrl(fallback);
      }
    } catch {
      setSession(null);
      setAvatarUrl("/next.svg");
    }
  }
async function loadNotifications() {
  try {
    setNotificationsLoading(true);

    const response = await fetch("/api/notifications", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) {
      return;
    }

    const data: NotificationsResponse =
      await response.json();

    setNotifications(
      Array.isArray(data.notifications)
        ? data.notifications
        : []
    );

    setNotificationsUnread(
      Number(data.unread || 0)
    );
  } catch (error) {
    console.error(
      "Error cargando notificaciones:",
      error
    );
  } finally {
    setNotificationsLoading(false);
  }
}
  // Carga inicial
useEffect(() => {
  loadSessionAndAvatar();
  loadNotifications();
}, []);

  // Refrescar al volver a la pestaña / foco (por si se cambió el avatar en otra vista)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") loadSessionAndAvatar();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  // (Opcional) Escucha evento disparado desde la página de perfil al guardar
  // window.dispatchEvent(new CustomEvent('profile:avatar-changed', { detail: urlFinal }))
useEffect(() => {
  const onChanged = (e: any) => {
    const detail = e?.detail || {};

    if (detail.name) {
      setSession((prev) =>
        prev ? { ...prev, name: String(detail.name) } : prev
      );
    }

    if (detail.avatarUrl) {
      const raw = String(detail.avatarUrl);
      const withBust = `${raw}${raw.includes("?") ? "&" : "?"}v=${Date.now()}`;
      setAvatarUrl(withBust);
    }
  };

  window.addEventListener("profile:updated" as any, onChanged);
  window.addEventListener("profile:avatar-changed" as any, onChanged);

  return () => {
    window.removeEventListener("profile:updated" as any, onChanged);
    window.removeEventListener("profile:avatar-changed" as any, onChanged);
  };
}, []);

  // si estamos en /explorar, toma q de la URL (ya normalizada) y aplica filtro también
  useEffect(() => {
    if (pathname !== "/explorar") return;
    const urlQ = searchParams.get("q") ?? "";
    setQVisible(urlQ);

    const f = (searchParams.get("filter") || "") as FilterKey | "";
    if (f === "con_subtitulos" || f === "sin_subtitulos" || f === "hoy" || f === "") {
      navEmitFilter((f || null) as FilterKey);
    }
  }, [pathname, searchParams]);

  // debounce SOLO en /explorar, emitiendo SIEMPRE la query normalizada
  const qNorm = useMemo(() => normalizeQuery(qVisible), [qVisible]);
  useEffect(() => {
    if (pathname !== "/explorar") return;
    const t = setTimeout(() => navEmitSearch(qNorm), 280);
    return () => clearTimeout(t);
  }, [qNorm, pathname]);

  // submit global: si no estamos en /explorar ⇒ navegar allí con q normalizada
  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const termNorm = qNorm;
    if (!termNorm && pathname !== "/explorar") return;

    if (pathname !== "/explorar") {
      const p = new URLSearchParams();
      if (termNorm) p.set("q", termNorm); // guardamos normalizada
      router.push(`/explorar?${p.toString()}`);
    } else {
      navEmitSearch(termNorm);
      const p = new URLSearchParams(searchParams.toString());
      if (termNorm) p.set("q", termNorm);
      else p.delete("q");
      router.replace(`/explorar?${p.toString()}`);
    }
  }

  const applyFilter = (key: FilterKey) => {
    if (pathname !== "/explorar") {
      const p = new URLSearchParams();
      const termNorm = qNorm;
      if (termNorm) p.set("q", termNorm);
      if (key) p.set("filter", key);
      router.push(`/explorar?${p.toString()}`);
    } else {
      navEmitFilter(key);
      const p = new URLSearchParams(searchParams.toString());
      if (key) p.set("filter", key);
      else p.delete("filter");
      router.replace(`/explorar?${p.toString()}`);
    }
    setMenuOpen(false);
  };

  // --- Avatar dropdown: close on outside / esc
  const avatarRef =
  useRef<HTMLDivElement | null>(null);

const notificationsRef =
  useRef<HTMLDivElement | null>(null);
  useEffect(() => {
  const onDocClick = (e: MouseEvent) => {
  const target = e.target as Node;

  if (
    avatarRef.current &&
    !avatarRef.current.contains(target)
  ) {
    setAvatarOpen(false);
  }

  if (
    notificationsRef.current &&
    !notificationsRef.current.contains(target)
  ) {
    setNotificationsOpen(false);
  }
};
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAvatarOpen(false);
        setMenuOpen(false);
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-black/80 backdrop-blur">
      <div className="w-full max-w-[1600px] mx-auto flex flex-wrap items-center gap-3 px-3 md:px-6 py-2.5">
        {/* Logo */}
       {/* Logo */}
<Link
  href="/organizar"
  className="order-1 flex h-16 shrink-0 items-center overflow-visible"
>
  <Image
    src="/Logo_Stock_Library@2x.png"
    alt="ATOMICA"
    width={560}
    height={112}
    className="h-14 w-auto object-contain md:h-16"
    priority
  />
</Link>

        {/* Tabs */}
        <div className="order-3 sm:order-2 flex items-center gap-2 ml-3 overflow-x-auto whitespace-nowrap">
          {tabs.map((t) => (
  <button
    key={t.id}
    onClick={() => {
      const p = new URLSearchParams(searchParams.toString());
      p.set("tab", t.id);
      router.push(`/explorar?${p.toString()}`);
    }}
    className={`px-3 py-1.5 rounded-md border text-xs ${
      searchParams.get("tab") === t.id
        ? "border-orange-500 text-orange-400 bg-zinc-800/60"
        : "border-zinc-700 text-zinc-200 hover:bg-zinc-800/60"
    }`}
  >
    {t.label}
  </button>
))}
        </div>

        {/* Buscador */}
        <div className="order-4 sm:order-3 w-full sm:w-auto sm:flex-1 sm:min-w-[240px] sm:mx-2">
          <form className="relative" onSubmit={submitSearch}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              value={qVisible}
              onChange={(e) => setQVisible(e.target.value)}
              placeholder="Buscar archivos (insensible a mayúsculas y acentos)"
              className="w-full rounded-md bg-zinc-900/70 border border-zinc-700 pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
          </form>
        </div>

        {/* Acciones */}
        <div className="order-3 sm:order-4 ml-auto flex items-center gap-2">
          {/* Filtros */}
          <div className="relative">
            <button
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-zinc-700 text-sm text-zinc-200 hover:bg-zinc-800/60"
              onClick={() => {
                setMenuOpen((v) => !v);
                setAvatarOpen(false);
              }}
            >
              <Filter className="h-4 w-4" />
              Filtros
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-md border border-zinc-700 bg-zinc-900 shadow-lg z-50">
                <button
                  onClick={() => applyFilter("con_subtitulos")}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-zinc-800"
                >
                  Con subtítulos
                </button>
                <button
                  onClick={() => applyFilter("sin_subtitulos")}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-zinc-800"
                >
                  Sin subtítulos
                </button>
                <button
                  onClick={() => applyFilter("hoy")}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-zinc-800"
                >
                  Subidos hoy
                </button>
                <button
                  onClick={() => applyFilter(null)}
                  className="block w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-zinc-800"
                >
                  Resetear filtros
                </button>
              </div>
            )}
          </div>

          {/* Seleccionar (oculto a estudiante) */}
          {!isStudent && session && (
            <button
              onClick={() => navEmitToggleSelect()}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-zinc-700 text-sm text-zinc-200 hover:bg-zinc-800/60"
              aria-label="Seleccionar"
              title="Seleccionar"
            >
              Seleccionar
            </button>
          )}

          {/* Auth */}
          {!session && (
            <div className="hidden sm:flex items-center gap-2">
              <Link
                href="/login"
                className="px-3 py-1.5 rounded-md border border-zinc-700 text-sm text-zinc-200 hover:bg-zinc-800/60"
              >
                Entrar
              </Link>
             
            </div>
          )}

{/* Notificaciones */}
{session && (
  <div
    className="relative"
    ref={notificationsRef}
  >
    <button
      type="button"
      onClick={() => {
        setNotificationsOpen((value) => !value);
        setAvatarOpen(false);
        setMenuOpen(false);

        if (!notificationsOpen) {
          loadNotifications();
        }
      }}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-md text-zinc-300 transition hover:bg-zinc-800/60 hover:text-white"
      aria-label="Notificaciones"
      title="Notificaciones"
      aria-haspopup="menu"
      aria-expanded={notificationsOpen}
    >
      <Bell className="h-5 w-5" />

      {notificationsUnread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex min-w-4 h-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold leading-none text-white">
          {notificationsUnread > 9
            ? "9+"
            : notificationsUnread}
        </span>
      )}
    </button>

    {notificationsOpen && (
      <div className="absolute right-0 z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-white">
              Notificaciones
            </p>

            <p className="text-xs text-zinc-400">
              {notificationsUnread === 0
                ? "No tienes notificaciones nuevas"
                : notificationsUnread === 1
                ? "Tienes 1 notificación nueva"
                : `Tienes ${notificationsUnread} notificaciones nuevas`}
            </p>
          </div>

          <Bell className="h-4 w-4 text-zinc-500" />
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {notificationsLoading ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-400">
              Cargando notificaciones...
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Bell className="mx-auto mb-2 h-6 w-6 text-zinc-600" />

              <p className="text-sm text-zinc-400">
                No tienes notificaciones pendientes.
              </p>
            </div>
          ) : (
            notifications.slice(0, 8).map((item) => {
              const unread = !item.read_at;

              const Icon =
                item.type === "TWO_FACTOR_PENDING"
                  ? ShieldCheck
                  : item.type ===
                    "RESTRICTED_UPLOAD_SHARED"
                  ? LockKeyhole
                  : Bell;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={async () => {
                    try {
                      if (unread) {
                        await fetch(
                          `/api/notifications/${item.id}/read`,
                          {
                            method: "POST",
                            credentials: "include",
                          }
                        );
                      }

                      setNotificationsOpen(false);

                      if (item.action_url) {
                        router.push(item.action_url);
                      }

                      loadNotifications();
                    } catch (error) {
                      console.error(
                        "Error abriendo notificación:",
                        error
                      );
                    }
                  }}
                  className={[
                    "flex w-full items-start gap-3 border-b border-zinc-800/80 px-4 py-3 text-left transition hover:bg-zinc-800/70",
                    unread
                      ? "bg-orange-500/[0.04]"
                      : "",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      item.type ===
                      "TWO_FACTOR_PENDING"
                        ? "bg-amber-500/10 text-amber-300"
                        : item.type ===
                          "RESTRICTED_UPLOAD_SHARED"
                        ? "bg-orange-500/10 text-orange-300"
                        : "bg-zinc-800 text-zinc-300",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <p
                        className={[
                          "min-w-0 flex-1 truncate text-sm",
                          unread
                            ? "font-semibold text-white"
                            : "font-medium text-zinc-300",
                        ].join(" ")}
                      >
                        {item.title}
                      </p>

                      {unread && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-400" />
                      )}
                    </div>

                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">
                      {item.message}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <Link
          href="/notificaciones"
          onClick={() =>
            setNotificationsOpen(false)
          }
          className="block border-t border-zinc-800 px-4 py-3 text-center text-sm font-medium text-orange-300 transition hover:bg-zinc-800/60 hover:text-orange-200"
        >
          Ver todas las notificaciones
        </Link>
      </div>
    )}
  </div>
)}
          {/* Avatar */}
          {session && (
            <div className="relative" ref={avatarRef}>
              <button
                className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-zinc-800/60"
                onClick={() => {
                  setAvatarOpen((v) => !v);
                  setMenuOpen(false);
                  setNotificationsOpen(false);
                }}
                aria-haspopup="menu"
                aria-expanded={avatarOpen}
              >
                <img
                  src={avatarUrl}
                  alt={session?.name ?? "Usuario"}
                  className="h-8 w-8 rounded-full border border-zinc-700 object-cover"
                />
                <ChevronDown className="h-4 w-4 text-zinc-300" />
              </button>

              {avatarOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 rounded-md border border-zinc-700 bg-zinc-900 shadow-lg z-50 overflow-hidden"
                >
                  <div className="px-3 py-2 border-b border-zinc-800">
                    <p className="text-sm font-medium truncate">{session?.name}</p>
                    <p className="text-xs text-zinc-400">{session?.role}</p>
                  </div>
                  <Link
                    href="/perfil"
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-zinc-800"
                    role="menuitem"
                    onClick={() => setAvatarOpen(false)}
                  >
                    Perfil
                  </Link>
                  <button
                    role="menuitem"
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-zinc-800"
                    onClick={async () => {
  setAvatarOpen(false);

  window.sessionStorage.removeItem(
    "pending-uploads-banner-dismissed"
  );

  await fetch("/api/logout", { method: "POST" });
  location.reload();
}}
                  >
                    Salir
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

