"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import type { BeachData } from "@/lib/data";

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
function dotIcon(beach: BeachData, hidePercent: boolean): L.DivIcon {
  const num = Math.round(Math.max(0, Math.min(1, beach.probability)) * 100);
  const bg = colorFor(beach.status);
  const fg = textColorFor(beach.status);
  const label = `${num}${hidePercent ? "" : "%"}`;
  const html = `<div class="nb-overview-dot" style="background:${bg};color:${fg}">${label}</div>`;
  return L.divIcon({
    html,
    className: "nb-overview-icon",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
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
  onSelect,
}: {
  beaches: BeachData[];
  fallbackCenter: [number, number];
  hidePercent: boolean;
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
          icon={dotIcon(b, hidePercent)}
          eventHandlers={{ click: () => onSelect(b.code) }}
          keyboard
        >
          <Tooltip direction="bottom" offset={[0, 20]} opacity={1} permanent>
            <span style={{ fontWeight: 600, fontSize: 11 }}>{b.name}</span>
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
