import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ImageIcon } from "lucide-react";
import ProjectNeptuneLogo from "../ProjectNeptuneLogo";
import SandboxMenu from "./SandboxMenu";
import s from "./SandboxEditorial.module.css";

export function EditorialShell({ children }: { children: ReactNode }) {
  return (
    <div className={s.root}>
      <a className={s.skipLink} href="#editorial-content">Skip to content</a>
      <div className={s.draftBar}>SANDBOX <span>Layout preview · placeholder content</span></div>
      <header className={s.header}>
        <Link href="/sandbox" aria-label="Project Neptune water quality"><ProjectNeptuneLogo size={22} /></Link>
        <SandboxMenu />
      </header>
      <main id="editorial-content" className={s.main}>{children}</main>
      <footer className={s.footer}><Link href="/sandbox"><ArrowLeft size={16} aria-hidden="true" />Back to Water Quality</Link><span>Neptune / Sandbox</span></footer>
    </div>
  );
}

export function PageHero({ title, intro = "[Short introduction]", section }: { title: string; intro?: string; section: string }) {
  return <header className={s.hero}><p className={s.eyebrow}>{section}</p><h1>{title}</h1><p className={s.heroHeadline}>[Headline]</p><p className={s.intro}>{intro}</p></header>;
}

export function EditorialSection({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return <section className={s.section}><div className={s.sectionLabel}><span>{number}</span><h2>{title}</h2></div><div className={s.sectionBody}>{children}</div></section>;
}

export function PhotoPlaceholder({ label = "[Photo placeholder]", landscape = false }: { label?: string; landscape?: boolean }) {
  return <div className={`${s.photo} ${landscape ? s.landscape : ""}`} role="img" aria-label={label}><ImageIcon size={27} strokeWidth={1} aria-hidden="true" /><span>{label}</span></div>;
}

export function TeamMember({ name }: { name: string }) {
  return <article className={s.teamMember}><PhotoPlaceholder label={`[${name} photo]`} /><h2>{name}</h2><p className={s.role}>[Role]</p><p>[Short bio]</p></article>;
}

export function StoryPlaceholder({ featured = false }: { featured?: boolean }) {
  return <figure className={featured ? s.featuredStory : s.story}><span className={s.quoteMark} aria-hidden="true">“</span><blockquote>[Community quote]</blockquote><figcaption>[First name / location]</figcaption><p>[Supporting context]</p></figure>;
}

// No fake URLs. Pass a verified URL when the final sources are approved.
export function SourceRow({ title = "[Source title]", description = "[Description]", href }: { title?: string; description?: string; href?: string }) {
  return <article className={s.sourceRow}><div><h3>{title}</h3><p>{description}</p></div>{href ? <a href={href} target="_blank" rel="noopener noreferrer">View source<ArrowUpRight size={16} aria-hidden="true" /></a> : <span className={s.linkPlaceholder}>[External link]<ArrowUpRight size={16} aria-hidden="true" /></span>}</article>;
}
