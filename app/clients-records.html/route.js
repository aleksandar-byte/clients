import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { auth, isAllowedSerpEmail } from "../../auth";
import { listClientRecords } from "../../lib/client-records-db";
import { renderClientRecordsHtml } from "../../lib/render-client-records";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const session = await auth();
  const email = session?.user?.email;

  if (!isAllowedSerpEmail(email)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", "/clients-records.html");
    return NextResponse.redirect(loginUrl);
  }

  let html;
  let source = "static-fallback";

  try {
    const rows = await listClientRecords();
    if (rows?.length) {
      html = renderClientRecordsHtml(rows, {
        sourceDescription: "Generated live from Neon Postgres table <code>core.clients</code>."
      });
      source = "neon";
    }
  } catch (error) {
    console.error("Client records DB render failed; using static fallback.", error);
  }

  if (!html) {
    const htmlPath = path.join(process.cwd(), "clients-records.html");
    html = await readFile(htmlPath, "utf8");
  }

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Client-Records-Source": source
    }
  });
}
