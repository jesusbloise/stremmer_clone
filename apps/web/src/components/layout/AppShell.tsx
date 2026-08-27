"use client";

import {
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import {
  usePathname,
  useSearchParams,
} from "next/navigation";
import SidebarDrawer from "./SidebarDrawer";
import Sidebar, {
  SidebarContent,
} from "./Sidebar";
import PendingUploadsBanner from "./PendingUploadsBanner";

 import RestrictedShareBanner from "./RestrictedShareBanner";

type Props = {
  header?: React.ReactNode;
  sidebar?: React.ReactNode;
  footer?: React.ReactNode;
  containerClassName?: string;
  children: React.ReactNode;
};

export default function AppShell({
  header,
  sidebar,
  footer,
  containerClassName,
  children,
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [drawerOpen, setDrawerOpen] =
    useState(false);

  const [
    desktopSidebarOpen,
    setDesktopSidebarOpen,
  ] = useState(false);

  const [
    registrationNoticeOpen,
    setRegistrationNoticeOpen,
  ] = useState(false);

  const shareToken =
    searchParams.get("share")?.trim() || "";

  const isSharedView =
    pathname.startsWith("/videos/") &&
    Boolean(shareToken);

  const showRegistrationNotice = () => {
    setRegistrationNoticeOpen(true);
  };

  const handleSharedClickCapture = (
    event: MouseEvent<HTMLDivElement>
  ) => {
    if (!isSharedView) {
      return;
    }

    const target =
      event.target as HTMLElement | null;

    if (!target) {
      return;
    }

    /*
     * Los controles nativos del video y el iframe de
     * Cloudflare Stream no son enlaces ni botones del
     * documento, por lo que siguen funcionando.
     */
    const interactiveElement =
      target.closest(
        "a, button"
      ) as HTMLElement | null;

    if (!interactiveElement) {
      return;
    }

    /*
     * Permite elementos internos autorizados,
     * como cerrar el mensaje informativo.
     */
    if (
      interactiveElement.closest(
        '[data-shared-allow="true"]'
      )
    ) {
      return;
    }

    /*
     * Permite navegar únicamente entre los videos
     * autorizados del Showcase, conservando el mismo
     * token compartido y el archivo de origen.
     */
    if (
      interactiveElement instanceof
      HTMLAnchorElement
    ) {
      const rawHref =
        interactiveElement.getAttribute(
          "href"
        );

      if (rawHref) {
        try {
          const targetUrl = new URL(
            rawHref,
            window.location.origin
          );

          const targetShare =
            targetUrl.searchParams
              .get("share")
              ?.trim() || "";

          const targetSource =
            targetUrl.searchParams
              .get("source")
              ?.trim() || "";

          const isShowcaseVideoLink =
            targetUrl.origin ===
              window.location.origin &&
            targetUrl.pathname.startsWith(
              "/videos/"
            ) &&
            Boolean(targetSource) &&
            targetShare === shareToken;

          if (isShowcaseVideoLink) {
            return;
          }
        } catch {
          /*
           * Si el enlace es inválido,
           * se bloquea más abajo.
           */
        }
      }
    }

    event.preventDefault();
    event.stopPropagation();

    showRegistrationNotice();
  };

  const handleSharedSubmitCapture = (
    event: FormEvent<HTMLDivElement>
  ) => {
    if (!isSharedView) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    showRegistrationNotice();
  };

  return (
    <div
      className="min-h-dvh overflow-x-hidden bg-black text-white"
      onClickCapture={
        handleSharedClickCapture
      }
      onSubmitCapture={
        handleSharedSubmitCapture
      }
    >
      {header}

      {sidebar ?? (
        <Sidebar
          open={desktopSidebarOpen}
          onOpenChange={
            setDesktopSidebarOpen
          }
        />
      )}

      <div
        className={`
          w-full
          transition-[padding] duration-300 ease-out
          ${
            desktopSidebarOpen && !sidebar
              ? "lg:pl-[296px]"
              : "lg:pl-0"
          }
        `}
      >
        <div
          className={`
            mx-auto w-full max-w-[1600px]
            px-3 pt-2
            transition-all duration-300 ease-out
            md:px-4 md:pt-3
            ${containerClassName ?? ""}
          `}
        >
       <main className="relative">
  <div className="pointer-events-none fixed right-4 top-[88px] z-[120] flex w-[min(430px,calc(100vw-2rem))] flex-col gap-3 md:right-6">
    <div className="pointer-events-auto">
      <RestrictedShareBanner />
    </div>

    <div className="pointer-events-auto">
      <PendingUploadsBanner />
    </div>
  </div>

  {children}
</main>
        </div>
      </div>

      <SidebarDrawer
        open={drawerOpen}
        onClose={() =>
          setDrawerOpen(false)
        }
      >
        <SidebarContent
          onNavigate={() =>
            setDrawerOpen(false)
          }
        />
      </SidebarDrawer>

      {footer}

      {registrationNoticeOpen && (
        <div
          data-shared-allow="true"
          className="fixed inset-0 z-[200] grid place-items-center bg-black/75 px-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setRegistrationNoticeOpen(
                false
              );
            }
          }}
        >
          <section className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-950 p-6 shadow-2xl">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-orange-500/30 bg-orange-500/10 text-xl text-orange-300">
              🔒
            </div>

            <h2 className="mt-4 text-center text-xl font-bold text-white">
              Plataforma privada
            </h2>

            <p className="mt-3 text-center text-sm leading-6 text-zinc-400">
              Para navegar por la plataforma
              necesitas una cuenta autorizada por
              Atomica.
            </p>

            <p className="mt-2 text-center text-sm leading-6 text-zinc-400">
              Solicita tu registro al administrador
              para recibir un enlace privado de
              acceso.
            </p>

            <button
              data-shared-allow="true"
              type="button"
              onClick={() =>
                setRegistrationNoticeOpen(
                  false
                )
              }
              className="mt-6 w-full rounded-lg border border-orange-500 bg-orange-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-orange-400"
            >
              Entendido
            </button>
          </section>
        </div>
      )}
    </div>
  );
}