import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const sessionCookieName = "client_records_session";
export const sessionMaxAge = 60 * 60 * 24 * 30;
const defaultAllowedDomains = ["serp.agency"];
const defaultAdminEmails = ["aleksandar@serp.agency"];

function normalize(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalize(value).toLowerCase();
}

function listFromEnv(value, fallback) {
  const items = String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return items.length ? items : fallback;
}

export function allowedDomains() {
  return listFromEnv(process.env.AUTH_ALLOWED_DOMAINS || process.env.ALLOWED_EMAIL_DOMAIN, defaultAllowedDomains);
}

export function adminEmails() {
  return listFromEnv(process.env.AUTH_ADMIN_EMAILS, defaultAdminEmails);
}

export function isAllowedEmail(email) {
  const normalized = normalizeLower(email);
  const domain = normalized.split("@")[1] || "";
  return Boolean(normalized && allowedDomains().includes(domain));
}

export function roleForEmail(email) {
  return adminEmails().includes(normalizeLower(email)) ? "admin" : "member";
}

function googleClientId() {
  return normalize(process.env.AUTH_GOOGLE_ID) || normalize(process.env.GOOGLE_CLIENT_ID);
}

function googleClientSecret() {
  return normalize(process.env.AUTH_GOOGLE_SECRET) || normalize(process.env.GOOGLE_CLIENT_SECRET);
}

export function isGoogleAuthConfigured() {
  return Boolean(googleClientId() && googleClientSecret());
}

function authSecret() {
  return normalize(process.env.AUTH_SECRET) || normalize(process.env.NEXTAUTH_SECRET);
}

export const authOptions = {
  secret: authSecret(),
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/login",
    error: "/login"
  },
  providers: isGoogleAuthConfigured()
    ? [
        GoogleProvider({
          clientId: googleClientId(),
          clientSecret: googleClientSecret()
        })
      ]
    : [],
  callbacks: {
    async signIn({ profile }) {
      const email = typeof profile?.email === "string" ? profile.email : "";
      return profile?.email_verified === true && isAllowedEmail(email);
    },
    async jwt({ token }) {
      const email = typeof token.email === "string" ? token.email : "";
      token.role = roleForEmail(email);
      token.allowed = isAllowedEmail(email);
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = typeof token.role === "string" ? token.role : "member";
        session.user.allowed = token.allowed !== false;
      }
      return session;
    }
  }
};

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
  const session = await getServerSession(authOptions);
  if (session?.user?.email && isAllowedEmail(session.user.email)) {
    return true;
  }

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
