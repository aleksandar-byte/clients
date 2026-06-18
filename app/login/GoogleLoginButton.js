"use client";

import { signIn } from "next-auth/react";

export function GoogleLoginButton({ callbackUrl, disabled }) {
  return (
    <button
      className="login-button"
      disabled={disabled}
      onClick={() => signIn("google", { callbackUrl })}
      type="button"
    >
      Continue with Google
    </button>
  );
}
