"use client";

import dynamic from "next/dynamic";
import type { BeachData } from "@/lib/data";

const OverviewMap = dynamic(() => import("./OverviewMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-gray-100" aria-hidden="true" />
  ),
});

export default function OverviewMapClient({
  beaches,
  fallbackCenter,
  hidePercent,
  onSelect,
}: {
  beaches: BeachData[];
  fallbackCenter: [number, number];
  hidePercent: boolean;
  onSelect: (code: string) => void;
}) {
  return (
    <div className="h-[460px] w-full sm:h-[560px]">
      <OverviewMap
        beaches={beaches}
        fallbackCenter={fallbackCenter}
        hidePercent={hidePercent}
        onSelect={onSelect}
      />
    </div>
  );
}
