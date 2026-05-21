import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { auth, isAllowedSerpEmail } from "../../auth";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const session = await auth();
  const email = session?.user?.email;

  if (!isAllowedSerpEmail(email)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", "/clients-records.html");
    return NextResponse.redirect(loginUrl);
  }

  const htmlPath = path.join(process.cwd(), "clients-records.html");
  const html = await readFile(htmlPath, "utf8");

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0"
    }
  });
}
