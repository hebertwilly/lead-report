import test from "node:test";
import assert from "node:assert/strict";
import { getEquivalentPreviousPeriod, percentagePointVariation, percentageVariation } from "../src/lib/analytics/comparison.ts";
import { calculateGoalProgress, getCumulativeGoalStatus, projectByCurrentPace, requiredDailyPace } from "../src/lib/analytics/goals.ts";
import { aggregateMetrics } from "../src/lib/analytics/metrics.ts";
import { getPendingDates } from "../src/lib/analytics/pending.ts";

test("agrega métricas e calcula as taxas do cenário A", () => {
  const metrics = aggregateMetrics([{ leadsReceived: 100, leadsAnswered: 80, leadsInterested: 40, sales: 10, revenueCents: 500_000 }]);
  assert.equal(metrics.attendance, 0.8);
  assert.equal(metrics.interest, 0.5);
  assert.equal(metrics.conversion, 0.1);
  assert.equal(metrics.interestedConversion, 0.25);
  assert.equal(metrics.averageTicketCents, 50_000);
});

test("divisão por zero devolve zero em todas as taxas", () => {
  const metrics = aggregateMetrics([]);
  assert.equal(metrics.attendance, 0);
  assert.equal(metrics.interest, 0);
  assert.equal(metrics.conversion, 0);
  assert.equal(metrics.interestedConversion, 0);
  assert.equal(metrics.averageTicketCents, 0);
});

test("comparação percentual calcula +20% e não produz infinito", () => {
  assert.deepEqual(percentageVariation(120, 100), { kind: "value", value: 0.2 });
  assert.deepEqual(percentageVariation(5, 0), { kind: "new-result" });
  assert.deepEqual(percentageVariation(0, 0), { kind: "value", value: 0 });
});

test("comparação de taxas usa pontos percentuais", () => {
  assert.ok(Math.abs(percentagePointVariation(0.12, 0.1) - 2) < 1e-9);
});

test("período anterior equivalente preserva o número de dias", () => {
  assert.deepEqual(getEquivalentPreviousPeriod({ from: "2026-09-01", to: "2026-09-10" }), { from: "2026-08-22", to: "2026-08-31" });
});

test("meta cumulativa projeta pelo ritmo e calcula o necessário por dia", () => {
  assert.equal(projectByCurrentPace(50_000, 10, 30), 150_000);
  assert.equal(requiredDailyPace(50_000, 100_000, 20), 2_500);
  assert.equal(getCumulativeGoalStatus(50_000, 100_000, 10, 30), "ABOVE_PACE");
});

test("meta de ticket compara diretamente sem projeção cumulativa", () => {
  const metrics = aggregateMetrics([{ leadsReceived: 10, leadsAnswered: 10, leadsInterested: 10, sales: 10, revenueCents: 300_000 }]);
  const [goal] = calculateGoalProgress([{ id: "goal", name: "Ticket", metricType: "AVERAGE_TICKET", targetValue: 350 }], metrics, "2026-09-10");
  assert.ok(Math.abs(goal.achievement - 300 / 350) < 1e-9);
  assert.equal(goal.remaining, 5_000);
  assert.equal(goal.projection, null);
  assert.equal(goal.requiredPerDay, null);
});

test("projeção de faturamento do cenário D usa os 10 dias decorridos", () => {
  const metrics = aggregateMetrics([{ leadsReceived: 0, leadsAnswered: 0, leadsInterested: 0, sales: 0, revenueCents: 5_000_000 }]);
  const [goal] = calculateGoalProgress([{ id: "goal", name: "Faturamento", metricType: "REVENUE", targetValue: 100_000 }], metrics, "2026-09-10");
  assert.equal(goal.projection, 15_000_000);
});

test("dias pendentes distinguem ausência, parcial e zero real", () => {
  const pending = getPendingDates([
    { date: "2026-09-01", chargeable: true, requiredSourceIds: ["a", "b"], reportedSourceIds: ["a"] },
    { date: "2026-09-02", chargeable: true, requiredSourceIds: ["a"], reportedSourceIds: ["a"] },
    { date: "2026-09-03", chargeable: false, requiredSourceIds: ["a"], reportedSourceIds: [] },
  ]);
  assert.deepEqual(pending, ["2026-09-01"]);
});
