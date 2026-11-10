type MapSurface = {
  getContainer: () => HTMLElement;
  on: (event: "dragend", handler: () => void) => unknown;
  off: (event: "dragend", handler: () => void) => unknown;
};

// Leaflet dragend is a user drag; fitBounds/panTo do not emit it.
// Track zoom inputs directly, never automatic zoomend/moveend events.
export function trackMapInteractions(map: MapSurface, capture: (type: "pan" | "zoom") => void) {
  const container = map.getContainer();
  const seen = new Set<string>();
  const record = (type: "pan" | "zoom") => {
    if (seen.has(type)) return;
    seen.add(type);
    capture(type);
  };
  const pan = () => record("pan");
  const click = (event: Event) => {
    if (event.isTrusted && event.target instanceof Element && event.target.closest(".leaflet-control-zoom")) record("zoom");
  };
  const doubleClick = (event: Event) => { if (event.isTrusted) record("zoom"); };
  const touch = (event: TouchEvent) => { if (event.isTrusted && event.touches.length >= 2) record("zoom"); };
  const key = (event: KeyboardEvent) => {
    if (!event.isTrusted || event.target !== container) return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) record("pan");
    if (["+", "-", "="].includes(event.key)) record("zoom");
  };
  map.on("dragend", pan);
  container.addEventListener("click", click);
  container.addEventListener("dblclick", doubleClick);
  container.addEventListener("touchstart", touch, { passive: true });
  container.addEventListener("keydown", key);
  return () => {
    map.off("dragend", pan);
    container.removeEventListener("click", click);
    container.removeEventListener("dblclick", doubleClick);
    container.removeEventListener("touchstart", touch);
    container.removeEventListener("keydown", key);
  };
}
