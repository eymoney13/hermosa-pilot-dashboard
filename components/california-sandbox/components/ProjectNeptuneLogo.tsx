// Inline-SVG wordmark for "Project Neptune". Renders all-caps in Poppins 700
// (loaded as the --font-poppins CSS variable in app/layout.tsx) with no outline.
// `size` is the font-size in px.

export default function ProjectNeptuneLogo({
  size = 24,
}: {
  size?: number;
}) {
  // Generous box so the wordmark never clips; overflow is visible regardless.
  const width = size * 10.5;
  const height = size * 1.35;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Project Neptune"
      style={{ overflow: "visible", display: "block" }}
    >
      <text
        x={size * 0.1}
        y={height / 2}
        dominantBaseline="central"
        fontFamily="var(--font-poppins), sans-serif"
        fontWeight={700}
        fontSize={size}
        fill="#2C8487"
      >
        PROJECT NEPTUNE
      </text>
    </svg>
  );
}
