import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const allowedEmailDomain = (
  process.env.ALLOWED_EMAIL_DOMAIN || "serp.agency"
)
  .trim()
  .replace(/^@/, "")
  .toLowerCase();

export function isAllowedSerpEmail(email) {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${allowedEmailDomain}`);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    })
  ],
  pages: {
    signIn: "/login",
    error: "/login"
  },
  callbacks: {
    async signIn({ user, profile }) {
      const email = user?.email || profile?.email;
      const emailVerified = profile?.email_verified !== false;
      return emailVerified && isAllowedSerpEmail(email);
    },
    async session({ session }) {
      session.user.allowed = isAllowedSerpEmail(session.user?.email);
      return session;
    }
  }
});
