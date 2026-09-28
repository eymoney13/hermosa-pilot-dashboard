import { existsSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/sandbox/SandboxEditorial";
import s from "@/components/sandbox/SandboxEditorial.module.css";

export const metadata: Metadata = { title: "Meet the Team · Sandbox" };

// FIRST DRAFT.
//
// Names, the "PhD" on Ryan, and both founder bios came from the owner. Nothing
// here is inferred: no job title beyond Co-founder and Scientific advisor, no
// degrees beyond the one supplied, no quotes, and no bio for Ryan, because
// none was given and inventing one for a named scientist would be worse than
// leaving the space quiet.
//
// The scaffold's "Founder story" section is gone. It did not vanish: Max's
// illness is told properly on /sandbox/stories, and a second, shorter telling
// here would compete with it. The closing links there instead.
//
// AN ADVISOR ROW WAS HERE and was pulled at the owner's request pending the
// advisor's own sign-off. Restoring it needs three things back: this JSX
//
//   <section className={s.advisorRow}>
//     <p className={s.eyebrow}>Advisor</p>
//     <div>
//       <Avatar src={portrait("<slug>")} initial="<X>" name="<Name>" size={64} />
//       <div><NameRow name="<Name>" /><p className={s.role}>Scientific advisor</p></div>
//     </div>
//   </section>
//
// the .advisorRow rules in SandboxEditorial.module.css, which are still there,
// and a portrait in public/team. The portrait was deleted too: leaving it
// under public/ would have kept it fetchable by URL after the section came
// off the page.

/**
 * Whether a portrait has been dropped into public/team yet.
 *
 * Checked on the server at render time rather than assumed, because the
 * photographs are not in the repository yet and next/image throws on a missing
 * file. With this, an absent portrait degrades to a monogram instead of
 * breaking the page, and adding one later is a file copy with no code change.
 *
 * See public/team/README.md for the expected filenames.
 */
function portrait(slug: string): string | null {
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    const rel = `/team/${slug}.${ext}`;
    if (existsSync(path.join(process.cwd(), "public", rel))) return rel;
  }
  return null;
}

// The LinkedIn mark, inlined because lucide-react 1.x no longer ships brand
// glyphs (they moved out to simple-icons, which is not a dependency here and
// is not worth adding for one path). currentColor so it inherits the link.
function LinkedInMark() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
    </svg>
  );
}

/** Name plus, when there is one, a link to that person's LinkedIn. */
function NameRow({ name, linkedin }: { name: string; linkedin?: string }) {
  return (
    <div className={s.nameRow}>
      <h2>{name}</h2>
      {linkedin ? (
        <a
          className={s.social}
          href={linkedin}
          target="_blank"
          // noreferrer as well as noopener: the target should not be handed
          // this page's URL, and older browsers need both to sever opener.
          rel="noopener noreferrer"
          // The icon is aria-hidden, so the link needs its own name; "LinkedIn"
          // alone would read as five identical links to a screen reader.
          aria-label={`${name} on LinkedIn`}
        >
          <LinkedInMark />
        </a>
      ) : null}
    </div>
  );
}

const FOUNDERS = [
  {
    name: "Ethan Young",
    slug: "ethan-young",
    linkedin: "https://www.linkedin.com/in/ethan-young-b67a4b228/",
    initial: "E",
    role: "Co-founder",
    bio: "Ethan grew up in Hermosa Beach, where the ocean and the South Bay community have always been part of his life. He is focused on getting Neptune into the hands of the people who use these beaches, listening to their feedback, and making the forecast genuinely useful.",
  },
  {
    name: "Max Lynch",
    slug: "max-lynch",
    linkedin: "https://www.linkedin.com/in/maxwelllynch/",
    initial: "M",
    role: "Co-founder",
    bio: "After becoming seriously ill following a surf trip in Mexico, Max began asking why it was so difficult to know what was happening in the water before getting in. That experience helped spark Project Neptune. He works on turning water-quality data and environmental conditions into forecasts people can understand and use.",
  },
];

function Avatar({ src, initial, name, size }: { src: string | null; initial: string; name: string; size: number }) {
  if (src) {
    // Rendered at 2x so the circle stays sharp on a retina screen.
    return <Image className={s.portrait} src={src} alt={name} width={size * 2} height={size * 2} style={{ width: size, height: size }} />;
  }
  return <span className={s.monogram} style={{ width: size, height: size, fontSize: size * 0.39 }} aria-hidden="true">{initial}</span>;
}

export default function TeamPage() {
  return <>
    <PageHero
      title="Meet the Team"
      section="The people behind Neptune"
      headline="We&rsquo;re building the water-quality forecast we wished existed."
      intro="Project Neptune was founded by Ethan and Max, two people who believe checking ocean water quality should be as easy as checking the weather."
    />

    <div className={s.founderGrid}>
      {FOUNDERS.map((f) => (
        <article key={f.slug} className={s.founder}>
          <Avatar src={portrait(f.slug)} initial={f.initial} name={f.name} size={92} />
          <NameRow name={f.name} linkedin={f.linkedin} />
          <p className={s.role}>{f.role}</p>
          <p>{f.bio}</p>
        </article>
      ))}
    </div>

    <section className={s.closing}>
      <h2>We&rsquo;re starting with the beaches we know.</h2>
      <p>We are building toward a future where anyone can check the water before they go in. If you want the longer version of why, <Link className={s.textLink} href="/sandbox/stories">read the story behind Neptune</Link>.</p>
      <div className={s.ctaRow}>
        <Link className={s.ctaPrimary} href="/sandbox">
          Explore the forecast
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  </>;
}
