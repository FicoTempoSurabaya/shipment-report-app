import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";

import type { AuthSession } from "@/types/auth";
import type { UserRole } from "@/types/user";

const encoder = new TextEncoder();

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET belum diisi di .env.local");
  }

  if (secret === "CHANGE_ME") {
    throw new Error("JWT_SECRET masih placeholder.");
  }

  return encoder.encode(secret);
}

export function getAuthCookieName(): string {
  return process.env.AUTH_COOKIE_NAME || "shipment_session";
}

function getCookieMaxAgeSeconds(): number {
  const value = process.env.AUTH_COOKIE_MAX_AGE_SECONDS || "86400";
  const maxAge = Number(value);

  if (!Number.isFinite(maxAge) || maxAge <= 0) {
    return 86400;
  }

  return maxAge;
}

export async function signSession(payload: AuthSession): Promise<string> {
  const maxAgeSeconds = getCookieMaxAgeSeconds();

  return new SignJWT({
    user_id: payload.user_id,
    nik_kerja: payload.nik_kerja,
    area_id: payload.area_id,
    area_code: payload.area_code,
    nama_lengkap: payload.nama_lengkap,
    username: payload.username,
    user_role: payload.user_role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string): Promise<AuthSession | null> {
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

    const role = payload.user_role as UserRole;

    if (!["regular", "admin", "super_admin"].includes(role)) {
      return null;
    }

    return {
      user_id: payload.user_id,
      nik_kerja: payload.nik_kerja,
      area_id: typeof payload.area_id === "string" ? payload.area_id : null,
      area_code: typeof payload.area_code === "string" ? payload.area_code : null,
      nama_lengkap: payload.nama_lengkap,
      username: payload.username,
      user_role: role,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getAuthCookieName())?.value;

  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}

export async function setSessionCookie(session: AuthSession): Promise<void> {
  const cookieStore = await cookies();
  const token = await signSession(session);

  cookieStore.set(getAuthCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getCookieMaxAgeSeconds(),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(getAuthCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function getDashboardPathByRole(role: UserRole): string {
  if (role === "regular") {
    return "/regular";
  }

  if (role === "admin") {
    return "/admin";
  }

  return "/superadmin";
}

export function hasAllowedRole(session: AuthSession | null, roles: UserRole[]): boolean {
  if (!session) {
    return false;
  }

  return roles.includes(session.user_role);
}