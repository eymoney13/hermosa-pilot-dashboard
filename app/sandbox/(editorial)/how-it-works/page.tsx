import type { Metadata } from "next";
import { EditorialSection, PageHero } from "@/components/sandbox/SandboxEditorial";
import s from "@/components/sandbox/SandboxEditorial.module.css";

export const metadata: Metadata = { title: "How Neptune Works · Sandbox" };

export default function HowItWorksPage() {
  return <>
    <PageHero title="How Neptune Works" section="About Neptune / 01" intro="[Short explanation]" />
    <EditorialSection number="01" title="The process">
      <ol className={s.steps}>{[1, 2, 3, 4].map((step) => <li key={step}><span className={s.stepNumber}>0{step}</span><div><h3>[Step {step} title]</h3><p>[Step {step} description]</p></div></li>)}</ol>
    </EditorialSection>
    <EditorialSection number="02" title="Methodology"><div className={s.note}><h3>[Methodology headline]</h3><p>[Methodology note]</p><p className={s.annotation}>[Methodology reference / last reviewed date]</p></div></EditorialSection>
    <aside className={s.disclaimer} aria-label="Official advisories disclaimer"><h2>Official advisories</h2><p>[Neptune complements official advisories… disclaimer copy]</p></aside>
    <EditorialSection number="03" title="Questions &amp; credibility">
      <div className={s.faq}>{[1, 2, 3].map((item) => <details key={item}><summary>[Question {item}]</summary><p>[Answer / supporting evidence]</p></details>)}</div>
    </EditorialSection>
  </>;
}
