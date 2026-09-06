export type RiskLevel = 'normal' | 'elevated_risk' | 'high_risk';

export interface SwallowEvent {
  id: string;
  timestamp: string;
  event_type: string;
  confidence: number;
  risk_score: number;
  risk_level: RiskLevel;
  duration?: number;
  source: string;
  metadata?: Record<string, any>;
  alert_triggered: boolean;
  alert_channel?: string;
}

export interface MockScenario {
  event_type: string;
  confidence: number;
  risk_score: number;
  duration?: number;
  source: string;
  metadata?: Record<string, any>;
}
