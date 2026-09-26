import type { Metadata } from "next";
import { EditorialSection, PageHero, StoryPlaceholder } from "@/components/sandbox/SandboxEditorial";
import s from "@/components/sandbox/SandboxEditorial.module.css";

export const metadata: Metadata = { title: "Why It Matters · Sandbox" };

export default function StoriesPage() {
  return <>
    <PageHero title="Why It Matters" section="About Neptune / 02" intro="[Community introduction]" />
    <StoryPlaceholder featured />
    <EditorialSection number="01" title="Community stories"><div className={s.stories}>{[1, 2, 3, 4].map((story) => <StoryPlaceholder key={story} />)}</div></EditorialSection>
    <EditorialSection number="02" title="In context"><div className={s.metrics}>{[1, 2].map((metric) => <div key={metric}><p className={s.metric}>[Metric]</p><p>[Supporting context]</p><p className={s.annotation}>[Verified source / date]</p></div>)}</div></EditorialSection>
    <section className={s.request}><div><p className={s.eyebrow}>[CTA eyebrow]</p><h2>Request your beach</h2><p>[Short invitation]</p></div><div><button type="button" disabled aria-describedby="request-placeholder">Request your beach</button><p id="request-placeholder" className={s.annotation}>[Request link or form to be added]</p></div></section>
  </>;
}
