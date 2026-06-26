import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

type UserRole = "regular" | "admin" | "super_admin";

type ProxySession = {
  user_id: string;
  nik_kerja: string;
  area_id: string | null;
  area_code: string | null;
  nama_lengkap: string;
  username: string;
  user_role: UserRole;
};

const PUBLIC_PAGE_PATHS = ["/login", "/freelance"];

const PUBLIC_API_PATHS = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/area",
  "/api/libur",
  "/api/freelance/shipments",
  "/api/health/db",
];

const ROLE_PAGE_PREFIX: Record<UserRole, string> = {
  regular: "/regular",
  admin: "/admin",
  super_admin: "/superadmin",
};

function getAuthCookieName(): string {
  return process.env.AUTH_COOKIE_NAME || "shipment_session";
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret === "CHANGE_ME") {
    throw new Error("JWT_SECRET belum valid");
  }

  return new TextEncoder().encode(secret);
}

function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGE_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/robots.txt") ||
    pathname.startsWith("/sitemap.xml") ||
    pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt)$/) !== null
  );
}

function getProtectedRole(pathname: string): UserRole | null {
  if (pathname === "/regular" || pathname.startsWith("/regular/")) {
    return "regular";
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return "admin";
  }

  if (pathname === "/superadmin" || pathname.startsWith("/superadmin/")) {
    return "super_admin";
  }

  if (pathname.startsWith("/api/regular/")) {
    return "regular";
  }

  if (pathname.startsWith("/api/admin/")) {
    return "admin";
  }

  if (pathname.startsWith("/api/superadmin/")) {
    return "super_admin";
  }

  return null;
}

function getDashboardPathByRole(role: UserRole): string {
  return ROLE_PAGE_PREFIX[role];
}

function unauthorizedResponse(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        ok: false,
        message: "Belum login",
      },
      {
        status: 401,
      },
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);

  return NextResponse.redirect(loginUrl);
}

function forbiddenResponse(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        ok: false,
        message: "Akses tidak diizinkan",
      },
      {
        status: 403,
      },
    );
  }

  return NextResponse.redirect(new URL("/", request.url));
}

async function readSession(request: NextRequest): Promise<ProxySession | null> {
  const token = request.cookies.get(getAuthCookieName())?.value;

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getJwtSecret());

    if (
      typeof payload.user_id !== "string" ||
      typeof payload.nik_kerja !== "string" ||
      typeof payload.nama_lengkap !== "string" ||
      typeof payload.username !== "string" ||
      typeof payload.user_role !== "string"
    ) {
      return null;
    }

    if (!["regular", "admin", "super_admin"].includes(payload.user_role)) {
      return null;
    }

    return {
      user_id: payload.user_id,
      nik_kerja: payload.nik_kerja,
      area_id: typeof payload.area_id === "string" ? payload.area_id : null,
      area_code: typeof payload.area_code === "string" ? payload.area_code : null,
      nama_lengkap: payload.nama_lengkap,
      username: payload.username,
      user_role: payload.user_role as UserRole,
    };
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticAsset(pathname) || isPublicApi(pathname)) {
    return NextResponse.next();
  }

  const session = await readSession(request);

  if (isPublicPage(pathname)) {
    if (!session) {
      return NextResponse.next();
    }

    return NextResponse.redirect(
      new URL(getDashboardPathByRole(session.user_role), request.url),
    );
  }

  if (pathname === "/") {
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    return NextResponse.redirect(
      new URL(getDashboardPathByRole(session.user_role), request.url),
    );
  }

  const protectedRole = getProtectedRole(pathname);

  if (!protectedRole) {
    return NextResponse.next();
  }

  if (!session) {
    return unauthorizedResponse(request);
  }

  if (session.user_role !== protectedRole) {
    return forbiddenResponse(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};