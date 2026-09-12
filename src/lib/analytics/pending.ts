export type PendingDayInput = {
  date: string;
  chargeable: boolean;
  requiredSourceIds: readonly string[];
  reportedSourceIds: readonly string[];
};

export function getPendingDates(days: readonly PendingDayInput[]) {
  return days
    .filter((day) => day.chargeable && day.requiredSourceIds.length > 0 && day.requiredSourceIds.some((id) => !day.reportedSourceIds.includes(id)))
    .map((day) => day.date)
    .sort();
}
