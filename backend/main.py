from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from contextlib import asynccontextmanager
from typing import List, Optional, Dict, Any
import os
import asyncio
from dotenv import load_dotenv

load_dotenv()

from backend.database import init_db, save_event, get_recent_events, clear_events
from backend.models.event import SwallowEvent, SwallowEventCreate, RiskLevel
from backend.services.risk_service import RiskAssessmentService
from backend.services.notification_service import NotificationService
from backend.services.websocket_manager import ws_manager
from backend.services.camera_service import camera_manager
from backend.services.audio_service import audio_manager
from backend.services.device_service import DeviceService

notification_service = NotificationService()
is_monitoring_active = True

async def dispatch_detection_event(event_type: str, risk_score: float, confidence: float, duration: Optional[float], source: str, metadata: dict):
    """Unified event dispatcher for Camera, Audio, and Sensor events."""
    event_in = SwallowEventCreate(
        event_type=event_type,
        confidence=confidence,
        risk_score=risk_score,
        duration=duration,
        source=source,
        metadata=metadata
    )
    await create_event(event_in)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    loop = asyncio.get_running_loop()
    camera_manager.set_event_dispatcher(dispatch_detection_event, loop)
    audio_manager.set_event_dispatcher(dispatch_detection_event, loop)
    # Start audio listening by default on default microphone
    audio_manager.start()
    yield
    # Shutdown
    camera_manager.stop()
    audio_manager.stop()

app = FastAPI(
    title="SwallowSense API",
    description="SwallowSense Monitoring and Event Processing Pipeline",
    version="0.2.0",
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
    cam_status = camera_manager.get_status()
    aud_status = audio_manager.get_status()
    return {
        "status": "healthy",
        "monitoring": is_monitoring_active,
        "camera_active": cam_status["is_running"],
        "audio_active": aud_status["is_running"],
        "service": "SwallowSense Multimodal Backend"
    }

@app.get("/api/events", response_model=List[SwallowEvent])
async def list_events(limit: int = Query(50, ge=1, le=100)):
    return await get_recent_events(limit=limit)

@app.post("/api/events", response_model=SwallowEvent)
async def create_event(event_in: SwallowEventCreate):
    """
    Standard ingestion point for detection events (Camera, Audio, Sensors).
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

# ==========================================
# Device Management Endpoints
# ==========================================
class DeviceSelectRequest(BaseModel):
    camera_index: Optional[int] = None
    microphone_index: Optional[int] = None

@app.get("/api/devices/list")
async def list_devices():
    """Discover and return all available camera and microphone devices."""
    devices = DeviceService.get_all_devices()
    cam_status = camera_manager.get_status()
    aud_status = audio_manager.get_status()
    
    return {
        "cameras": devices["cameras"],
        "microphones": devices["microphones"],
        "active_camera_index": cam_status["camera_index"],
        "active_microphone_index": aud_status["device_index"],
        "active_microphone_name": aud_status["device_name"]
    }

@app.post("/api/devices/select")
async def select_devices(req: DeviceSelectRequest):
    """Hot-swap active camera index or active microphone device index."""
    cam_changed = False
    mic_changed = False

    if req.camera_index is not None:
        if camera_manager.is_running:
            camera_manager.start(camera_index=req.camera_index)
        else:
            camera_manager.camera_index = req.camera_index
        cam_changed = True

    if req.microphone_index is not None:
        audio_manager.start(device_index=req.microphone_index)
        mic_changed = True

    return {
        "status": "updated",
        "camera_changed": cam_changed,
        "microphone_changed": mic_changed,
        "camera": camera_manager.get_status(),
        "audio": audio_manager.get_status()
    }

# ==========================================
# Audio Detection Endpoints
# ==========================================
@app.get("/api/audio/status")
async def get_audio_status():
    return audio_manager.get_status()

@app.post("/api/audio/start")
async def start_audio(device_index: Optional[int] = Query(None, description="Microphone device index")):
    success = audio_manager.start(device_index=device_index)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to initialize microphone stream")
    return {"status": "started", "audio": audio_manager.get_status()}

@app.post("/api/audio/stop")
async def stop_audio():
    audio_manager.stop()
    return {"status": "stopped", "audio": audio_manager.get_status()}

# ==========================================
# Camera Detection & Streaming Endpoints
# ==========================================
@app.post("/api/camera/start")
async def start_camera(camera_index: int = Query(0, description="Camera device index")):
    success = camera_manager.start(camera_index=camera_index)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to initialize camera")
    return {"status": "started", "camera": camera_manager.get_status()}

@app.post("/api/camera/stop")
async def stop_camera():
    camera_manager.stop()
    return {"status": "stopped", "camera": camera_manager.get_status()}

@app.get("/api/camera/status")
async def get_camera_status():
    return camera_manager.get_status()

async def frame_generator():
    while True:
        frame_bytes = camera_manager.latest_frame_bytes
        if frame_bytes is not None:
            yield (
                b'--frame\r\n'
                b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n'
            )
        await asyncio.sleep(0.04)  # ~25 FPS

@app.get("/api/camera/stream")
async def stream_camera():
    """MJPEG Live Video Stream with HUD & Keypoints Overlay"""
    if not camera_manager.is_running:
        camera_manager.start()
    return StreamingResponse(
        frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

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
