import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ClientGoalMetricType } from "@/types";

type ClientGoalRow = {
  id: string;
  client_id: string;
  name: string;
  metric_type: ClientGoalMetricType;
  target_value: number | string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ClientGoal = {
  id: string;
  clientId: string;
  name: string;
  metricType: ClientGoalMetricType;
  targetValue: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

function mapClientGoal(row: ClientGoalRow): ClientGoal {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    metricType: row.metric_type,
    targetValue: Number(row.target_value),
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Loader compartilhado para metas. O ADMIN pode incluir o histórico inativo;
 * para CLIENT a RLS sempre limita a leitura às metas ativas do próprio cliente.
 */
export async function getClientGoals(clientId: string, includeInactive = false): Promise<ClientGoal[]> {
  const supabase = await createClient();
  let query = supabase
    .from("client_goals")
    .select("id, client_id, name, metric_type, target_value, active, created_at, updated_at")
    .eq("client_id", clientId)
    .order("active", { ascending: false })
    .order("created_at", { ascending: false });

  if (!includeInactive) query = query.eq("active", true);

  const { data, error } = await query;
  if (error) throw new Error("Não foi possível carregar as metas do cliente.");
  return (data as unknown as ClientGoalRow[] ?? []).map(mapClientGoal);
}

export async function getActiveClientGoals(clientId: string) {
  return getClientGoals(clientId, false);
}
