import time
import threading
import asyncio
import logging
import numpy as np
import sounddevice as sd
from typing import Optional, Callable, Dict, Any, List

logger = logging.getLogger("audio_service")

class AudioDetectionManager:
    _instance: Optional['AudioDetectionManager'] = None

    def __init__(self):
        self.is_running = False
        self.device_index: Optional[int] = None
        self.device_name: str = "Default Microphone"
        self.stream: Optional[sd.InputStream] = None
        self.lock = threading.Lock()
        
        # Real-time Metrics
        self.current_rms: float = 0.0
        self.peak_rms: float = 0.0
        self.ambient_rms: float = 0.02
        
        # Cough & Throat Clearing Detection
        self.last_cough_time: float = 0.0
        self.cough_history: List[float] = [] # timestamps of cough bursts in last 10s
        self.total_cough_count: int = 0
        self.last_detected_sound: Optional[str] = None
        
        # Async Dispatcher
        self.async_event_callback: Optional[Callable] = None
        self.event_loop: Optional[asyncio.AbstractEventLoop] = None

    @classmethod
    def get_instance(cls) -> 'AudioDetectionManager':
        if cls._instance is None:
            cls._instance = AudioDetectionManager()
        return cls._instance

    def set_event_dispatcher(self, callback: Callable, loop: asyncio.AbstractEventLoop):
        self.async_event_callback = callback
        self.event_loop = loop

    def get_status(self) -> Dict[str, Any]:
        with self.lock:
            # Clean cough history older than 8 seconds
            now = time.time()
            self.cough_history = [t for t in self.cough_history if now - t < 8.0]
            
            return {
                "is_running": self.is_running,
                "device_index": self.device_index,
                "device_name": self.device_name,
                "rms_level": round(min(1.0, self.current_rms * 3.5), 3), # Scaled for UI meter (0.0 - 1.0)
                "raw_rms": round(self.current_rms, 4),
                "ambient_rms": round(self.ambient_rms, 4),
                "recent_cough_count": len(self.cough_history),
                "total_cough_count": self.total_cough_count,
                "last_sound": self.last_detected_sound
            }

    def _audio_callback(self, indata, frames, time_info, status):
        """Audio streaming callback running in sounddevice background thread."""
        if status:
            logger.debug(f"SoundDevice status: {status}")

        # Compute RMS
        audio_data = indata[:, 0] if indata.ndim > 1 else indata
        rms = float(np.sqrt(np.mean(audio_data ** 2)))
        self.current_rms = rms

        # Adaptive ambient noise floor update
        self.ambient_rms = 0.98 * self.ambient_rms + 0.02 * min(rms, 0.05)

        # Transient Energy Spike Detection (Cough / Throat clearing)
        now = time.time()
        # Cough threshold: sudden energy surge above ambient noise
        if rms > 0.12 and rms > (self.ambient_rms * 3.0):
            # Cooldown of 1.2 seconds between separate cough bursts
            if now - self.last_cough_time >= 1.2:
                self.last_cough_time = now
                self.cough_history.append(now)
                self.total_cough_count += 1
                
                # Filter coughs in rolling 8-second window
                recent = [t for t in self.cough_history if now - t < 8.0]
                self.cough_history = recent
                
                if len(recent) >= 3:
                    # Repetitive coughing detected (Elevated/High Risk)
                    self.last_detected_sound = "repetitive_coughing"
                    logger.warning(f"🚨 Repetitive Coughing Detected ({len(recent)} times in 8s, RMS: {rms:.3f})")
                    self._dispatch_event(
                        event_type="repetitive_coughing",
                        risk_score=0.68,
                        confidence=0.88,
                        duration=round(now - recent[0], 1),
                        metadata={
                            "cough_count": len(recent),
                            "total_coughs": self.total_cough_count,
                            "rms_peak": round(rms, 3),
                            "device": self.device_name
                        }
                    )
                else:
                    # Single cough / throat clearing (Mild Risk)
                    self.last_detected_sound = "mild_throat_clearing"
                    logger.info(f"⚠️ Throat Clearing / Single Cough Detected (RMS: {rms:.3f})")
                    self._dispatch_event(
                        event_type="mild_throat_clearing",
                        risk_score=0.42,
                        confidence=0.82,
                        duration=1.2,
                        metadata={
                            "cough_sequence": len(recent),
                            "rms_peak": round(rms, 3),
                            "device": self.device_name
                        }
                    )

    def _dispatch_event(self, event_type: str, risk_score: float, confidence: float, duration: Optional[float], metadata: dict):
        if self.async_event_callback and self.event_loop:
            try:
                asyncio.run_coroutine_threadsafe(
                    self.async_event_callback(
                        event_type=event_type,
                        risk_score=risk_score,
                        confidence=confidence,
                        duration=duration,
                        source=f"mic_{self.device_name.split()[0].lower()}",
                        metadata=metadata
                    ),
                    self.event_loop
                )
            except Exception as e:
                logger.error(f"Error dispatching audio event: {e}")

    def start(self, device_index: Optional[int] = None) -> bool:
        with self.lock:
            if self.is_running:
                if device_index is None or device_index == self.device_index:
                    return True
                # Different device requested -> stop first
                self._stop_stream()

            self.device_index = device_index
            try:
                # Query device name
                if self.device_index is not None:
                    dev_info = sd.query_devices(self.device_index)
                    self.device_name = dev_info.get('name', f"Microphone #{self.device_index}")
                else:
                    default_dev = sd.query_devices(kind='input')
                    self.device_name = default_dev.get('name', 'Default Microphone')

                self.stream = sd.InputStream(
                    samplerate=16000,
                    blocksize=1600, # 100ms per block
                    channels=1,
                    device=self.device_index,
                    callback=self._audio_callback
                )
                self.stream.start()
                self.is_running = True
                logger.info(f"Started audio monitoring on device [{self.device_name}] (Index: {self.device_index})")
                return True
            except Exception as e:
                logger.error(f"Failed to start audio stream: {e}")
                self.is_running = False
                self.stream = None
                return False

    def _stop_stream(self):
        if self.stream:
            try:
                self.stream.stop()
                self.stream.close()
            except Exception as e:
                logger.error(f"Error closing audio stream: {e}")
            self.stream = None
        self.is_running = False
        self.current_rms = 0.0

    def stop(self):
        with self.lock:
            self._stop_stream()
            logger.info("Stopped audio monitoring.")

audio_manager = AudioDetectionManager.get_instance()
