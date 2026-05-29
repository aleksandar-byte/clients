import { redirect } from "next/navigation";
import {
  hasClientRecordsAccess,
  isPasswordAuthConfigured,
  signInWithPassword
} from "../../auth";

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
  const isConfigured = isPasswordAuthConfigured();

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
          Enter the shared access password to open the live client records.
        </p>
        {!isConfigured ? (
          <div className="error-box">
            Password login is not configured yet. Add CLIENT_RECORDS_PASSWORD
            in Vercel to enable access.
          </div>
        ) : null}
        {error ? (
          <div className="error-box">
            That password did not match. Try again.
          </div>
        ) : null}
        <form action={signIn}>
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <label className="password-label" htmlFor="password">
            Password
          </label>
          <input
            autoComplete="current-password"
            autoFocus
            className="password-input"
            disabled={!isConfigured}
            id="password"
            name="password"
            type="password"
          />
          <button className="login-button" disabled={!isConfigured} type="submit">
            Continue
          </button>
        </form>
        <p className="fine-print">
          Access is stored in a secure browser cookie. Change the Vercel
          password variable to revoke existing sessions.
        </p>
      </section>
    </main>
  );
}
