"use client";

import dynamic from "next/dynamic";
import type { BeachData, Status } from "@/lib/data";

const OverviewMap = dynamic(() => import("./OverviewMap"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-full w-full items-center justify-center bg-gray-100 text-sm text-gray-600"
      role="status"
    >
      Loading map…
    </div>
  ),
});

export default function OverviewMapClient({
  beaches,
  fallbackCenter,
  binaryVerdict,
  labelMinZoom = 0,
  locateNearby = false,
  statusPhrase,
  onSelect,
}: {
  beaches: BeachData[];
  fallbackCenter: [number, number];
  binaryVerdict: boolean;
  labelMinZoom?: number;
  locateNearby?: boolean;
  /** Spoken and hover name for a pin, e.g. "Over the limit". The drawn pill stays short. */
  statusPhrase?: (status: Status) => string;
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
        statusPhrase={statusPhrase}
        onSelect={onSelect}
      />
    </div>
  );
}
