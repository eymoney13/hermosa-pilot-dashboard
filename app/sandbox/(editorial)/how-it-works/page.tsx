import type { Metadata } from "next";
import { EditorialSection, PageHero } from "@/components/sandbox/SandboxEditorial";
import { EPA_MPN_THRESHOLD, RISK_TIERS } from "@/lib/data";
import s from "@/components/sandbox/SandboxEditorial.module.css";

export const metadata: Metadata = { title: "How Neptune Works · Neptune" };

// FIRST DRAFT. Copy is written to be checkable: every number on this page is
// either imported from lib/data (the tier bands, the EPA threshold) or is a
// documented property of the pipeline (once-daily refresh, three days ahead).
// Nothing claims an accuracy figure, because the board reports accuracy
// per-station and a single site-wide number would be invented.
//
// Deliberately absent: any phrasing that suggests Neptune measures water. It
// forecasts. See the FAQ, which says so outright.

const STEPS = [
  {
    title: "Learn from years of lab results",
    body: "Neptune starts with the official record: years of Enterococcus samples collected and tested by the agencies that monitor these beaches. That history is what teaches the model how a beach behaves.",
  },
  {
    title: "Add what the ocean is doing now",
    body: "Rainfall, tides, waves, river discharge, sunlight and water temperature all shift how bacteria move and survive. Neptune pulls the current readings for each beach and feeds them in alongside the history.",
  },
  {
    title: "Estimate the chance of an exceedance",
    body: `A machine-learning model weighs those conditions against what it learned and produces one number per beach: the chance that bacteria exceed the applicable safe-swimming threshold, ${EPA_MPN_THRESHOLD} MPN/100mL for ocean water.`,
  },
  {
    title: "Publish it, then check the homework",
    body: "That estimate becomes the Neptune Index you see on the board. When the next official lab result arrives, Neptune compares it against what it predicted for that day, so the track record is visible rather than asserted.",
  },
];

const COMPARE = [
  {
    kind: "A lab test",
    sub: "What the agencies do",
    points: [
      "Measures a real water sample",
      "Tells you about one spot, at the moment it was collected",
      "Takes 24–48 hours to come back",
      "Usually taken about once a week",
    ],
  },
  {
    kind: "A Neptune forecast",
    sub: "What this site does",
    points: [
      "Estimates, using conditions and past results",
      "Covers today and the next three days",
      "Updates once a day",
      "Never touches the water",
    ],
  },
];

const FAQ = [
  {
    q: "What is Enterococcus?",
    a: "A group of bacteria that lives in the guts of people and animals. It is hard to test seawater for every germ that might make you ill, so agencies test for Enterococcus instead and use it as an indicator: more of it suggests a greater chance that sewage or runoff has reached the water. Finding it does not identify any particular illness or organism. It is a signal worth paying attention to, not a diagnosis.",
  },
  {
    q: "Does Neptune collect its own water samples?",
    a: "No. Neptune does not sample, test, or measure water. Every lab result it learns from was collected by an official monitoring program. What Neptune adds is a forecast between those tests, built from that record plus current conditions.",
  },
  {
    q: "Does this replace official advisories?",
    a: "No, and it is not meant to. A posted closure or advisory comes from people who sampled that water and have the authority to act on it. Neptune is an estimate. If the two ever disagree, the official notice is the one that counts. Check it before you get in.",
  },
  {
    q: "Why does the forecast change?",
    a: "Because the ocean does. A day of rain, a big swell or a spring tide can all move the estimate, and Neptune recalculates once a day with the latest conditions. A beach that read Low yesterday can read Moderate today.",
  },
];

export default function HowItWorksPage() {
  return <>
    <PageHero
      title="How Neptune Works"
      section="About Neptune / 01"
      headline="Neptune forecasts the chance of elevated bacteria at your beach: today, and for the next three days."
      intro="No water testing kit, no lab. Just the official sampling record, the conditions driving the ocean right now, and a model that has learned how the two fit together."
    />

    <EditorialSection number="01" title="Why a forecast helps">
      <p>Official testing is the ground truth, and Neptune would not exist without it. But it has a gap built into it: samples are typically collected about once a week, and the lab needs another 24 to 48 hours to grow and count what is in them.</p>
      <p>So the number posted today describes water that was scooped up days ago. In between, it rains, tides turn, and swells arrive. That is the space a forecast fills.</p>

      {/* The gap, drawn rather than described. Two tracks on one timeline: the
          sampling track is sparse and lands late, the forecast track is
          continuous. aria-hidden with a text equivalent above, because a
          screen reader gains nothing from the dots. */}
      <div className={s.gapDiagram} aria-hidden="true">
        <div className={s.gapTrack}>
          <span className={s.gapTrackName}>Lab testing</span>
          <div className={s.gapLine}>
            <span className={s.gapSample} style={{ left: "8%" }} />
            <span className={s.gapSample} style={{ left: "50%" }} />
            <span className={s.gapSample} style={{ left: "92%" }} />
          </div>
          <span className={s.gapNote}>A sample about weekly, then 24–48h in the lab</span>
        </div>
        <div className={s.gapTrack}>
          <span className={s.gapTrackName}>Neptune</span>
          <div className={s.gapLine}><span className={s.gapFill} /></div>
          <span className={s.gapNote}>An estimate every day, plus three days ahead</span>
        </div>
      </div>
    </EditorialSection>

    <EditorialSection number="02" title="The process">
      <ol className={s.steps}>
        {STEPS.map((step, i) => (
          <li key={step.title}>
            <span className={s.stepNumber}>0{i + 1}</span>
            <div><h3>{step.title}</h3><p>{step.body}</p></div>
          </li>
        ))}
      </ol>
    </EditorialSection>

    <EditorialSection number="03" title="What the risk levels mean">
      <p>The Neptune Index is a percentage. It is our model&rsquo;s estimated probability that Enterococcus exceeds {EPA_MPN_THRESHOLD} MPN/100mL at that beach. A lower percentage means an exceedance is less likely. A higher percentage means it is more likely.</p>

      {/* Read straight off RISK_TIERS so the bands and colors here can never
          drift from the legend on the board. */}
      <ul className={s.tierKey}>
        {RISK_TIERS.map((tier) => (
          <li key={tier.label}>
            <span className={s.tierSwatch} style={{ backgroundColor: tier.color }} />
            <span className={s.tierRange} style={{ color: tier.textColor }}>{tier.range}%</span>
            <span className={s.tierName}>{tier.label}</span>
          </li>
        ))}
      </ul>

      <p>Those labels come from the relationship we see in the record. When past forecasts are lined up against the official lab results that followed them, samples predicted in the lower ranges have tended to come back with lower bacteria levels, and samples predicted in the higher ranges have tended to come back higher.</p>
      <p>So the labels describe a likelihood, and how that likelihood has borne out. They are not measured bacteria counts, and no reading here is a measurement of the water you are standing in.</p>

      <p className={s.annotation}>A Low reading means conditions look unfavorable for high bacteria, not that the water has been tested and cleared. A High reading is a reason for caution, not a closure. Official advisories and closures take precedence over anything on this page.</p>
    </EditorialSection>

    <EditorialSection number="04" title="Forecast vs. lab test">
      <p>These answer different questions, and it is worth knowing which one you are reading.</p>
      <div className={s.compare}>
        {COMPARE.map((col) => (
          <div key={col.kind} className={s.compareCol}>
            <h3>{col.kind}</h3>
            <p className={s.compareSub}>{col.sub}</p>
            <ul>{col.points.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        ))}
      </div>
      <p className={s.annotation}>One measures the past precisely. The other estimates now and next. You want both.</p>
    </EditorialSection>

    <EditorialSection number="05" title="How to use it">
      <ol className={s.useSteps}>
        {/* Heading and body wrapped together: the row is a two-column grid and
            ::before already occupies the first, so leaving these as separate
            children pushed the paragraph onto a second row 30px wide. */}
        <li><div><h3>Find your beach</h3><p>Tap it on the map, or find it in the list.</p></div></li>
        <li><div><h3>Read today, then the days ahead</h3><p>Today&rsquo;s band tells you what Neptune expects right now. The three-day outlook is for planning the weekend.</p></div></li>
        <li><div><h3>Check the official notice before you get in</h3><p>Always. A posted advisory or closure overrides anything on this page.</p></div></li>
      </ol>
    </EditorialSection>

    <aside className={s.disclaimer} aria-label="Official advisories disclaimer">
      <h2>Official advisories come first</h2>
      <p>Neptune is a forecast, not a measurement, and not a health authority. It is built to sit alongside official monitoring, to tell you something on the days between tests. It is not built to replace it. Where a public health agency has posted an advisory or closed a beach, that decision stands regardless of what Neptune estimates.</p>
    </aside>

    <EditorialSection number="06" title="Questions">
      <div className={s.faq}>
        {FAQ.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </EditorialSection>
  </>;
}
