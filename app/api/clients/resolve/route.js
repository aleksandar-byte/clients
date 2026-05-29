import { NextResponse } from "next/server";
import { hasClientRecordsAccess } from "../../../../auth";
import {
  clientApiResponse,
  hasValidApiToken,
  resolveClientRows
} from "../../../../lib/client-records-api";
import { listClientRecords } from "../../../../lib/client-records-db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!(await hasClientRecordsAccess()) && !hasValidApiToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const searchParams = new URL(request.url).searchParams;
    const name = searchParams.get("name") || searchParams.get("q") || "";
    const rows = (await listClientRecords()) || [];
    const matches = resolveClientRows(rows, name);

    return NextResponse.json(clientApiResponse({
      clients: matches,
      meta: {
        query: name,
        total: rows.length
      }
    }));
  } catch (error) {
    console.error("Client record resolution failed.", error);
    return NextResponse.json(
      { error: "Client records database is not ready." },
      { status: 503 }
    );
  }
}
