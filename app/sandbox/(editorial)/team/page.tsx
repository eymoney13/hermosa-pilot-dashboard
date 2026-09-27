import type { Metadata } from "next";
import { EditorialSection, PageHero, PhotoPlaceholder, TeamMember } from "@/components/sandbox/SandboxEditorial";
import s from "@/components/sandbox/SandboxEditorial.module.css";

export const metadata: Metadata = { title: "Meet the Team · Sandbox" };

export default function TeamPage() {
  return <>
    <PageHero title="Meet the Team" section="About Neptune / 03" intro="[Short mission introduction]" />
    <div className={s.teamGrid}><TeamMember name="Max" /><TeamMember name="Ethan" /></div>
    <EditorialSection number="01" title="Founder story"><div className={s.founderStory}><div><h3>[Founder story headline]</h3><p>[Founder story]</p><p>[Supporting context]</p></div><PhotoPlaceholder label="[Founder story photo]" landscape /></div></EditorialSection>
    <EditorialSection number="02" title="Advisors"><div className={s.advisor}><PhotoPlaceholder label="[Advisor / scientist photo]" /><div><h3>[Advisor / scientist name]</h3><p className={s.role}>[Role / credentials to confirm]</p><p>[Short advisor bio]</p></div></div></EditorialSection>
  </>;
}
