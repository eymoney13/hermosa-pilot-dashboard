"use client";

import { useState } from "react";
import type { BeachData } from "@/lib/data";
import BeachCard from "./BeachCard";
import MapClient from "./MapClient";

const STATUS_UNDERLINE: Record<string, string> = {
  Normal: "bg-[#2d8a4e]",
  "Slightly elevated": "bg-[#D5C82E]",
  "Not recommended": "bg-[#cc3333]",
};

export default function DashboardTabs({ beaches }: { beaches: BeachData[] }) {
  const [activeCode, setActiveCode] = useState<string>(
    beaches[0]?.code ?? ""
  );

  if (beaches.length === 0) return null;

  const active = beaches.find((b) => b.code === activeCode) ?? beaches[0];

  return (
    <>
      <nav className="w-full border-b border-gray-100">
        <div className="mx-auto max-w-6xl px-6 sm:px-10 flex gap-2 sm:gap-8 overflow-x-auto">
          {beaches.map((b) => {
            const isActive = b.code === active.code;
            return (
              <button
                key={b.code}
                type="button"
                onClick={() => setActiveCode(b.code)}
                aria-current={isActive ? "page" : undefined}
                className={`relative shrink-0 py-4 px-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {b.name}
                {isActive && (
                  <span
                    className={`absolute bottom-0 left-2 right-2 h-0.5 ${
                      STATUS_UNDERLINE[b.status]
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <BeachCard beach={active} />

      <section className="w-full">
        <MapClient beaches={beaches} selectedCode={active.code} />
      </section>
    </>
  );
}
