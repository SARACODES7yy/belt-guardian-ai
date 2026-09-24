export const THRESHOLDS = {
  vibrationWarning: 5,
  vibrationCritical: 7,
  temperatureWarning: 55,
  temperatureCritical: 65,
  loadWarning: 80,
  loadCritical: 90,
  speedWarning: 2.5,
  speedCritical: 2,
} as const;

export interface BeltThresholdRow {
  temp_warn: number | null;
  temp_crit: number | null;
  vibration_warn: number | null;
  vibration_crit: number | null;
  load_warn: number | null;
  load_crit: number | null;
  speed_warn: number | null;
  speed_crit: number | null;
}

export interface EffectiveThresholds {
  vibrationWarning: number;
  vibrationCritical: number;
  temperatureWarning: number;
  temperatureCritical: number;
  loadWarning: number;
  loadCritical: number;
  speedWarning: number;
  speedCritical: number;
}

export const resolveThresholds = (
  belt?: BeltThresholdRow | null
): EffectiveThresholds => ({
  vibrationWarning: belt?.vibration_warn ?? THRESHOLDS.vibrationWarning,
  vibrationCritical: belt?.vibration_crit ?? THRESHOLDS.vibrationCritical,
  temperatureWarning: belt?.temp_warn ?? THRESHOLDS.temperatureWarning,
  temperatureCritical: belt?.temp_crit ?? THRESHOLDS.temperatureCritical,
  loadWarning: belt?.load_warn ?? THRESHOLDS.loadWarning,
  loadCritical: belt?.load_crit ?? THRESHOLDS.loadCritical,
  speedWarning: belt?.speed_warn ?? THRESHOLDS.speedWarning,
  speedCritical: belt?.speed_crit ?? THRESHOLDS.speedCritical,
});

export type TelemetryStatus = "operational" | "warning" | "critical";

export interface TelemetrySample {
  speed: number;
  load: number;
  temperature: number;
  vibration: number;
  status: TelemetryStatus;
}

export const deriveStatus = (
  vibration: number,
  temperature: number,
  load: number,
  thresholds: EffectiveThresholds = THRESHOLDS
): TelemetryStatus => {
  if (
    vibration > thresholds.vibrationCritical ||
    temperature > thresholds.temperatureCritical ||
    load > thresholds.loadCritical
  ) {
    return "critical";
  }
  if (
    vibration > thresholds.vibrationWarning ||
    temperature > thresholds.temperatureWarning ||
    load > thresholds.loadWarning
  ) {
    return "warning";
  }
  return "operational";
};

export const riskScore = (
  vibration: number,
  temperature: number,
  load: number
): number => {
  const vib = Math.min(vibration / 12, 1);
  const temp = Math.min(Math.max((temperature - 40) / 45, 0), 1);
  const loadScore = Math.min(Math.max((load - 60) / 40, 0), 1);
  const score = Math.round((vib * 45 + temp * 30 + loadScore * 25) * 100) / 100;
  return Math.min(99, Math.max(1, score * 100));
};

export const riskLabel = (risk: number): string => {
  if (risk > 70) return "Critical";
  if (risk > 40) return "High Risk";
  if (risk > 20) return "Medium Risk";
  return "Low Risk";
};