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

export interface CameraStatus {
  is_running: boolean;
  camera_index: number;
  fps: number;
  state: string;
  bite_count: number;
  is_mouth_open: boolean;
  hand_dist: number | null;
  alert: string | null;
}

export interface AudioStatus {
  is_running: boolean;
  device_index: number | null;
  device_name: string;
  rms_level: number;
  raw_rms: number;
  ambient_rms: number;
  recent_cough_count: number;
  total_cough_count: number;
  last_sound: string | null;
}

export interface DeviceInfo {
  id: number;
  name: string;
  is_available?: boolean;
  is_default?: boolean;
  channels?: number;
}

export interface DeviceListResponse {
  cameras: DeviceInfo[];
  microphones: DeviceInfo[];
  active_camera_index: number;
  active_microphone_index: number | null;
  active_microphone_name: string;
}
