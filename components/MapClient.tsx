"use client";

import dynamic from "next/dynamic";
import type { BeachData } from "@/lib/data";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-gray-100" aria-hidden="true" />
  ),
});

export default function MapClient({
  beaches,
  selectedCode,
  fallbackCenter,
}: {
  beaches: BeachData[];
  selectedCode?: string;
  fallbackCenter: [number, number];
}) {
  return (
    <div className="h-[300px] w-full">
      <MapView
        beaches={beaches}
        selectedCode={selectedCode}
        fallbackCenter={fallbackCenter}
      />
    </div>
  );
}
