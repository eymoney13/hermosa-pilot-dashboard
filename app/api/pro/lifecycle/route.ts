import { runProLifecycle } from "@/lib/proLifecycle";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  try {
    const result = await runProLifecycle();
    return Response.json(result, { status: result.failed ? 503 : 200 });
  } catch (error) { console.error('[pro/lifecycle]', error); return new Response("Lifecycle processing failed", { status: 500 }); }
}
