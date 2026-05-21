import { redirect } from "next/navigation";
import { allowedEmailDomain, auth, isAllowedSerpEmail, signIn } from "../../auth";

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const callbackUrl = params?.callbackUrl || "/clients-records.html";
  const error = params?.error;
  const session = await auth();

  async function signInWithGoogle() {
    "use server";
    await signIn("google", { redirectTo: callbackUrl });
  }

  if (isAllowedSerpEmail(session?.user?.email)) {
    redirect(callbackUrl);
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <p className="eyebrow">SERP Client Records</p>
        <h1>Protected client roster</h1>
        <p className="lede">
          Sign in with a Google account using your @{allowedEmailDomain} email.
          Other Google accounts are blocked automatically.
        </p>
        {error ? (
          <div className="error-box">
            Access denied. Use a Google account ending in @{allowedEmailDomain}.
          </div>
        ) : null}
        <form action={signInWithGoogle}>
          <button className="login-button" type="submit">
            Continue with Google
          </button>
        </form>
        <p className="fine-print">
          This protects the Vercel app. Disable public GitHub Pages publishing
          when you are ready to make this the only public entry point.
        </p>
      </section>
    </main>
  );
}
