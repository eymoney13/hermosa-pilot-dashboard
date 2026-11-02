// Active California coverage. Keep station identifiers intact (including spaces).
const supportedStations = new Set([
  // Los Angeles County
  "DPH 002B", "DHS103", "DHS104", "SMB-3-5", "SMB-3-6", "DPH 122",
  "SMB-2-10", "SMB-2-11", "SMB-2-13", "DHS112B", "DHS113", "DHS114",
  "DHS115", "DHS116", "SMB-7-9",
  // Orange County
  "OSB04", "0", "BNB05", "DSB4Z",
]);

export function isCoveredStation(location: string, code: string): boolean {
  return !["california", "sandbox", "southbay"].includes(location) || supportedStations.has(code);
}
