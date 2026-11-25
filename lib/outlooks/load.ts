import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import type { BeachData } from "../data";
import { assembleNetwork, type CsvRow } from "./parse";
import type { OutlookNetwork } from "./types";

/**
 * Water Quality Outlooks are off unless NEPTUNE_OUTLOOKS_ENABLED is "true".
 * Set it for Development and the feature branch's Preview only. Production
 * stays off until the launch is approved.
 */
export function outlooksEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NEPTUNE_OUTLOOKS_ENABLED === "true";
}

/**
 * Outlook files live in data/outlooks/, outside public/, so they are not
 * downloadable from the site. They are published there by project-neptune's
 * scripts/publish_outlooks.py and contain only released stations.
 */
export const OUTLOOK_DIR = path.join("data", "outlooks");

async function readRows(file: string, root: string): Promise<CsvRow[]> {
  const text = await readFile(path.join(root, OUTLOOK_DIR, file), "utf8");
  // dynamicTyping stays off: Huntington State Beach's station code is "0".
  return Papa.parse<CsvRow>(text, { header: true, skipEmptyLines: true }).data;
}

export interface LoadOptions {
  forecastBeaches: BeachData[];
  displayNames: Record<string, string>;
  env?: NodeJS.ProcessEnv;
  now?: Date;
  root?: string;
}

/** null when the feature is off or its files are missing. It never throws into the page. */
export async function loadOutlookNetwork(opts: LoadOptions): Promise<OutlookNetwork | null> {
  if (!outlooksEnabled(opts.env)) return null;
  const root = opts.root ?? process.cwd();
  try {
    const [registry, outlooks, labs] = await Promise.all([
      readRows("station_registry.csv", root),
      readRows("outlook_latest.csv", root),
      readRows("lab_history.csv", root),
    ]);
    return assembleNetwork({
      registry,
      outlooks,
      labs,
      forecastBeaches: opts.forecastBeaches,
      displayNames: opts.displayNames,
      now: opts.now ?? new Date(),
    });
  } catch (err) {
    console.error("[outlooks] could not load outlook network:", err);
    return null;
  }
}
