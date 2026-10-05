import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { EditorialSection, PageHero } from "@/components/sandbox/SandboxEditorial";
import s from "@/components/sandbox/SandboxEditorial.module.css";

export const metadata: Metadata = { title: "Why It Matters · Neptune" };

// FIRST DRAFT.
//
// NOTHING HERE IS INVENTED. There are no quotes, no testimonials, no metrics,
// no partners and no photographs, because the repository contains none that are
// verified (see docs/SANDBOX_UI_HANDOFF.md, which records that the source PDF's
// names and credentials were never confirmed). The scaffold this replaces had
// four empty quote cards and two "[Metric]" slots; both are gone rather than
// filled, since a fake card is worse than an honest absence.
//
// Max's illness is told as HIS EXPERIENCE and as the reason the company exists.
// It does not claim a water test established a cause, because no such test is
// in evidence. Keep it that way.
//
// The one place a future story could go is the invitation at the end, which
// asks for stories instead of pretending to have them.

// The mailbox a person actually reads. Mirrors lib/alertSend.ts's REPLY_TO
// rather than importing it, which would pull the server-only mail stack into a
// page; the fallback is deliberately the same string so the two cannot drift
// apart silently.
const CONTACT = process.env.GMAIL_REPLY_TO ?? "ethan@projectneptune.co";
const SHARE_SUBJECT = encodeURIComponent("My Neptune story");
const SHARE_BODY = encodeURIComponent(
  "Which beach do you use, and what would you want Neptune to tell you before you get in?\n\n"
);

export default function StoriesPage() {
  return <>
    <PageHero
      title="Why It Matters"
      section="Why we built Neptune"
      headline="The ocean is mostly a mystery. But answering &quot;will it get you sick?&quot; shouldn&#x27;t be."
      intro="We check the weather before heading out. The air quality is shown too. But when it comes to the water itself, the information we need can be hard to find or already out of date. This leads to over 7 million Americans getting sick each year from the ocean."
    />

    {/* The origin story gets the page's warmest treatment and its only panel.
        Deliberately NOT the .featuredStory blockquote style: that carries a
        quote mark and is built for someone's words, and this is narrative
        about a person rather than a quotation from him. */}
    <section className={s.origin}>
      <p className={s.eyebrow}>The surf trip that started it</p>
      <p className={s.originLede}>Project Neptune began after co-founder Max became seriously ill with a staph infection following a surf trip in Mexico.
</p>
      <p>He spent eight days in the hospital receiving IV antibiotics, followed by two more weeks of treatment at home.</p>
      <p>The experience left us with a question. What if people could check the likely water quality before getting in, as easily as they check the weather?</p>
    </section>

    <EditorialSection number="01" title="The problem">
      <h3>The water can change before the next test</h3>
      <p>Official water testing is essential, but a sample captures conditions at one place and time. Lab results can take a day or two, while rain, runoff, and ocean conditions keep changing.</p>
      <p>That leaves a gap between what the last test showed and what someone wants to know before going in today.</p>
    </EditorialSection>

    <EditorialSection number="02" title="What we&rsquo;re building">
      <h3>A forecast for the water</h3>
      <p>Neptune uses years of official bacteria test results and current environmental conditions to estimate the chance of elevated bacteria at each beach. We turn that forecast into a simple Neptune Index so people can make a more informed choice.</p>
      <p>It complements official advisories and closures. It does not replace them.</p>
      <Link className={s.inlineTeal} href="/california/how-it-works">
        See how the forecast is built
        <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </EditorialSection>

    {/* Space held for real stories, with no card pretending to be one. When
        verified stories arrive with consent, they go here and this invitation
        moves below them. */}
    <section className={s.invite}>
      <h2>Share your story</h2>
      <p>If the water has changed a plan of yours, got you sick, or cost you a day, we would like to hear about it.</p>
      <a className={s.inlineTeal} href={`mailto:${CONTACT}?subject=${SHARE_SUBJECT}&body=${SHARE_BODY}`}>
        Share your story
        <ArrowUpRight size={15} aria-hidden="true" />
      </a>
    </section>

    <section className={s.closing}>
      <h2>Built for the people who love the water.</h2>
      <p>Swimmers, parents, surfers, and anyone who gets in the water deserve information they can understand and use. We’re starting in the Los Angeles region and building Neptune with feedback from the communities who use these beaches.</p>
      <div className={s.ctaRow}>
        <Link className={s.ctaPrimary} href="/california">
          Check your beach
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
        <a className={s.ctaSecondary} href={`mailto:${CONTACT}?subject=${SHARE_SUBJECT}&body=${SHARE_BODY}`}>
          Share your story
        </a>
      </div>
    </section>
  </>;
}
