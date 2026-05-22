import { NextResponse } from "next/server";
import { auth, isAllowedSerpEmail } from "../../../auth";
import { listClientRecords } from "../../../lib/client-records-db";

export const dynamic = "force-dynamic";

function hasValidApiToken(request) {
  const expected = process.env.CLIENT_RECORDS_API_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${expected}`;
}

export async function GET(request) {
  const session = await auth();

  if (!isAllowedSerpEmail(session?.user?.email) && !hasValidApiToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await listClientRecords();
    return NextResponse.json({
      source: rows?.length ? "neon" : "empty",
      count: rows?.length || 0,
      clients: rows || []
    });
  } catch (error) {
    console.error("Client records API failed.", error);
    return NextResponse.json(
      { error: "Client records database is not ready." },
      { status: 503 }
    );
  }
}
