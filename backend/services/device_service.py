import cv2
import sounddevice as sd
import logging
from typing import List, Dict, Any

logger = logging.getLogger("device_service")

class DeviceService:
    @staticmethod
    def get_audio_input_devices() -> List[Dict[str, Any]]:
        """List all available audio input devices (microphones)"""
        devices = []
        try:
            device_list = sd.query_devices()
            default_input = sd.default.device[0]
            
            for idx, dev in enumerate(device_list):
                if dev.get('max_input_channels', 0) > 0:
                    name = dev.get('name', f'Microphone {idx}')
                    host_api = sd.query_hostapis(dev.get('hostapi', 0)).get('name', '')
                    
                    devices.append({
                        "id": idx,
                        "name": f"{name} ({host_api})",
                        "channels": dev.get('max_input_channels'),
                        "default_samplerate": dev.get('default_samplerate', 16000),
                        "is_default": (idx == default_input)
                    })
        except Exception as e:
            logger.error(f"Error querying audio devices: {e}")
            devices.append({"id": 0, "name": "Default System Microphone", "is_default": True})
            
        return devices

    @staticmethod
    def get_camera_devices(max_probe: int = 4) -> List[Dict[str, Any]]:
        """Probe available video capture devices (webcams, continuity camera)"""
        devices = []
        for idx in range(max_probe):
            try:
                cap = cv2.VideoCapture(idx)
                if cap.isOpened():
                    # Read frame to confirm it's functional
                    ret, _ = cap.read()
                    cap.release()
                    
                    label = f"Camera #{idx}"
                    if idx == 0:
                        label = "Camera #0 (Built-in / Primary)"
                    elif idx == 1:
                        label = "Camera #1 (Secondary / iPhone Continuity)"
                    else:
                        label = f"Camera #{idx} (External / Virtual)"
                        
                    devices.append({
                        "id": idx,
                        "name": label,
                        "is_available": ret
                    })
            except Exception as e:
                logger.debug(f"Camera index {idx} not available: {e}")
                
        if not devices:
            devices.append({"id": 0, "name": "Default Camera (0)", "is_available": True})
            
        return devices

    @classmethod
    def get_all_devices(cls) -> Dict[str, Any]:
        return {
            "cameras": cls.get_camera_devices(),
            "microphones": cls.get_audio_input_devices()
        }
