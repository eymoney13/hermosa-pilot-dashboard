"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Tooltip,
  Popup,
  useMap,
} from "react-leaflet";
import type { BeachData } from "@/lib/data";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: () => string })._getIconUrl;

function colorFor(status: BeachData["status"]) {
  if (status === "Not recommended") return "#cc3333";
  if (status === "Slightly elevated") return "#D5C82E";
  return "#2d8a4e";
}

function PanTo({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], map.getZoom(), { duration: 0.6 });
  }, [lat, lon, map]);
  return null;
}

export default function MapView({
  beaches,
  selectedCode,
  fallbackCenter,
}: {
  beaches: BeachData[];
  selectedCode?: string;
  fallbackCenter: [number, number];
}) {
  const selected = beaches.find((b) => b.code === selectedCode) ?? beaches[0];
  const center = useMemo<[number, number]>(() => {
    if (selected) return [selected.latitude, selected.longitude];
    if (beaches.length === 0) return fallbackCenter;
    const avgLat =
      beaches.reduce((s, b) => s + b.latitude, 0) / beaches.length;
    const avgLon =
      beaches.reduce((s, b) => s + b.longitude, 0) / beaches.length;
    return [avgLat, avgLon];
  }, [beaches, selected, fallbackCenter]);

  return (
    <MapContainer
      center={center}
      zoom={14}
      scrollWheelZoom={false}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={19}
      />
      {selected && <PanTo lat={selected.latitude} lon={selected.longitude} />}
      {beaches.map((b) => {
        const color = colorFor(b.status);
        const pct = Math.round(b.probability * 100);
        const isSelected = b.code === selected?.code;
        return (
          <CircleMarker
            key={b.code}
            center={[b.latitude, b.longitude]}
            radius={isSelected ? 11 : 7}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: color,
              fillOpacity: isSelected ? 1 : 0.55,
            }}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={1}>
              <span style={{ fontWeight: 500 }}>{b.name}</span> — {b.status}
            </Tooltip>
            <Popup>
              <div style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{b.name}</div>
                <div style={{ color, fontWeight: 500, marginBottom: 4 }}>
                  {b.status}
                </div>
                <div style={{ fontSize: 12, color: "#555" }}>
                  {pct}% probability of unsafe bacteria levels
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
