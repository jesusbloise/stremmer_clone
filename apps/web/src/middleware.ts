

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Host canónico configurable mediante CANONICAL_HOST.
 * Debe corresponder al dominio o URL de Cloud Run
 * configurado para esta instalación.
 */
const CANONICAL_HOST = process.env.CANONICAL_HOST?.trim().toLowerCase() || "";

/**
 * ⚠️ Middleware corre en Edge. No uses 'jsonwebtoken' aquí.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // =========================
  // 1) ✅ Forzar host canónico
  // =========================
  const host = (req.headers.get("host") || "").toLowerCase();

  // Si entra por a.run.app u otro host, lo mandamos al canónico
const isLocalHost =
  host.startsWith("localhost:") ||
  host.startsWith("127.0.0.1:") ||
  host.startsWith("192.168.");

if (CANONICAL_HOST && host && host !== CANONICAL_HOST && !isLocalHost) {
  const url = req.nextUrl.clone();
  url.host = CANONICAL_HOST;
  url.protocol = "https:";
  return NextResponse.redirect(url, 307);
}
  

  // =========================
  // 2) Tu lógica actual
  // =========================

  // Rutas públicas (sin protección)
  const isPublic =
  pathname.startsWith("/login") ||
  pathname.startsWith("/register") ||
  pathname.startsWith("/auth/google-complete") ||
  pathname.startsWith("/api/login") ||
  pathname.startsWith("/api/register") ||
  pathname.startsWith("/api/auth") ||
  pathname.startsWith("/api/auth/") ||

  // página pública de detalle
(
  pathname.startsWith("/videos/") &&
  req.nextUrl.searchParams.has("share")
) ||

  // APIs mínimas para que el detalle funcione sin login
  pathname.startsWith("/api/uploads/") ||
  pathname.startsWith("/api/subtitulos/") ||
  pathname.startsWith("/api/views/") ||
  pathname.startsWith("/api/r2/proxy") ||
  pathname.startsWith("/api/shared-showcase") ||

  pathname.startsWith("/_next") ||
  pathname.startsWith("/favicon") ||
  pathname === "/robots.txt" ||
  pathname === "/sitemap.xml";


  if (isPublic) return NextResponse.next();

  // Cookies que cuentan como "logueado":
const hasCustomAuth =
  !!req.cookies.get("auth")?.value;

if (hasCustomAuth) {
  return NextResponse.next();
}

  // Si no está autenticado, redirige a /login
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("redirect", pathname + search);
  return NextResponse.redirect(url);
}

// ✅ Excluye assets estáticos
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico)$).*)",
  ],
};

