import type { Metadata } from "next";
import Link from "next/link";
import ProjectNeptuneLogo from "@/components/ProjectNeptuneLogo";
import { FAQ } from "@/lib/faq";

export const metadata: Metadata = {
  title: "FAQ · Project Neptune",
  description:
    "How Project Neptune forecasts ocean water quality: what we measure, how accurate it is, and how it relates to official beach advisories.",
};

// A plain document, deliberately: every answer open, no client JavaScript.
//
// Someone who navigated here wants to read, not to click eight more times, and
// the three deep links on the dashboard (see FAQ_LINKS) have to land on text
// that is already on the page. An accordion would put each answer behind a
// toggle the link cannot press. The dashboard's own copy folds them, because
// there the FAQ is a footnote to the forecast rather than the page itself.
//
// Not under /[location]: the answers are the same on every board. A static
// segment beats the dynamic one in Next's router, so /faq resolves here rather
// than being read as a location slug.
export default function FaqPage() {
  return (
    <main className="flex flex-col">
      <header className="w-full border-b border-gray-100">
        <div className="mx-auto max-w-3xl px-6 sm:px-10 py-5">
          <a href="https://projectneptune.co" className="inline-flex items-center">
            <ProjectNeptuneLogo size={24} />
          </a>
          <p
            className="pl-0.5 text-[13px] leading-tight"
            style={{
              fontFamily: "var(--font-poppins), sans-serif",
              fontWeight: 700,
              color: "#2C8487",
            }}
          >
            Ocean Water Quality
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-6 sm:px-10 py-10">
        <h1 className="text-2xl font-medium text-gray-900">
          Frequently asked questions
        </h1>

        <div className="mt-8 space-y-8">
          {FAQ.map((item) => (
            // scroll-mt so a deep-linked answer clears the top of the window
            // instead of sitting flush against it.
            <section key={item.id} id={item.id} className="scroll-mt-6">
              <h2 className="text-base font-medium text-gray-900">
                {item.question}
              </h2>
              <div className="mt-2 space-y-3">
                {item.answer.map((para, i) => (
                  <p key={i} className="text-sm leading-relaxed text-gray-600">
                    {para}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* The way back. A reader who arrived from a card's "what is this"
            link has left their beach behind, and the browser's back button is
            the only other route to it. */}
        <div className="mt-12 border-t border-gray-100 pt-6">
          <Link
            href="/"
            className="text-sm text-[#2C8487] underline hover:text-[#1f6366]"
          >
            Back to the dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
