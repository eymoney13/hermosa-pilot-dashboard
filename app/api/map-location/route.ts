export async function GET(request: Request) {
  const lat = request.headers.get("x-vercel-ip-latitude");
  const lon = request.headers.get("x-vercel-ip-longitude");
  const latitude = lat ? Number(lat) : NaN;
  const longitude = lon ? Number(lon) : NaN;
  const valid = Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
  return Response.json(valid ? { latitude, longitude } : null, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
