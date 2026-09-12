import type { ClientGoalMetricType, ObjectionType, ReportSourceStatus } from "@/types";

export type DateRange = { from: string; to: string };
export type PeriodPreset = "today" | "yesterday" | "last-7" | "last-15" | "last-30" | "current-month" | "previous-month" | "custom";
export type ComparisonMode = "none" | "previous-period" | "previous-month" | "custom";

export type AnalyticsFilters = {
  period: DateRange;
  periodPreset: PeriodPreset;
  comparisonMode: ComparisonMode;
  comparisonPeriod: DateRange | null;
  sourceId: string | null;
  validationMessage: string | null;
};

export type AnalyticsMetricTotals = {
  leadsReceived: number;
  leadsAnswered: number;
  leadsInterested: number;
  sales: number;
  revenueCents: number;
};

export type AnalyticsRates = {
  attendance: number;
  interest: number;
  conversion: number;
  interestedConversion: number;
  averageTicketCents: number;
};

export type AnalyticsMetrics = AnalyticsMetricTotals & AnalyticsRates;

export type AnalyticsLeadSource = {
  id: string;
  name: string;
  key: string;
  isActive: boolean;
  isPrimary: boolean;
  sortOrder: number;
  periods: Array<{ activeFrom: string; inactiveFrom: string | null }>;
};

export type AnalyticsDayStatus = "FILLED" | "PARTIAL" | "PENDING" | "NOT_REQUIRED";

export type DailyAnalytics = {
  date: string;
  metrics: AnalyticsMetrics;
  status: AnalyticsDayStatus;
  hasReportedData: boolean;
};

export type SourceAnalytics = {
  sourceId: string;
  sourceName: string;
  metrics: AnalyticsMetrics;
};

export type ObjectionAnalytics = {
  type: ObjectionType;
  label: string;
  quantity: number;
  share: number;
};

export type CityAnalytics = {
  city: string;
  state: string;
  quantity: number;
  share: number;
};

export type AnalyticsGoal = {
  id: string;
  name: string;
  metricType: ClientGoalMetricType;
  targetValue: number;
};

export type GoalStatus = "ABOVE_PACE" | "ON_PACE" | "BELOW_PACE" | "ACHIEVED";

export type GoalProgress = {
  goal: AnalyticsGoal;
  realized: number;
  target: number;
  achievement: number;
  remaining: number;
  status: GoalStatus;
  projection: number | null;
  remainingDays: number;
  requiredPerDay: number | null;
  isCurrency: boolean;
  isAverageTicket: boolean;
};

export type AnalyticsClient = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  accessActive: boolean;
  username: string | null;
  reportingStartedAt: string;
};

export type ClientAnalyticsData = {
  client: AnalyticsClient;
  filters: AnalyticsFilters;
  leadSources: AnalyticsLeadSource[];
  current: AnalyticsMetrics;
  comparison: AnalyticsMetrics | null;
  daily: DailyAnalytics[];
  bySource: SourceAnalytics[];
  objections: ObjectionAnalytics[];
  cities: CityAnalytics[];
  pendingDates: string[];
  reportedDays: number;
  goals: GoalProgress[] | null;
  goalSourceWarning: boolean;
  insights: string[];
};

export type MetricInput = {
  status?: ReportSourceStatus;
  leadsReceived: number;
  leadsAnswered: number;
  leadsInterested: number;
  sales: number;
  revenueCents: number;
};
