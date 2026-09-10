import { unsubscribeByToken } from "@/lib/alertUnsubscribe";

// One-click unsubscribe (RFC 8058).
//
// This is the URL in the List-Unsubscribe header, and mail clients POST to it
// directly when the reader uses Gmail's or Outlook's own unsubscribe control.
// It must never require a confirmation step - the whole point is that the
// client can complete it without the reader visiting a page.
//
// POST only. A GET that deleted data would be triggered by every link scanner
// and prefetcher that touches the message; the human-facing page lives at
// /unsubscribe/<token> instead.

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    await unsubscribeByToken(token);
  } catch (err) {
    console.error("[alerts/unsubscribe]", err);
    return new Response("Could not unsubscribe", { status: 500 });
  }
  // Always 200, even for an unknown token: the mail client is reporting the
  // reader's intent, and "you were already off the list" is not a failure.
  return new Response("Unsubscribed", { status: 200 });
}
