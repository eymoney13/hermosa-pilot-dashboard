"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { EditablePage, PageDraft, TextEdits } from "@/lib/local-editor/howItWorksDraft";
import s from "./LocalPageEditor.module.css";

type Field = { id: string; element: HTMLElement; original: string };

export default function LocalPageEditor({ children, initialDraft, pageId = "how-it-works" }: { children: ReactNode; initialDraft: PageDraft; pageId?: EditablePage }) {
  const content = useRef<HTMLDivElement>(null);
  const fields = useRef<Field[]>([]);
  const saved = useRef(initialDraft);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("Edit the text here, then save. Nothing is published.");

  useEffect(() => {
    const selector = "h1, h2, h3, p, summary, li, [data-local-copy]";
    const elements = Array.from(content.current?.querySelectorAll<HTMLElement>(selector) ?? [])
      .filter((element) => element.children.length === 0 && !element.querySelector(selector) && !element.closest('[aria-hidden="true"]')
        && !element.querySelector("a, button, input") && element.textContent?.trim());
    fields.current = elements.map((element, index) => {
      const original = element.textContent ?? "";
      const id = `text-${index}`;
      const edit = initialDraft.edits[id];
      element.dataset.localText = id;
      if (edit && edit.original === original) element.textContent = edit.value;
      return { id, element, original };
    });
    // React Strict Mode repeats setup: restore the source before indexing again.
    return () => fields.current.forEach(({ element, original }) => { element.textContent = original; });
  }, [initialDraft]);

  useEffect(() => {
    for (const { element, original } of fields.current) {
      element.setAttribute("contenteditable", editing && !saving ? "plaintext-only" : "false");
      if (editing) {
        element.setAttribute("role", "textbox");
        element.setAttribute("aria-label", `Edit: ${original.slice(0, 80)}`);
        element.setAttribute("spellcheck", "true");
      } else {
        element.removeAttribute("role");
        element.removeAttribute("aria-label");
      }
    }
    content.current?.querySelectorAll("details").forEach((element) => { if (editing) element.setAttribute("open", ""); else element.removeAttribute("open"); });
  }, [editing, saving]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const guard = (event: MouseEvent) => {
      if (!(event.target as Element).closest('[contenteditable="plaintext-only"]') && (event.target as Element).closest("a[href]") && !window.confirm("Leave without saving your text changes?")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guard, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", guard, true); };
  }, [dirty]);

  function collect(): TextEdits {
    const edits: TextEdits = { ...saved.current.edits };
    for (const { id, element, original } of fields.current) {
      const value = element.innerText.replace(/\r\n/g, "\n");
      if (value === original) delete edits[id];
      else edits[id] = { original, value };
    }
    return edits;
  }

  async function save() {
    const edits = collect();
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/local-editor/${pageId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: saved.current.revision, edits }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Save failed. Please try again.");
      saved.current = result;
      setDirty(false); setMessage("Saved on this computer. Not published.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Save failed. Please try again."); }
    finally { setSaving(false); }
  }

  function cancel() {
    fields.current.forEach(({ id, element, original }) => {
      const edit = saved.current.edits[id];
      element.textContent = edit?.original === original ? edit.value : original;
    });
    setDirty(false); setError(""); setEditing(false);
  }

  return <>
    <div className={s.toolbar}>
      <div className={s.status} aria-live="polite"><strong>Local page editor</strong><span className={error ? s.error : undefined}>{error || (saving ? "Saving…" : dirty ? "Unsaved changes. Click Save changes to keep them." : message)}</span></div>
      <div className={s.actions}>
        {!editing ? <button type="button" onClick={() => setEditing(true)}>Edit text</button> : <>
          <button type="button" onClick={save} disabled={saving || !dirty}>Save changes</button>
          <button type="button" onClick={cancel} disabled={saving}>{dirty ? "Cancel" : "Done editing"}</button>
        </>}
      </div>
    </div>
    <div ref={content} className={s.content} onClickCapture={(event) => { if (editing && (event.target as Element).closest("a, summary")) event.preventDefault(); }} onInput={() => { setDirty(true); setError(""); }}>{children}</div>
  </>;
}
