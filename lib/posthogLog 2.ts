import "server-only";
import { SeverityNumber } from "@opentelemetry/api-logs";
import { loggerProvider } from "@/instrumentation";

type PostHogLogAttributes = Record<string, boolean | number | string>;

const logger = loggerProvider?.getLogger("neptune-dashboard-posthog");

export async function emitPostHogLog(
  body: string,
  attributes: PostHogLogAttributes
) {
  if (!logger || !loggerProvider) return;

  try {
    logger.emit({
      body,
      severityNumber: SeverityNumber.INFO,
      attributes,
    });
    await loggerProvider.forceFlush();
  } catch {
    // Log delivery must not change the result of a reader-facing action.
  }
}
