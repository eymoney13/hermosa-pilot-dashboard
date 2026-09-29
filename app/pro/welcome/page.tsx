import { redirect } from "next/navigation";
import { isEntitled } from "@/lib/entitlement";
export const dynamic = "force-dynamic";
export default async function Welcome() { redirect(await isEntitled() ? "/california" : "/pro/activate"); }
