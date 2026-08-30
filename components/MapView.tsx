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
import { VERDICT_AS_STATUS, type BeachData } from "@/lib/data";
import {
  BASEMAP_ATTRIBUTION,
  BASEMAP_MAX_ZOOM,
  BASEMAP_SUBDOMAINS,
  BASEMAP_URL,
} from "@/lib/basemap";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: () => string })._getIconUrl;

function colorFor(status: BeachData["status"]) {
  if (status === "Not recommended") return "#cc3333";
  if (status === "Slightly elevated") return "#D5C82E";
  return "#2d8a4e";
}

// What a pin says and how it is coloured. Binary boards read Good/Poor off the
// beach's own cutoff so the map agrees with the card; everything else keeps the
// 3-tier status.
function readingFor(beach: BeachData, binaryVerdict: boolean) {
  if (binaryVerdict && beach.verdict) {
    return {
      label: beach.verdict,
      color: colorFor(VERDICT_AS_STATUS[beach.verdict]),
    };
  }
  return { label: beach.status, color: colorFor(beach.status) };
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
  hidePercent,
  binaryVerdict,
}: {
  beaches: BeachData[];
  selectedCode?: string;
  fallbackCenter: [number, number];
  hidePercent: boolean;
  binaryVerdict: boolean;
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
        url={BASEMAP_URL}
        attribution={BASEMAP_ATTRIBUTION}
        subdomains={BASEMAP_SUBDOMAINS}
        maxZoom={BASEMAP_MAX_ZOOM}
      />
      {selected && <PanTo lat={selected.latitude} lon={selected.longitude} />}
      {beaches.map((b) => {
        const { label, color } = readingFor(b, binaryVerdict);
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
              {/* Colon, not a hyphen: the beach name may already contain one
                  ("Carson Beach - South Boston"), and a second would read as
                  part of the name rather than as a separator. */}
              <span style={{ fontWeight: 500 }}>{b.name}</span>: {label}
            </Tooltip>
            <Popup>
              <div style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{b.name}</div>
                <div style={{ color, fontWeight: 500, marginBottom: 4 }}>
                  {label}
                </div>
                {/* Binary boards hide the probability everywhere, popups
                    included — the card's summary is where the number speaks. */}
                {!binaryVerdict && (
                  <div style={{ fontSize: 12, color: "#555" }}>
                    {pct}
                    {hidePercent ? "" : "%"} probability of unsafe bacteria
                    levels
                  </div>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
