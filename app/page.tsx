import { redirect } from "next/navigation";

// The query string travels with the redirect. QR codes and shared links point
// at the bare domain with ?utm_source=..., and dropping it here would lose the
// attribution before PostHog ever loads on /california.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of [value ?? []].flat()) query.append(key, item);
  }
  const qs = query.toString();
  redirect(qs ? `/california?${qs}` : "/california");
}
