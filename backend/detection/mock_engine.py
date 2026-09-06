import random
from datetime import datetime
from backend.models.event import SwallowEventCreate

MOCK_SCENARIOS = [
    {
        "event_type": "normal_swallow",
        "confidence": 0.94,
        "risk_score": 0.08,
        "duration": 1.2,
        "source": "mock_audio_sensor",
        "metadata": {"swallow_count": 1, "sound_pattern": "smooth"}
    },
    {
        "event_type": "normal_drinking",
        "confidence": 0.91,
        "risk_score": 0.12,
        "duration": 2.5,
        "source": "mock_camera",
        "metadata": {"intake_type": "liquid"}
    },
    {
        "event_type": "mild_throat_clearing",
        "confidence": 0.82,
        "risk_score": 0.45,
        "duration": 1.8,
        "source": "mock_mic",
        "metadata": {"cough_intensity": "low"}
    },
    {
        "event_type": "repetitive_coughing",
        "confidence": 0.88,
        "risk_score": 0.68,
        "duration": 3.4,
        "source": "mock_audio_sensor",
        "metadata": {"cough_count": 4, "strain_detected": True}
    },
    {
        "event_type": "possible_abnormal_event",
        "confidence": 0.92,
        "risk_score": 0.88,
        "duration": 5.0,
        "source": "mock_multimodal",
        "metadata": {"respiratory_pause": True, "distress_indicator": "elevated"}
    }
]

class MockDetectionEngine:
    @staticmethod
    def generate_random_event() -> SwallowEventCreate:
        scenario = random.choice(MOCK_SCENARIOS)
        # Add slight variation
        confidence = min(1.0, max(0.5, scenario["confidence"] + random.uniform(-0.05, 0.05)))
        risk_score = min(1.0, max(0.0, scenario["risk_score"] + random.uniform(-0.05, 0.05)))
        
        return SwallowEventCreate(
            event_type=scenario["event_type"],
            confidence=round(confidence, 2),
            risk_score=round(risk_score, 2),
            duration=scenario.get("duration"),
            source=scenario.get("source", "mock"),
            metadata=scenario.get("metadata", {})
        )

    @staticmethod
    def generate_event_by_type(scenario_idx: int) -> SwallowEventCreate:
        idx = max(0, min(len(MOCK_SCENARIOS) - 1, scenario_idx))
        scenario = MOCK_SCENARIOS[idx]
        return SwallowEventCreate(
            event_type=scenario["event_type"],
            confidence=scenario["confidence"],
            risk_score=scenario["risk_score"],
            duration=scenario.get("duration"),
            source=scenario.get("source", "mock"),
            metadata=scenario.get("metadata", {})
        )
