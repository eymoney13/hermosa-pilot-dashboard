import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type TextEdits = Record<string, { original: string; value: string }>;
export type PageDraft = { revision: string; edits: TextEdits };
const PAGES = {
  "how-it-works": { title: "How Neptune Works", file: "how-neptune-works.json" },
  stories: { title: "Why It Matters", file: "why-it-matters.json" },
  team: { title: "Meet the Team", file: "meet-the-team.json" },
} as const;
export type EditablePage = keyof typeof PAGES;
function fileFor(page: EditablePage) {
  if (!Object.hasOwn(PAGES, page)) throw new Error("Unknown editable page");
  return path.join(process.cwd(), "content/local-drafts", PAGES[page].file);
}
const revisionFor = (text: string) => createHash("sha256").update(text).digest("hex");

export async function readPageDraft(page: EditablePage): Promise<PageDraft> {
  if (process.env.NODE_ENV !== "development") return { revision: "", edits: {} };
  try {
    const text = await readFile(fileFor(page), "utf8");
    return { revision: revisionFor(text), edits: JSON.parse(text).edits };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { revision: "", edits: {} };
    throw error;
  }
}

// Serialize saves in this dev-server process so two tabs cannot overwrite a
// newer draft between the revision check and the atomic file replacement.
let saves: Promise<unknown> = Promise.resolve();
export function savePageDraft(page: EditablePage, revision: string, edits: TextEdits) {
  const next = saves.then(async () => {
    const file = fileFor(page);
    const current = await readPageDraft(page);
    if (current.revision !== revision) return null;
    const text = JSON.stringify({ page: PAGES[page].title, edits }, null, 2) + "\n";
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, text, "utf8");
    await rename(temporary, file);
    return { revision: revisionFor(text), edits };
  });
  saves = next.catch(() => undefined);
  return next;
}

export const readHowItWorksDraft = () => readPageDraft("how-it-works");
export const saveHowItWorksDraft = (revision: string, edits: TextEdits) => savePageDraft("how-it-works", revision, edits);
