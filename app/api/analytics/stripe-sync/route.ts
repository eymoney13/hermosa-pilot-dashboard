import { reconcileStripeRevenue } from "@/lib/stripeRevenueSync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const result = await reconcileStripeRevenue();
    console.info("[stripe/revenue-sync]", JSON.stringify(result));
    return Response.json(result, { status: "failed" in result && result.failed ? 503 : 200 });
  } catch (error) {
    console.error("[stripe/revenue-sync] failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "Revenue sync failed; queued payments will be retried." }, { status: 500 });
  }
}
