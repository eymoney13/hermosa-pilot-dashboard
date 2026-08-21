"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import { VERDICT_AS_STATUS, type BeachData } from "@/lib/data";

function colorFor(status: BeachData["status"]) {
  if (status === "Not recommended") return "#cc3333";
  if (status === "Slightly elevated") return "#D5C82E";
  return "#2d8a4e";
}

// Dark yellow text needs a dark number for contrast; the green/red dots take white.
function textColorFor(status: BeachData["status"]) {
  return status === "Slightly elevated" ? "#3f3a05" : "#ffffff";
}

// A pill-shaped marker with today's prediction number inside — the at-a-glance
// read for the whole region. Built as a divIcon so we can render real text
// (CircleMarker is SVG-only and can't hold a centered label).
//
// Binary boards show no number: the marker is a plain coloured dot, and the
// beach name already sits beside it in a permanent tooltip.
function dotIcon(
  beach: BeachData,
  hidePercent: boolean,
  binaryVerdict: boolean
): L.DivIcon {
  const verdict = binaryVerdict ? beach.verdict : null;
  const status = verdict ? VERDICT_AS_STATUS[verdict] : beach.status;
  const bg = colorFor(status);
  const fg = textColorFor(status);
  const label = verdict
    ? ""
    : `${Math.round(Math.max(0, Math.min(1, beach.probability)) * 100)}${
        hidePercent ? "" : "%"
      }`;
  const size = verdict ? 20 : 40;
  const cls = verdict ? "nb-overview-dot nb-overview-dot--plain" : "nb-overview-dot";
  const html = `<div class="${cls}" style="background:${bg};color:${fg}">${label}</div>`;
  return L.divIcon({
    html,
    className: "nb-overview-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// ---------------------------------------------------------------------------
// Label placement
// ---------------------------------------------------------------------------
// Every label used to hang off the left of its dot at a fixed offset, so any two
// beaches within a label's width of each other stacked on top of one another —
// on the Boston board, Winthrop/Short/Constitution and the three Dorchester
// beaches were mutually unreadable. These beaches genuinely sit that close
// together, so the fix is to place the labels rather than to nudge the offset.
//
// Labels carry the full roster name, town and all ("Carson Beach — South
// Boston"). Shortening them would make placement easier, but the town is part
// of how a beach is identified everywhere else on the board, and a map label
// that disagrees with the tab above it is its own small confusion. Placement
// absorbs the extra width instead.

const LABEL_FONT = "600 11px ui-sans-serif, system-ui, -apple-system, sans-serif";
const LABEL_PAD_X = 6;
const LABEL_PAD_Y = 3;
const LABEL_HEIGHT = 18;
// The 1px border on each side of .nb-map-label. Small, but it is the difference
// between a label placed flush against the map edge fitting and overflowing it.
const LABEL_BORDER = 2;
// Keep labels this far off the map edge. Flush against it is technically inside
// and still reads as clipped.
const EDGE_MARGIN = 2;
// Keep placed labels this far apart, so near-misses still read as separate.
const LABEL_GAP = 2;

// Measure once per string with a canvas rather than estimating from character
// count: "M Street Beach" and "Malibu Beach" are the same length and noticeably
// different widths, and guessing wrong here means either overlap or wasted space.
let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(text: string): number {
  if (typeof document === "undefined") return text.length * 6.2;
  if (!measureCtx) {
    measureCtx = document.createElement("canvas").getContext("2d");
    if (measureCtx) measureCtx.font = LABEL_FONT;
  }
  return measureCtx ? measureCtx.measureText(text).width : text.length * 6.2;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w + LABEL_GAP &&
    a.x + a.w + LABEL_GAP > b.x &&
    a.y < b.y + b.h + LABEL_GAP &&
    a.y + a.h + LABEL_GAP > b.y
  );
}

// Where a label may sit relative to its dot, in preference order: beside first
// (easiest to associate with the dot), then above/below, then the diagonals.
// [dx, dy] is the offset of the label's CENTRE from the dot centre, scaled by
// the ring radius.
const CANDIDATE_DIRECTIONS: Array<[number, number]> = [
  [-1, 0], [1, 0],
  [0, -1], [0, 1],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
];

// Rings to try, in pixels. Later rings push a crowded label further out; the
// connector line drawn for anything past the first ring keeps it attributable.
const CANDIDATE_RINGS = [1, 1.7, 2.6, 3.8];

export interface LabelPlacement {
  code: string;
  text: string;
  /** Offset of the label's top-left from the dot, in container pixels. */
  dx: number;
  dy: number;
  w: number;
  /** True when the label sits far enough out to need a connector line. */
  tethered: boolean;
  /** Which candidate produced this, so the next pass can prefer it again. */
  dir: number;
  ring: number;
}

/**
 * Greedy label placement in screen space.
 *
 * Beaches are placed most-crowded-first: a beach with neighbours close by has
 * the fewest workable positions, so letting a beach with open space around it
 * claim a spot first is how you end up with no room for the one that needed it.
 * Each label takes the first candidate that clears every label already placed
 * and every dot on the map. If nothing clears — which needs a genuinely dense
 * cluster — it takes the outermost ring anyway: an overlapping label is still
 * better than a missing one.
 */
function placeLabels(
  map: L.Map,
  beaches: BeachData[],
  dotRadius: number,
  previous: Map<string, { dir: number; ring: number }>
): LabelPlacement[] {
  const points = beaches.map((b) => ({
    beach: b,
    pt: map.latLngToContainerPoint([b.latitude, b.longitude]),
  }));

  // The map's own box. A label that clears every neighbour but hangs off the
  // edge of the map is still unreadable, and on a narrow viewport that is the
  // common case rather than the rare one — the labels are a fixed width while
  // the map shrinks around them.
  const size = map.getSize();

  // Beaches whose dot is off-screen (or nearly) take no part in placement. They
  // matter because zooming in pushes most dots outside the viewport, and the
  // in-bounds rule below would otherwise drag every one of their labels back
  // into the visible box, where they pile up on each other — the labels for
  // beaches you cannot even see crowding out the ones you can. Off-screen labels
  // keep a default offset beside their dot and are simply not visible.
  // Deliberately small. A generous margin lets dots that are just outside the
  // viewport still claim in-bounds label positions, which crowds the edges with
  // labels for beaches the reader cannot see.
  const MARGIN = 8;
  const onScreen = (pt: L.Point) =>
    pt.x > -MARGIN && pt.y > -MARGIN && pt.x < size.x + MARGIN && pt.y < size.y + MARGIN;

  // Crowding = how many other dots sit within a label's reach.
  const visible = points.map(({ pt }) => onScreen(pt));

  const crowding = points.map(({ pt }) =>
    points.reduce((n, other) => {
      const d = Math.hypot(other.pt.x - pt.x, other.pt.y - pt.y);
      return d > 0 && d < 90 ? n + 1 : n;
    }, 0)
  );
  const order = points
    .map((_, i) => i)
    .sort((a, b) => crowding[b] - crowding[a]);

  // Dots are obstacles too — a label across another beach's marker hides it.
  const dotRects: Rect[] = points
    .filter((_, i) => visible[i])
    .map(({ pt }) => ({
      x: pt.x - dotRadius,
      y: pt.y - dotRadius,
      w: dotRadius * 2,
      h: dotRadius * 2,
    }));

  const placed: Rect[] = [];
  const out: LabelPlacement[] = [];
  const fits = (rect: Rect) =>
    rect.x >= EDGE_MARGIN &&
    rect.y >= EDGE_MARGIN &&
    rect.x + rect.w <= size.x - EDGE_MARGIN &&
    rect.y + rect.h <= size.y - EDGE_MARGIN &&
    !placed.some((q) => overlaps(rect, q)) &&
    !dotRects.some((q) => overlaps(rect, q));

  for (const i of order) {
    const { beach, pt } = points[i];
    const text = beach.name;

    if (!visible[i]) {
      // Off-screen: park it beside the dot and move on. No collision
      // bookkeeping, so it cannot displace anything that is actually in view.
      const w = textWidth(text) + LABEL_PAD_X * 2 + LABEL_BORDER;
      const h = LABEL_HEIGHT + LABEL_PAD_Y + LABEL_BORDER;
      out.push({
        code: beach.code,
        text,
        dx: -(dotRadius + 6 + w),
        dy: -h / 2,
        w,
        tethered: false,
        dir: 0,
        ring: 0,
      });
      continue;
    }

    const w = textWidth(text) + LABEL_PAD_X * 2 + LABEL_BORDER;
    const h = LABEL_HEIGHT + LABEL_PAD_Y + LABEL_BORDER;

    // Candidates in preference order, with one exception: whatever this label
    // used last time is tried FIRST. Zoom changes the pixel distances between
    // beaches so the layout genuinely has to be redone, but most labels can
    // usually keep the spot they already had, and a set that mostly stays put
    // reads as a stable map rather than one that reshuffles on every zoom.
    //
    // This only reorders the search. The greedy pass is otherwise unchanged, so
    // packing cannot come out worse than it would have — unlike reserving old
    // positions up front, which starves later labels and forces overlaps.
    const prev = previous.get(beach.code);
    const candidates: Array<[number, number]> = [];
    if (prev) candidates.push([prev.ring, prev.dir]);
    for (let r = 0; r < CANDIDATE_RINGS.length; r++) {
      for (let d = 0; d < CANDIDATE_DIRECTIONS.length; d++) {
        if (prev && prev.ring === r && prev.dir === d) continue;
        candidates.push([r, d]);
      }
    }

    let best: { dx: number; dy: number; ring: number; dir: number } | null = null;
    const reach = dotRadius + 6;
    for (const [r, d] of candidates) {
      const [ux, uy] = CANDIDATE_DIRECTIONS[d];
      // Offset the label centre far enough that its own box clears the dot.
      const cx = pt.x + ux * (reach + (w / 2) * Math.abs(ux)) * CANDIDATE_RINGS[r];
      const cy = pt.y + uy * (reach + (h / 2) * Math.abs(uy)) * CANDIDATE_RINGS[r];
      const rect: Rect = { x: cx - w / 2, y: cy - h / 2, w, h };
      if (fits(rect)) {
        best = { dx: rect.x - pt.x, dy: rect.y - pt.y, ring: r, dir: d };
        placed.push(rect);
        break;
      }
    }

    if (!best) {
      // Nothing cleared. Fall back to the first ring beside the dot and accept
      // the overlap — a label you can half-read beats one that isn't there —
      // but still clamp it inside the map, since a label pushed off the edge is
      // not readable at all.
      const cx = pt.x - (dotRadius + 6 + w / 2);
      const clamp = (v: number, span: number, box: number) =>
        Math.min(Math.max(v, EDGE_MARGIN), Math.max(box - span - EDGE_MARGIN, EDGE_MARGIN));
      const x = clamp(cx - w / 2, w, size.x);
      const y = clamp(pt.y - h / 2, h, size.y);
      const rect: Rect = { x, y, w, h };
      best = { dx: rect.x - pt.x, dy: rect.y - pt.y, ring: 1, dir: 0 };
      placed.push(rect);
    }

    out.push({
      code: beach.code,
      text,
      dx: best.dx,
      dy: best.dy,
      w,
      tethered: best.ring > 0,
      dir: best.dir,
      ring: best.ring,
    });
  }
  return out;
}

// The labels themselves, as their own markers so their pixel offset is ours to
// set — a Leaflet tooltip only exposes a fixed direction + offset, which is what
// made them collide in the first place.
function BeachLabels({
  beaches,
  dotRadius,
  onSelect,
}: {
  beaches: BeachData[];
  dotRadius: number;
  onSelect: (code: string) => void;
}) {
  const map = useMap();
  const [placements, setPlacements] = useState<LabelPlacement[]>([]);
  // Which candidate each label used last time, fed back in so placement tries
  // that spot first and most labels keep it. A ref rather than state: reading it
  // must not make recompute a new function, or the effect below would
  // resubscribe on every pass.
  const previous = useRef(new Map<string, { dir: number; ring: number }>());

  const recompute = useCallback(() => {
    const next = placeLabels(map, beaches, dotRadius, previous.current);
    previous.current = new Map(next.map((p) => [p.code, { dir: p.dir, ring: p.ring }]));
    setPlacements(next);
  }, [map, beaches, dotRadius]);

  useEffect(() => {
    // Deferred rather than called inline: placement reads container pixel
    // coordinates, and on the first effect tick the map has not finished
    // sizing itself, so measuring now would place every label against a
    // stale viewport. (It also avoids a synchronous setState inside the
    // effect, which would cascade a second render.) FitAll's fitBounds
    // fires moveend/zoomend right after, which recomputes again anyway.
    const frame = requestAnimationFrame(recompute);
    // Zoom and resize only — deliberately NOT pan.
    //
    // Panning translates every dot by the same vector, so the beaches' positions
    // relative to each other do not change and a layout that was collision-free
    // before the pan still is. Recomputing would do no useful work and would
    // reshuffle labels under the reader's cursor while they drag — labels
    // flipping from one side of their dot to the other mid-pan reads as the map
    // being unstable. The label markers are anchored to their beach's latlng, so
    // Leaflet translates them along with the dots for free.
    //
    // Zoom genuinely changes the problem: it changes the pixel distance between
    // beaches, so a layout that fitted at one zoom may not at another. Resize
    // changes the box the labels have to fit inside.
    map.on("zoomend", recompute);
    map.on("resize", recompute);
    return () => {
      cancelAnimationFrame(frame);
      map.off("zoomend", recompute);
      map.off("resize", recompute);
    };
  }, [map, recompute]);

  const byCode = useMemo(
    () => new Map(beaches.map((b) => [b.code, b])),
    [beaches]
  );

  return (
    <>
      {placements.map((p) => {
        const beach = byCode.get(p.code);
        if (!beach) return null;
        const h = LABEL_HEIGHT + LABEL_PAD_Y;
        // A connector for labels pushed past the first ring, so a reader can
        // still tell which dot a displaced label belongs to.
        const tether = p.tethered
          ? `<span class="nb-map-label-tether" style="left:${-p.dx}px;top:${-p.dy}px"></span>`
          : "";
        const icon = L.divIcon({
          className: "nb-map-label-icon",
          html:
            `${tether}<span class="nb-map-label">${escapeHtml(p.text)}</span>`,
          iconSize: [p.w, h],
          // iconAnchor is the icon point that sits on the marker's location, so
          // negating the offset puts the label's top-left at (dot + offset).
          iconAnchor: [-p.dx, -p.dy],
        });
        return (
          <Marker
            key={`label-${p.code}`}
            position={[beach.latitude, beach.longitude]}
            icon={icon}
            eventHandlers={{ click: () => onSelect(p.code) }}
            keyboard={false}
          />
        );
      })}
    </>
  );
}

// Beach names come from a backend roster, so they are escaped rather than
// interpolated raw into the divIcon's HTML.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Frame all beaches with a little breathing room so every spot is visible at once.
function FitAll({ beaches }: { beaches: BeachData[] }) {
  const map = useMap();
  useEffect(() => {
    if (beaches.length === 0) return;
    const bounds = L.latLngBounds(
      beaches.map((b) => [b.latitude, b.longitude] as [number, number])
    );
    map.fitBounds(bounds, { padding: [56, 56], maxZoom: 14 });
  }, [beaches, map]);
  return null;
}

export default function OverviewMap({
  beaches,
  fallbackCenter,
  hidePercent,
  binaryVerdict,
  onSelect,
}: {
  beaches: BeachData[];
  fallbackCenter: [number, number];
  hidePercent: boolean;
  binaryVerdict: boolean;
  onSelect: (code: string) => void;
}) {
  const center = useMemo<[number, number]>(() => {
    if (beaches.length === 0) return fallbackCenter;
    const avgLat = beaches.reduce((s, b) => s + b.latitude, 0) / beaches.length;
    const avgLon = beaches.reduce((s, b) => s + b.longitude, 0) / beaches.length;
    return [avgLat, avgLon];
  }, [beaches, fallbackCenter]);

  return (
    <MapContainer
      center={center}
      zoom={13}
      scrollWheelZoom={false}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={19}
      />
      <FitAll beaches={beaches} />
      {beaches.map((b) => (
        <Marker
          key={b.code}
          position={[b.latitude, b.longitude]}
          icon={dotIcon(b, hidePercent, binaryVerdict)}
          eventHandlers={{ click: () => onSelect(b.code) }}
          keyboard
          title={b.name}
        />
      ))}
      {/* Labels are a separate layer so they can be positioned around the dots
          rather than all hanging off the same side. Rendered after the dots so
          they stack above them. */}
      <BeachLabels
        beaches={beaches}
        dotRadius={binaryVerdict ? 10 : 20}
        onSelect={onSelect}
      />
    </MapContainer>
  );
}
