import { ExternalLink, Newspaper } from "lucide-react";
import type { NewsItem } from "@/lib/news";

// Human-friendly date for a feed timestamp; falls back to the raw value if it
// isn't parseable, and to nothing if absent.
function formatPublished(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function NewsTab({ items }: { items: NewsItem[] }) {
  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 sm:px-10 py-12 text-center">
        <Newspaper className="mx-auto h-6 w-6 text-gray-300" aria-hidden="true" />
        <p className="mt-3 text-sm text-gray-500">
          No recent articles. New coverage will appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 sm:px-10 py-6">
      <ul className="divide-y divide-gray-100">
        {items.map((item) => {
          const date = formatPublished(item.published);
          return (
            <li key={item.id} className="py-4">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-medium text-gray-900 group-hover:text-[#2C8487] transition-colors">
                    {item.title}
                  </h3>
                  <ExternalLink
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-300 group-hover:text-[#2C8487] transition-colors"
                    aria-hidden="true"
                  />
                </div>
                {(item.source || date) && (
                  <p className="mt-1 text-xs text-gray-500">
                    {item.source}
                    {item.source && date ? " · " : ""}
                    {date}
                  </p>
                )}
                {item.snippet && (
                  <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">
                    {item.snippet}
                  </p>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
