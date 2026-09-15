"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { FAQ } from "@/lib/faq";

// The FAQ as it appears on a dashboard: questions visible, answers folded away.
//
// Questions visible rather than the whole section behind one toggle. The
// questions are the useful half at a glance — a reader scanning "How accurate is
// the model?" learns that the question is answered somewhere, which is most of
// what a link would have told them, and the eight of them cost about the height
// of two beach rows. Folding the answers is what keeps that cheap.
//
// One level of disclosure, not two. A collapsed section containing collapsed
// questions makes a reader open two things to read one sentence.
//
// The /faq route renders the same content with every answer open and no
// JavaScript, because a page someone navigated to deliberately should not ask
// them to click eight more times, and a deep link has to land on text that is
// already there.
export default function FaqAccordion() {
  // Which question is open, by id. One at a time: the answers are short and a
  // reader is asking one question, so leaving the last one open just pushes the
  // next one down the page.
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="w-full border-t border-gray-100">
      <div className="mx-auto max-w-6xl px-6 sm:px-10 py-8">
        <h2 className="text-xs uppercase tracking-wider text-gray-500">
          Frequently asked questions
        </h2>

        <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
          {FAQ.map((item) => {
            const open = openId === item.id;
            const panelId = `faq-panel-${item.id}`;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : item.id)}
                  aria-expanded={open}
                  aria-controls={panelId}
                  className="flex w-full items-center justify-between gap-4 py-3 text-left text-sm text-gray-800 transition-colors hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  <span>{item.question}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${
                      open ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {/* Same grid-rows collapse the card's disclosure uses, so an
                    answer of any length animates without a measured height.
                    Nothing here needs to escape the clip, so unlike that one it
                    can stay hidden throughout. */}
                <div
                  id={panelId}
                  role="region"
                  className="grid transition-[grid-template-rows] duration-200 ease-out"
                  style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
                  aria-hidden={!open}
                >
                  <div className="overflow-hidden">
                    <div className="pb-4 pr-8 space-y-3">
                      {item.answer.map((para, i) => (
                        <p
                          key={i}
                          className="text-sm leading-relaxed text-gray-600"
                        >
                          {para}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
