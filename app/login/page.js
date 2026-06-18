import { redirect } from "next/navigation";
import {
  allowedDomains,
  hasClientRecordsAccess,
  isGoogleAuthConfigured,
  isPasswordAuthConfigured,
  signInWithPassword
} from "../../auth";
import { GoogleLoginButton } from "./GoogleLoginButton";

function safeCallbackUrl(value) {
  const next = String(value || "/clients-records.html");
  if (!next.startsWith("/") || next.startsWith("//")) {
    return "/clients-records.html";
  }
  return next;
}

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params?.callbackUrl);
  const error = params?.error;
  const isPasswordConfigured = isPasswordAuthConfigured();
  const isGoogleConfigured = isGoogleAuthConfigured();

  async function signIn(formData) {
    "use server";
    const nextUrl = safeCallbackUrl(formData.get("callbackUrl"));
    const password = formData.get("password");
    const signedIn = await signInWithPassword(password);

    if (!signedIn) {
      redirect(`/login?callbackUrl=${encodeURIComponent(nextUrl)}&error=1`);
    }

    redirect(nextUrl);
  }

  if (await hasClientRecordsAccess()) {
    redirect(callbackUrl);
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <p className="eyebrow">SERP Client Records</p>
        <h1>Protected client roster</h1>
        <p className="lede">
          Use your {allowedDomains().map((domain) => `@${domain}`).join(" or ")} Google account to open the live client records.
        </p>
        {!isGoogleConfigured && !isPasswordConfigured ? (
          <div className="error-box">
            Login is not configured yet. Add AUTH_GOOGLE_ID and
            AUTH_GOOGLE_SECRET in Vercel to enable Google access.
          </div>
        ) : null}
        {error ? (
          <div className="error-box">
            That password did not match. Try again.
          </div>
        ) : null}
        <GoogleLoginButton callbackUrl={callbackUrl} disabled={!isGoogleConfigured} />
        {isPasswordConfigured ? (
          <>
            <div className="login-divider">or use the fallback password</div>
            <form action={signIn}>
              <input type="hidden" name="callbackUrl" value={callbackUrl} />
              <label className="password-label" htmlFor="password">
                Password
              </label>
              <input
                autoComplete="current-password"
                className="password-input"
                id="password"
                name="password"
                type="password"
              />
              <button className="login-button login-button-secondary" type="submit">
                Continue with password
              </button>
            </form>
          </>
        ) : null}
        <p className="fine-print">
          Google access is limited to the approved organization domain. Password login remains available only when configured.
        </p>
      </section>
    </main>
  );
}
