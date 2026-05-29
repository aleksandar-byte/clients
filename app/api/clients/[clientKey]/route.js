import { NextResponse } from "next/server";
import { hasClientRecordsAccess } from "../../../../auth";
import {
  clientApiResponse,
  findClientRow,
  hasValidApiToken
} from "../../../../lib/client-records-api";
import { listClientRecords } from "../../../../lib/client-records-db";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  if (!(await hasClientRecordsAccess()) && !hasValidApiToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { clientKey } = await params;
    const rows = (await listClientRecords()) || [];
    const client = findClientRow(rows, clientKey);

    if (!client) {
      return NextResponse.json(
        { error: "Client not found.", clientKey },
        { status: 404 }
      );
    }

    return NextResponse.json(clientApiResponse({
      clients: [client],
      meta: {
        clientKey,
        total: rows.length
      }
    }));
  } catch (error) {
    console.error("Client record lookup failed.", error);
    return NextResponse.json(
      { error: "Client records database is not ready." },
      { status: 503 }
    );
  }
}
