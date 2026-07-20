import { NextRequest, NextResponse } from "next/server";
import { isAuthEnabled } from "@/lib/auth-config";

/**
 * Гостевой доступ: неавторизованный пользователь может открывать сайт,
 * переходить по разделам, смотреть карточки концепций и изучать интерфейс.
 * Авторизация требуется только для административных страниц.
 */
const PUBLIC_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/verify-email",
  "/api/auth",
  "/api/me",
  "/uploads",
  "/catalog-handoff",
  "/midocean-img",
  "/api/catalog-image",
  "/api/backend/catalog-external-image",
];

const PROTECTED_PREFIXES = ["/admin"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => cookie.name.includes("session_token"));
}

export default function middleware(request: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (isProtectedPath(pathname) && !hasSessionCookie(request)) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
