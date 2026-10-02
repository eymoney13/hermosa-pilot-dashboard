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
  binaryVerdict,
  labelMinZoom = 0,
  locateNearby = false,
  onSelect,
}: {
  beaches: BeachData[];
  fallbackCenter: [number, number];
  binaryVerdict: boolean;
  labelMinZoom?: number;
  locateNearby?: boolean;
  onSelect: (code: string) => void;
}) {
  return (
    <div className="h-[460px] w-full sm:h-[560px]">
      <OverviewMap
        locateNearby={locateNearby}
        beaches={beaches}
        fallbackCenter={fallbackCenter}
        labelMinZoom={labelMinZoom}
        binaryVerdict={binaryVerdict}
        onSelect={onSelect}
      />
    </div>
  );
}
