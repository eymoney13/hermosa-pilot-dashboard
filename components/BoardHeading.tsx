import { formatMonthDayYear } from "@/lib/data";

// "Boston, MA" -> "Boston". The label carries the state so a tab reading
// "Boston, MA" is unambiguous next to "Hermosa Beach, CA", but as a heading over
// a board the state is noise: the reader already knows which one they opened.
function placeName(label: string): string {
  return label.split(",")[0].trim() || label;
}

/**
 * The heading over a whole-board view: what the readings are called, then which
 * coast and which day.
 *
 * Shared by the List and the Map because they are two presentations of one
 * thing. The Map had no heading at all, which left the brand on one tab and not
 * the other and the date nowhere at all once the page header scrolled away.
 *
 * Boards that publish no number are headed by their place instead. "Neptune
 * Index" names a score, and a board showing Good/Moderate/Poor against its own
 * cutoffs is not showing one.
 */
export default function BoardHeading({
  locationLabel,
  date,
  binaryVerdict,
}: {
  locationLabel: string;
  date?: string;
  binaryVerdict: boolean;
}) {
  const place = placeName(locationLabel);
  return (
    <header>
      <h2
        className="text-2xl font-semibold tracking-tight"
        style={{ color: "#2C8487" }}
      >
        {binaryVerdict ? place : "Neptune Index"}
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        {binaryVerdict ? null : place}
        {binaryVerdict || !date ? null : " · "}
        {date ? formatMonthDayYear(date) : null}
      </p>
    </header>
  );
}
