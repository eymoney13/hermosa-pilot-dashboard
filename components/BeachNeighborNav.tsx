"use client";

import { ArrowUp, ArrowDown } from "lucide-react";
import { nearestBeachNeighbors, type BeachLocation } from "@/lib/beachNeighbors";
import s from "./BeachNeighborNav.module.css";

export default function BeachNeighborNav({ beach, beaches, onSelect }: {
  beach: BeachLocation;
  beaches: BeachLocation[];
  onSelect: (code: string) => void;
}) {
  const { north, south } = nearestBeachNeighbors(beach, beaches);
  if (beaches.length < 2) return null;

  return <nav className={s.nav} aria-label="Neighboring beaches">
    {([{ direction: "North", neighbor: north, Icon: ArrowUp }, { direction: "South", neighbor: south, Icon: ArrowDown }] as const).map(({ direction, neighbor, Icon }) => (
      <button
        key={direction}
        type="button"
        disabled={!neighbor}
        onClick={() => neighbor && onSelect(neighbor.code)}
        aria-label={neighbor ? `${direction}: ${neighbor.name}` : `No beach farther ${direction.toLowerCase()}`}
      >
        <Icon size={19} aria-hidden="true" />
        <span><strong>{direction}</strong><span>{neighbor?.name ?? `No beach farther ${direction.toLowerCase()}`}</span></span>
      </button>
    ))}
  </nav>;
}
