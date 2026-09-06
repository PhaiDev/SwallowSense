from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum

class RiskLevel(str, Enum):
    NORMAL = "normal"
    ELEVATED_RISK = "elevated_risk"
    HIGH_RISK = "high_risk"

class SwallowEventCreate(BaseModel):
    event_type: str = Field(..., description="Event type, e.g. normal_swallowing, coughing, possible_choking")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Detection confidence 0.0 - 1.0")
    risk_score: float = Field(..., ge=0.0, le=1.0, description="Risk assessment score 0.0 - 1.0")
    duration: Optional[float] = Field(None, description="Duration in seconds")
    source: str = Field(default="mock", description="Source sensor/model (mock, camera, mic, esp32)")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional context info")

class SwallowEvent(SwallowEventCreate):
    id: str
    risk_level: RiskLevel
    timestamp: str
    alert_triggered: bool = False
    alert_channel: Optional[str] = None
