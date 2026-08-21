"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
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
        >
          <Tooltip
            direction="left"
            offset={[binaryVerdict ? -12 : -22, 0]}
            opacity={1}
            permanent
          >
            <span style={{ fontWeight: 600, fontSize: 11 }}>{b.name}</span>
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
