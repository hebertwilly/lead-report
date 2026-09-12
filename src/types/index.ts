/** Papéis usados pela camada de autorização. */
export type UserRole = "ADMIN" | "CLIENT";
/** Métricas disponíveis para metas mensais de clientes. */
export type ClientGoalMetricType = "REVENUE" | "SALES" | "AVERAGE_TICKET" | "LEADS";
/** Fontes de leads suportadas pelos reportes diários. */
export type ReportSourceStatus = "PENDING" | "FILLED" | "NO_CONTACTS";
/** Motivos de não conversão persistidos no banco. */
export type ObjectionType = "NO_RESPONSE" | "PRICE" | "SHIPPING" | "PRODUCT_UNAVAILABLE" | "PAYMENT_METHOD" | "THINKING" | "NO_INTEREST" | "OTHER";
