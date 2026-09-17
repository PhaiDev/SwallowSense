import os
import time
import threading
import asyncio
import logging
import cv2
import mediapipe as mp
import numpy as np
from typing import Optional, Callable, Dict, Any

from backend.detection.eating_detector import (
    EatingDetector,
    draw_ui,
    MODEL_FACE_PATH,
    MODEL_HAND_PATH,
    LIP_TOP,
    LIP_BOTTOM,
    LIP_LEFT,
    LIP_RIGHT
)

logger = logging.getLogger("camera_service")

# ป้องกัน Metal/GPU Crash บน macOS
os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = "rtsp_transport;udp"
os.environ["MEDIAPIPE_DISABLE_GPU"] = "1"

class CameraDetectionManager:
    _instance: Optional['CameraDetectionManager'] = None

    def __init__(self):
        self.is_running = False
        self.camera_index = 0
        self.cap: Optional[cv2.VideoCapture] = None
        self.thread: Optional[threading.Thread] = None
        self.lock = threading.Lock()
        
        self.detector = EatingDetector(on_event_callback=self._handle_detection_event)
        self.latest_frame_bytes: Optional[bytes] = None
        self.latest_stats: Dict[str, Any] = {
            "state": "IDLE",
            "mar": 0.0,
            "is_mouth_open": False,
            "hand_dist": None,
            "bite_count": 0,
            "alert": None
        }
        
        self.fps = 0.0
        self.last_frame_time = time.time()
        self.async_event_callback: Optional[Callable] = None
        self.event_loop: Optional[asyncio.AbstractEventLoop] = None

    @classmethod
    def get_instance(cls) -> 'CameraDetectionManager':
        if cls._instance is None:
            cls._instance = CameraDetectionManager()
        return cls._instance

    def set_event_dispatcher(self, callback: Callable, loop: asyncio.AbstractEventLoop):
        """Set async callback and loop to send detection events to FastAPI pipeline."""
        self.async_event_callback = callback
        self.event_loop = loop

    def _handle_detection_event(self, event_type: str, risk_score: float, confidence: float, duration: Optional[float], metadata: dict):
        """Internal callback invoked by EatingDetector when bite or warning occurs."""
        logger.info(f"Detection Event Captured: {event_type} (Risk: {risk_score})")
        if self.async_event_callback and self.event_loop:
            try:
                # Dispatch to FastAPI async loop from detector thread
                asyncio.run_coroutine_threadsafe(
                    self.async_event_callback(
                        event_type=event_type,
                        risk_score=risk_score,
                        confidence=confidence,
                        duration=duration,
                        source="camera_eating_detector",
                        metadata=metadata
                    ),
                    self.event_loop
                )
            except Exception as e:
                logger.error(f"Error dispatching detection event: {e}")

    def start(self, camera_index: int = 0) -> bool:
        with self.lock:
            if self.is_running:
                if self.camera_index == camera_index:
                    logger.info("Camera is already running with requested index.")
                    return True
                # Different index requested -> stop current thread
                self.is_running = False

        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.5)

        with self.lock:
            self.camera_index = camera_index
            self.is_running = True
            self.thread = threading.Thread(target=self._run_capture_loop, daemon=True)
            self.thread.start()
            logger.info(f"Started camera detection on index {camera_index}")
            return True

    def stop(self):
        with self.lock:
            if not self.is_running:
                return
            self.is_running = False

        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2.0)
        logger.info("Stopped camera detection.")

    def get_status(self) -> Dict[str, Any]:
        return {
            "is_running": self.is_running,
            "camera_index": self.camera_index,
            "fps": round(self.fps, 1),
            "state": self.latest_stats.get("state", "IDLE"),
            "bite_count": self.detector.bite_count,
            "is_mouth_open": self.latest_stats.get("is_mouth_open", False),
            "hand_dist": self.latest_stats.get("hand_dist"),
            "alert": self.latest_stats.get("alert")
        }

    def _run_capture_loop(self):
        BaseOptions = mp.tasks.BaseOptions
        FaceLandmarker = mp.tasks.vision.FaceLandmarker
        FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
        HandLandmarker = mp.tasks.vision.HandLandmarker
        HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
        VisionRunningMode = mp.tasks.vision.RunningMode

        face_options = FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=MODEL_FACE_PATH),
            running_mode=VisionRunningMode.VIDEO,
            num_faces=1,
        )
        hand_options = HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=MODEL_HAND_PATH),
            running_mode=VisionRunningMode.VIDEO,
            num_hands=2,
        )

        cap = cv2.VideoCapture(self.camera_index)
        if not cap.isOpened():
            logger.error(f"Cannot open camera at index {self.camera_index}")
            self.is_running = False
            return

        self.cap = cap
        last_timestamp_ms = 0
        frame_counter = 0
        fps_timer = time.time()

        try:
            with FaceLandmarker.create_from_options(face_options) as face_landmarker, \
                 HandLandmarker.create_from_options(hand_options) as hand_landmarker:

                while self.is_running and cap.isOpened():
                    ret, frame = cap.read()
                    if not ret:
                        time.sleep(0.03)
                        continue

                    current_time = time.time()
                    frame_timestamp_ms = int(current_time * 1000)
                    if frame_timestamp_ms <= last_timestamp_ms:
                        frame_timestamp_ms = last_timestamp_ms + 1
                    last_timestamp_ms = frame_timestamp_ms

                    # Calculate FPS
                    frame_counter += 1
                    if current_time - fps_timer >= 1.0:
                        self.fps = frame_counter / (current_time - fps_timer)
                        frame_counter = 0
                        fps_timer = current_time

                    # MediaPipe detection
                    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

                    try:
                        face_result = face_landmarker.detect_for_video(mp_image, frame_timestamp_ms)
                        hand_result = hand_landmarker.detect_for_video(mp_image, frame_timestamp_ms)
                    except Exception as e:
                        logger.warning(f"MediaPipe processing error: {e}")
                        continue

                    h, w, _ = frame.shape
                    
                    # Draw Face keypoints
                    if face_result.face_landmarks:
                        fl = face_result.face_landmarks[0]
                        for idx in [LIP_TOP, LIP_BOTTOM, LIP_LEFT, LIP_RIGHT]:
                            pt = fl[idx]
                            cv2.circle(frame, (int(pt.x * w), int(pt.y * h)), 3, (0, 255, 255), -1)

                    # Draw Hand keypoints
                    if hand_result.hand_landmarks:
                        for hand in hand_result.hand_landmarks:
                            for lm in hand:
                                cv2.circle(frame, (int(lm.x * w), int(lm.y * h)), 3, (0, 255, 0), -1)

                    # Update eating logic
                    stats = self.detector.process(
                        face_result.face_landmarks,
                        hand_result.hand_landmarks,
                        current_time
                    )
                    self.latest_stats = stats

                    # Draw HUD
                    draw_ui(frame, stats, current_time)

                    # Compress frame to JPEG
                    ret, jpeg = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
                    if ret:
                        self.latest_frame_bytes = jpeg.tobytes()

                    time.sleep(0.01)

        except Exception as ex:
            logger.error(f"Error in camera loop: {ex}")
        finally:
            if cap:
                cap.release()
            self.cap = None
            self.is_running = False
            logger.info("Camera capture loop terminated.")

camera_manager = CameraDetectionManager.get_instance()
