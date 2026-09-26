/**
 * The Neptune "N" wave mark, as a path.
 *
 * Traced from the original artwork (NeptuneLogo.png, 1339x1175) rather than
 * redrawn by eye, so the curve is the real one: the bitmap's ink outline was
 * contour-walked and reduced with Ramer-Douglas-Peucker to ~100 points. The
 * faceting that leaves is measured in hundredths of a pixel at the size this
 * renders and is invisible under the browser's antialiasing; it would show if
 * the mark were ever blown up to banner size, which is when it should be
 * replaced with real vector artwork from the designer.
 *
 * currentColor, not the brand navy hard-coded, so a caller sitting on a dark
 * fill can flip it without a second copy of the path. #053563 is the ink in
 * the original if a literal is ever wanted.
 *
 * Sandbox-only. /southbay renders components/BeachCard.tsx, which does not
 * import this.
 */
export default function NeptuneMark({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 72.4"
      className={className}
      fill="currentColor"
      // Decorative wherever it sits next to the name in text. A caller that
      // needs it announced passes a title.
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path d="M98.3 0.0L100.0 0.0L100.0 0.7L97.9 4.2L97.9 5.2L96.9 6.6L96.9 7.7L95.8 9.1L95.8 10.1L93.0 16.1L92.7 18.2L92.0 18.9L81.1 52.4L76.6 61.5L75.5 62.2L74.5 64.3L70.3 68.2L66.4 70.3L62.6 71.3L55.9 71.0L52.8 69.9L52.4 69.2L50.0 68.2L45.1 62.6L43.0 57.3L42.3 52.4L42.7 44.8L44.8 31.1L44.8 22.4L43.0 17.1L42.0 16.1L40.2 15.7L38.5 16.4L36.7 18.2L33.6 24.1L33.6 25.2L32.2 27.6L29.7 35.0L29.7 36.4L29.0 37.4L29.0 38.8L28.3 39.9L28.3 41.3L27.3 43.4L27.3 44.8L24.8 52.1L20.6 60.8L16.1 66.1L15.4 66.1L12.2 68.9L6.3 71.3L0.0 72.4L2.1 66.1L3.5 63.6L3.8 61.5L5.2 59.1L5.6 57.0L7.0 54.5L7.3 52.4L8.0 51.7L8.4 49.7L9.8 47.2L10.5 44.1L12.2 40.6L16.8 26.9L18.9 22.7L19.2 20.6L20.3 19.2L20.3 18.2L25.5 8.7L31.1 3.1L34.3 1.4L37.8 0.3L46.2 0.7L51.7 3.5L54.9 6.6L55.9 9.1L56.6 9.4L59.1 16.8L59.8 22.7L59.4 33.2L58.0 44.4L58.0 51.4L59.1 54.5L59.8 55.2L61.9 55.2L64.0 53.5L67.5 46.9L70.6 37.4L71.3 36.7L73.1 30.4L73.8 29.7L74.5 26.6L75.2 25.9L75.5 23.8L80.8 12.6L83.2 9.8L83.2 9.1L87.8 4.5L93.4 1.4L96.5 0.3L98.3 0.3Z" />
    </svg>
  );
}
