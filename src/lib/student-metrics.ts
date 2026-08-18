import type { StudentMetrics } from "@/types/contracts";

type MetricKey = "correctness" | "independence" | "reasoning" | "transfer";

const LABELS: Record<MetricKey, string> = {
  correctness: "Độ đúng",
  independence: "Tự lực",
  reasoning: "Lập luận",
  transfer: "Vận dụng",
};

export function studentMetricItems(metrics?: StudentMetrics | null) {
  return (Object.keys(LABELS) as MetricKey[]).map((key) => ({
    label: LABELS[key],
    value: metricValue(metrics, key),
  }));
}

function metricValue(metrics: StudentMetrics | null | undefined, key: MetricKey) {
  if (!metrics) return null;
  const snake = `${key}_score` as keyof StudentMetrics;
  const camel = `${key}Score` as keyof StudentMetrics;
  const value = metrics[snake] ?? metrics[camel];
  return typeof value === "number" ? value : null;
}
