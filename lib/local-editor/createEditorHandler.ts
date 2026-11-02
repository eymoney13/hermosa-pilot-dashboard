import { savePageDraft, type TextEdits, type EditablePage } from "@/lib/local-editor/howItWorksDraft";



export function createEditorHandler(page: EditablePage) {
 return async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404 });
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  let source: URL;
  try { source = new URL(origin ?? ""); } catch { return new Response(null, { status: 403 }); }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || !origin || source.host !== host || source.protocol !== url.protocol) {
    return Response.json({ error: "Editing is available only from the local preview." }, { status: 403 });
  }
  const text = await request.text();
  if (text.length > 200_000) return Response.json({ error: "This draft is too large." }, { status: 413 });
  let body;
  try { body = JSON.parse(text); } catch { return Response.json({ error: "Invalid draft." }, { status: 400 }); }
  if (!body || typeof body.revision !== "string" || !body.edits || Array.isArray(body.edits) || typeof body.edits !== "object") {
    return Response.json({ error: "Invalid draft." }, { status: 400 });
  }
  const entries = Object.entries(body.edits);
  if (entries.length > 200 || entries.some(([key, value]) => {
    const edit = value as { original?: unknown; value?: unknown } | null;
    return !/^text-\d+$/.test(key) || !edit || typeof edit.original !== "string" || typeof edit.value !== "string"
      || edit.original.length > 20_000 || edit.value.length > 20_000;
  })) return Response.json({ error: "Invalid text fields." }, { status: 400 });
  try {
    const saved = await savePageDraft(page, body.revision, body.edits as TextEdits);
    if (!saved) return Response.json({ error: "This page was saved in another tab. Copy your changes before reloading to get the latest draft." }, { status: 409 });
    return Response.json(saved);
  } catch {
    return Response.json({ error: "Could not save the draft. Your edits are still on this page; please try again." }, { status: 500 });
  }
}

}
