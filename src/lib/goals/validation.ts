import type { ClientGoalMetricType } from "@/types";

export function parseClientGoalValue(value: FormDataEntryValue | string | null, metricType: ClientGoalMetricType) {
  if (typeof value !== "string") return null;
  let normalized = value.trim().replace(/R\$/gi, "").replace(/\s/g, "");
  const currency = metricType === "REVENUE" || metricType === "AVERAGE_TICKET";

  if (currency) {
    if (normalized.includes(",")) normalized = normalized.replace(/\./g, "").replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  } else if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 999_999_999_999.99) return null;
  if (!currency && !Number.isSafeInteger(parsed)) return null;
  return parsed;
}
