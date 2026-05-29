import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const sessionCookieName = "client_records_session";
export const sessionMaxAge = 60 * 60 * 24 * 30;

function normalize(value) {
  return String(value || "").trim();
}

export function isPasswordAuthConfigured() {
  return Boolean(normalize(process.env.CLIENT_RECORDS_PASSWORD));
}

function sessionSecret() {
  return normalize(process.env.CLIENT_RECORDS_SESSION_SECRET) ||
    normalize(process.env.AUTH_SECRET) ||
    normalize(process.env.CLIENT_RECORDS_PASSWORD);
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function isValidPassword(password) {
  const expected = normalize(process.env.CLIENT_RECORDS_PASSWORD);
  const supplied = normalize(password);
  if (!expected || !supplied) return false;
  return safeEqual(hash(supplied), hash(expected));
}

function sessionValue() {
  const password = normalize(process.env.CLIENT_RECORDS_PASSWORD);
  const secret = sessionSecret();
  if (!password || !secret) return "";
  return hash(`${password}:${secret}`);
}

export function isValidSessionValue(value) {
  const expected = sessionValue();
  if (!expected || !value) return false;
  return safeEqual(value, expected);
}

export async function hasClientRecordsAccess() {
  const cookieStore = await cookies();
  return isValidSessionValue(cookieStore.get(sessionCookieName)?.value);
}

export async function signInWithPassword(password) {
  if (!isValidPassword(password)) return false;

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, sessionValue(), {
    httpOnly: true,
    maxAge: sessionMaxAge,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return true;
}

export async function signOutPassword() {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
}
