import { readFile } from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";

// The daily refresh writes this compact archive alongside the live CSVs.
// Exact dates only: absent or invalid snapshots must never become 0% readings.
export async function loadPredictionArchive(anchorDate: string, dataSlug = "california-sandbox") {
  const byDate = new Map<string, Map<string, number>>();
  const anchor = new Date(`${anchorDate}T12:00:00Z`);
  if (!Number.isFinite(anchor.getTime())) return byDate;
  const dates = new Set(Array.from({ length: 10 }, (_, index) => {
    const day = new Date(anchor);
    day.setUTCDate(day.getUTCDate() - index - 1);
    return day.toISOString().slice(0, 10);
  }));
  const addRows = (csv: string) => {
    const rows = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }).data;
    for (const row of rows) {
      const date = (row.date ?? row.prediction_date)?.slice(0, 10);
      const code = row.StationCode?.trim();
      const value = row.exc_probability?.trim();
      const probability = Number(value);
      if (!dates.has(date) || !code || !value || !Number.isFinite(probability) || probability < 0 || probability > 1) continue;
      const predictions = byDate.get(date) ?? new Map<string, number>();
      predictions.set(code, probability);
      byDate.set(date, predictions);
    }
  };
  try {
    addRows(await readFile(path.join(process.cwd(), "public/data", dataSlug, "history_10day.csv"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  // Optional local backend folder connection for sandbox development.
  const directory = dataSlug === "california-sandbox" ? process.env.SANDBOX_NOWCAST_HISTORY_DIR : null;
  if (directory) await Promise.all([...dates].map(async date => {
    try {
      const csv = await readFile(path.join(directory, `nowcast_${date}.csv`), "utf8");
      // Reject misdated rows rather than moving them into another day's slot.
      const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }).data;
      addRows(Papa.unparse(parsed.filter(row => row.prediction_date?.slice(0, 10) === date)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }));
  return byDate;
}
