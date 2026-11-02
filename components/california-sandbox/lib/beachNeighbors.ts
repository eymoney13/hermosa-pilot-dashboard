export interface BeachLocation {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
}

function hasCoordinates(beach: BeachLocation) {
  return Number.isFinite(beach.latitude) && Math.abs(beach.latitude) <= 90
    && Number.isFinite(beach.longitude) && Math.abs(beach.longitude) <= 180;
}

// Haversine score is monotonic with distance; no conversion to miles needed.
function distanceScore(a: BeachLocation, b: BeachLocation) {
  const rad = Math.PI / 180;
  return Math.sin((b.latitude - a.latitude) * rad / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad)
    * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
}

export function nearestBeachNeighbors<T extends BeachLocation>(beach: T, beaches: T[]) {
  let north: T | undefined;
  let south: T | undefined;
  if (!hasCoordinates(beach)) return { north, south };

  const closer = (candidate: T, current: T | undefined) => {
    if (!current) return true;
    const difference = distanceScore(beach, candidate) - distanceScore(beach, current);
    return difference < 0 || (difference === 0 && candidate.code < current.code);
  };

  for (const candidate of beaches) {
    if (candidate.code === beach.code || !hasCoordinates(candidate)) continue;
    if (candidate.latitude > beach.latitude && closer(candidate, north)) north = candidate;
    if (candidate.latitude < beach.latitude && closer(candidate, south)) south = candidate;
  }
  return { north, south };
}
