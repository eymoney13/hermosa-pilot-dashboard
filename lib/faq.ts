/**
 * The questions readers actually ask about a forecast, and their answers.
 *
 * Copied from projectneptune.co/faq rather than linked to it. The dashboard
 * lives on its own subdomain and plenty of readers arrive straight here from an
 * alert email or a shared link, never touching the marketing site, so it has to
 * be able to answer for itself. The cost is a second copy that can drift; this
 * module is the whole of that copy, so keeping the two in step is one file to
 * edit rather than a hunt through components.
 *
 * `id` is a URL fragment, not decoration: three places in the UI raise one of
 * these questions and link straight to its answer (see FAQ_LINKS below). An id
 * is therefore a published address. Rewording a question is free; renaming an
 * id breaks whatever points at it.
 */
export interface FaqItem {
  id: string;
  question: string;
  /** Paragraphs, in order. Most answers are one. */
  answer: string[];
}

export const FAQ: FaqItem[] = [
  {
    id: "what-is-project-neptune",
    question: "What is Project Neptune?",
    answer: [
      "Project Neptune is an ocean water quality forecasting platform for beaches. We predict the probability that a beach will exceed safe bacteria levels before it happens, so beachgoers and municipalities can make informed decisions in real time rather than waiting days for lab results.",
    ],
  },
  {
    id: "how-it-works",
    question: "How does the prediction work?",
    answer: [
      "We use a machine learning model trained on historical water quality data combined with live environmental inputs: rainfall, wave conditions, river and storm-drain flow, tides, and ocean data from sources like NOAA, USGS, and CDIP. The model learns the patterns that typically precede high-bacteria days and estimates the likelihood of an exceedance.",
    ],
  },
  {
    id: "what-we-test-for",
    question: "What do you test for?",
    answer: [
      "We test for enterococcus. While we do not physically test ourselves, we utilize 30 years of historical data to power our predictions. Enterococcus samples have been collected at U.S. coastal regions since 1997, when the EPA Beach Act went into effect. The Act requires coastal municipalities, usually counties, to collect water samples from beaches on a weekly basis.",
      "Each sample is processed in a lab for 24 to 48 hours, then posted to a web platform that feeds back to the EPA. It's a solid system for regulatory compliance, but it falls short on user experience. The data is hard to access, and by the time a beachgoer sees it, it's already stale for deciding whether to go in the water.",
    ],
  },
  {
    id: "what-is-enterococcus",
    question: "What is enterococcus?",
    answer: [
      "Enterococcus is the fecal indicator bacteria widely accepted as the standard for measuring ocean contamination that can make people sick. Think: trace presence of feces in the water. Enterococcus itself isn't harmful, but it signals the likely presence of other pathogens, like staphylococcus, that can cause illness.",
    ],
  },
  {
    id: "accuracy",
    question: "How accurate is the model?",
    answer: [
      "Our model is evaluated on its ability to distinguish safe from unsafe days, and it performs well on that measure, but no forecast is perfect. We're transparent about accuracy and continually validate predictions against real measured results. Project Neptune is a decision-support tool, not a substitute for official advisories or your own judgment.",
    ],
  },
  {
    id: "lab-lag",
    question: 'What is the "lab lag" problem?',
    answer: [
      "Lab lag is the multi-day delay between when a water sample is taken and when results are available. During that window, beaches can be open with dangerous water, or closed when the water has already cleared. Our model is built specifically to address this delay.",
    ],
  },
  {
    id: "health-risks",
    question:
      "What are the actual health risks of swimming in contaminated ocean water?",
    answer: [
      "Swimming in water with elevated bacteria is associated with gastrointestinal illness, skin rashes, and ear, eye, and respiratory infections. Decades of public health research have linked higher fecal-indicator bacteria levels to higher rates of swimmer illness. Children, the elderly, and people with weakened immune systems face greater risk.",
    ],
  },
  {
    id: "official-advisories",
    question: "Is this a substitute for official government advisories?",
    answer: [
      "No. Project Neptune complements official monitoring; it does not replace it. If a government agency has posted a closure or advisory, follow it. Our goal is to give you better information faster, especially in the gap between lab samples.",
    ],
  },
];

/**
 * The answers the dashboard itself points at, by the question each surface
 * provokes. An FAQ filed at the bottom of a page is read by almost nobody; one
 * offered at the moment the question occurs is read by the person asking it.
 *
 * Named rather than inlined so that a moved or renamed answer breaks the build
 * here instead of quietly turning three links into dead fragments.
 */
export const FAQ_LINKS = {
  /** Beside the probability readout, which names bacteria without naming which. */
  whatWeMeasure: "what-is-enterococcus",
  /** Beside the forecast-accuracy panel, which shows a hit rate and no context. */
  accuracy: "accuracy",
  /** Beside the footer's advisory line, which is this answer in one sentence. */
  officialAdvisories: "official-advisories",
} as const;

/** Link to one answer on the FAQ page. */
export function faqHref(id: string): string {
  return `/faq#${id}`;
}
