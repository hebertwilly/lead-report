import type { AnalyticsGoal, AnalyticsMetrics, GoalProgress, GoalStatus } from "@/lib/analytics/types";

export const GOAL_PACE_TOLERANCE = 0.05;

export function getDaysInMonth(date: string) {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
}

export function projectByCurrentPace(realized: number, elapsedDays: number, totalDays: number) {
  return elapsedDays > 0 ? (realized / elapsedDays) * totalDays : 0;
}

export function requiredDailyPace(realized: number, target: number, remainingDays: number) {
  if (realized >= target) return 0;
  return remainingDays > 0 ? (target - realized) / remainingDays : null;
}

export function getCumulativeGoalStatus(realized: number, target: number, elapsedDays: number, totalDays: number): GoalStatus {
  const achievement = target > 0 ? realized / target : 0;
  if (achievement >= 1) return "ACHIEVED";
  const elapsedShare = totalDays > 0 ? elapsedDays / totalDays : 0;
  if (achievement > elapsedShare + GOAL_PACE_TOLERANCE) return "ABOVE_PACE";
  if (achievement < elapsedShare - GOAL_PACE_TOLERANCE) return "BELOW_PACE";
  return "ON_PACE";
}

export function getAverageTicketGoalStatus(realized: number, target: number): GoalStatus {
  if (realized >= target) return "ACHIEVED";
  return target > 0 && realized / target >= 1 - GOAL_PACE_TOLERANCE ? "ON_PACE" : "BELOW_PACE";
}

function realizedForGoal(goal: AnalyticsGoal, metrics: AnalyticsMetrics) {
  if (goal.metricType === "REVENUE") return metrics.revenueCents;
  if (goal.metricType === "SALES") return metrics.sales;
  if (goal.metricType === "LEADS") return metrics.leadsReceived;
  return metrics.averageTicketCents;
}

export function calculateGoalProgress(goals: readonly AnalyticsGoal[], metrics: AnalyticsMetrics, today: string): GoalProgress[] {
  const elapsedDays = Number(today.slice(8, 10));
  const totalDays = getDaysInMonth(today);
  const remainingDays = Math.max(totalDays - elapsedDays, 0);

  return goals.map((goal) => {
    const isCurrency = goal.metricType === "REVENUE" || goal.metricType === "AVERAGE_TICKET";
    const target = isCurrency ? Math.round(goal.targetValue * 100) : goal.targetValue;
    const realized = realizedForGoal(goal, metrics);
    const isAverageTicket = goal.metricType === "AVERAGE_TICKET";
    const achievement = target > 0 ? realized / target : 0;
    return {
      goal,
      realized,
      target,
      achievement,
      remaining: Math.max(target - realized, 0),
      status: isAverageTicket
        ? getAverageTicketGoalStatus(realized, target)
        : getCumulativeGoalStatus(realized, target, elapsedDays, totalDays),
      projection: isAverageTicket ? null : projectByCurrentPace(realized, elapsedDays, totalDays),
      remainingDays,
      requiredPerDay: isAverageTicket ? null : requiredDailyPace(realized, target, remainingDays),
      isCurrency,
      isAverageTicket,
    };
  });
}
