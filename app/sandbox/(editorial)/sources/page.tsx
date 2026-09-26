import type { Metadata } from "next";
import { EditorialSection, PageHero, SourceRow } from "@/components/sandbox/SandboxEditorial";
import s from "@/components/sandbox/SandboxEditorial.module.css";

export const metadata: Metadata = { title: "Data & Sources · Sandbox" };
const groups = ["Official water-quality sources", "Scientific research", "Neptune data / methodology", "Community sources"];

export default function SourcesPage() {
  return <>
    <PageHero title="Data & Sources" section="Transparency / 04" intro="[Introduction to sources and provenance]" />
    <nav className={s.sourceIndex} aria-label="Source categories">{groups.map((title, index) => <a key={title} href={`#source-group-${index + 1}`}>{title}<span aria-hidden="true">↓</span></a>)}</nav>
    {groups.map((title, index) => <div key={title} id={`source-group-${index + 1}`} className={s.anchor}><EditorialSection number={`0${index + 1}`} title={title}><SourceRow /><SourceRow /></EditorialSection></div>)}
    <aside className={s.note}><h2>[Source review note]</h2><p>[How sources are selected, credited, and updated]</p><p className={s.annotation}>[Last reviewed date]</p></aside>
  </>;
}
