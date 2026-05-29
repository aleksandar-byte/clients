import { NextResponse } from "next/server";
import { hasClientRecordsAccess } from "../../../auth";
import {
  clientApiResponse,
  filterClientRows,
  hasValidApiToken
} from "../../../lib/client-records-api";
import { listClientRecords } from "../../../lib/client-records-db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!(await hasClientRecordsAccess()) && !hasValidApiToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await listClientRecords();
    const clients = rows || [];
    const filtered = filterClientRows(clients, new URL(request.url).searchParams);

    return NextResponse.json(clientApiResponse({
      source: clients.length ? "neon" : "empty",
      clients: filtered,
      meta: {
        total: clients.length,
        filters: Object.fromEntries(new URL(request.url).searchParams)
      }
    }));
  } catch (error) {
    console.error("Client records API failed.", error);
    return NextResponse.json(
      { error: "Client records database is not ready." },
      { status: 503 }
    );
  }
}
