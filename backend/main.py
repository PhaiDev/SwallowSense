from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import List, Optional
import os
import asyncio
from dotenv import load_dotenv

load_dotenv()

from backend.database import init_db, save_event, get_recent_events, clear_events
from backend.models.event import SwallowEvent, SwallowEventCreate, RiskLevel
from backend.services.risk_service import RiskAssessmentService
from backend.services.notification_service import NotificationService
from backend.services.websocket_manager import ws_manager
from backend.detection.mock_engine import MockDetectionEngine, MOCK_SCENARIOS

notification_service = NotificationService()
mock_auto_task: Optional[asyncio.Task] = None
is_monitoring_active = True

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    yield
    # Shutdown
    global mock_auto_task
    if mock_auto_task and not mock_auto_task.done():
        mock_auto_task.cancel()

app = FastAPI(
    title="SwallowSense API",
    description="SwallowSense Monitoring and Event Processing Pipeline",
    version="0.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "monitoring": is_monitoring_active,
        "service": "SwallowSense Backend"
    }

@app.get("/api/events", response_model=List[SwallowEvent])
async def list_events(limit: int = Query(50, ge=1, le=100)):
    return await get_recent_events(limit=limit)

@app.post("/api/events", response_model=SwallowEvent)
async def create_event(event_in: SwallowEventCreate):
    """
    Standard ingestion point for detection events (Mock, ESP32, Camera, Audio, ML models).
    """
    # 1. Assess Risk
    risk_level = RiskAssessmentService.assess_risk(
        risk_score=event_in.risk_score,
        confidence=event_in.confidence
    )
    
    # 2. Check if notification is needed (Elevated or High Risk)
    alert_triggered = False
    alert_channel = None
    if risk_level in [RiskLevel.HIGH_RISK, RiskLevel.ELEVATED_RISK]:
        temp_event = SwallowEvent(
            id="pending",
            timestamp="",
            risk_level=risk_level,
            **event_in.model_dump()
        )
        success, channel_info = await notification_service.send_alert(temp_event)
        if success:
            alert_triggered = True
            alert_channel = channel_info
            
    # 3. Save to database
    saved_event = await save_event(
        event_create=event_in,
        risk_level=risk_level,
        alert_triggered=alert_triggered,
        alert_channel=alert_channel
    )
    
    # 4. Broadcast to Real-time Dashboard
    await ws_manager.broadcast({
        "type": "NEW_EVENT",
        "event": saved_event.model_dump()
    })
    
    return saved_event

@app.post("/api/events/clear")
async def clear_all_events():
    await clear_events()
    await ws_manager.broadcast({"type": "EVENTS_CLEARED"})
    return {"message": "All events cleared"}

@app.get("/api/mock/scenarios")
async def get_scenarios():
    return MOCK_SCENARIOS

@app.post("/api/mock/trigger/{scenario_idx}", response_model=SwallowEvent)
async def trigger_mock_scenario(scenario_idx: int):
    event_data = MockDetectionEngine.generate_event_by_type(scenario_idx)
    return await create_event(event_data)

@app.post("/api/mock/random", response_model=SwallowEvent)
async def trigger_random_mock():
    event_data = MockDetectionEngine.generate_random_event()
    return await create_event(event_data)

# WebSocket Endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle client heartbeat or commands if any
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
