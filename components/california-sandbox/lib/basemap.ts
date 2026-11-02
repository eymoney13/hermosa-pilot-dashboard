// The CARTO basemap both maps draw on. Shared so the overview and the beach
// map cannot end up on different tiles — or, once CARTO started requiring a
// key, with one of them still watermarked.

// CARTO now stamps "API KEY REQUIRED" across unkeyed raster tiles. The key is
// public by nature: it travels in every tile URL the browser requests, so it
// buys no secrecy. It lives in the environment anyway so this public repo does
// not carry it and rotating it does not need a code change.
//
// Read as a whole `process.env.X` expression — Next.js inlines NEXT_PUBLIC_
// vars by literal substitution at build time, so a dynamic lookup would not be
// replaced and would arrive in the browser as undefined.
const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY;

/** Tile URL for Leaflet, keyed when the environment supplies one. */
export const BASEMAP_URL =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" +
  (CARTO_KEY ? `?key=${CARTO_KEY}` : "");

// Required by the free tier: CARTO and OpenStreetMap credit stays on the map.
export const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

export const BASEMAP_SUBDOMAINS = "abcd";
export const BASEMAP_MAX_ZOOM = 19;
