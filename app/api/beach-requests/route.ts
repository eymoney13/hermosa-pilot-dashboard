import { neon } from "@neondatabase/serverless";
import { parseBeachRequest } from "@/lib/beachRequest";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) return Response.json({ error: "Please submit from the Neptune website." }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Invalid request." }, { status: 415 });
  // Bound the body before decoding so the public form cannot accept large uploads.
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Please complete the form." }, { status: 400 });
  let raw = "";
  let size = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16000) { await reader.cancel(); return Response.json({ error: "Your message is too long." }, { status: 413 }); }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  let body;
  try { body = JSON.parse(raw); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  const parsed = parseBeachRequest(body);
  if (!parsed) return Response.json({ error: "Enter a valid email and a message between 2 and 2,000 characters." }, { status: 400 });
  if (body.website) return Response.json({ ok: true });
  if (!process.env.DATABASE_URL) return Response.json({ error: "Requests are temporarily unavailable. Please try again later." }, { status: 503 });
  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`
      INSERT INTO beach_requests (email, message, source)
      SELECT ${parsed.email}, ${parsed.message}, ${parsed.source}
      WHERE (SELECT count(*) FROM beach_requests WHERE email = ${parsed.email} AND created_at > now() - interval '1 day') < 5
      ON CONFLICT (email, message, source) DO UPDATE SET email = EXCLUDED.email
      RETURNING id
    `;
    if (!rows.length) return Response.json({ error: "You’ve sent several requests today. Please try again tomorrow." }, { status: 429 });
    return Response.json({ ok: true });
  } catch {
    console.error("[beach-requests] Could not save request");
    return Response.json({ error: "We couldn’t save your request. Please try again." }, { status: 503 });
  }
}
