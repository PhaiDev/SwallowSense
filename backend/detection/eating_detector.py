import os
import time
import math
import cv2
import mediapipe as mp
import numpy as np

# ป้องกัน Metal/GPU Crash บน macOS
os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = "rtsp_transport;udp"
os.environ["MEDIAPIPE_DISABLE_GPU"] = "1"

# ==========================================
# 1. CONFIGURATION & HYPERPARAMETERS
# ==========================================
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_FACE_PATH = os.path.join(CURRENT_DIR, "face_landmarker.task")
MODEL_HAND_PATH = os.path.join(CURRENT_DIR, "hand_landmarker.task")

# MediaPipe Face Landmark Indices for Mouth
# 13 = Upper lip inner, 14 = Lower lip inner
# 61 = Left corner, 291 = Right corner
# 152 = Chin
LIP_TOP = 13
LIP_BOTTOM = 14
LIP_LEFT = 61
LIP_RIGHT = 291
CHIN = 152
NOSE_TIP = 1

# Detection Thresholds
MAR_OPEN_THRESHOLD = 0.35          # Mouth Aspect Ratio สำหรับถือว่าอ้าปาก
HAND_ENTER_DIST = 0.14             # ระยะห่างมือกับปากเมื่อตักเข้า (Normalized Distance)
HAND_EXIT_DIST = 0.22              # ระยะห่างมือกับปากเมื่อถอยออก (Hysteresis เพื่อกันสั่น)
BITE_MIN_COOLDOWN_SEC = 2.0        # ป้องกันการนับคำซ้ำ (Debounce ขั้นต่ำ 2 วินาที)
FAST_EATING_SEC = 5.0              # ถ้าตักคำใหม่ภายในเวลาน้อยกว่า 5 วิ = กินเร็วเกินไป
ALERT_DISPLAY_SEC = 3.0            # ระยะเวลาแสดงข้อความเตือนบนหน้าจอ


# ==========================================
# 2. STATE MACHINE & LOGIC CLASS
# ==========================================
class EatingDetector:
    def __init__(self, on_event_callback=None):
        self.state = "IDLE"  # IDLE, APPROACHING, INTAKE, RETRACTING
        self.bite_count = 0
        self.last_bite_time = 0
        self.bite_intervals = []
        self.alerts = []
        self.alert_timer = 0
        self.alert_type = None  # "FAST_EATING", "CHOKING"
        self.on_event_callback = on_event_callback
        
        # สำหรับตรวจจับการสำลัก/กระตุกของศีรษะ (Sudden Head Motion)
        self.prev_nose_y = None
        self.head_drop_count = 0

    def compute_distance(self, p1, p2):
        """คำนวณ Euclidean Distance ระหว่าง 2 จุด"""
        return math.hypot(p1[0] - p2[0], p1[1] - p2[1])

    def calculate_mar(self, face_landmarks):
        """คำนวณ Mouth Aspect Ratio (MAR) เพื่อดูการอ้าปาก"""
        top = (face_landmarks[LIP_TOP].x, face_landmarks[LIP_TOP].y)
        bottom = (face_landmarks[LIP_BOTTOM].x, face_landmarks[LIP_BOTTOM].y)
        left = (face_landmarks[LIP_LEFT].x, face_landmarks[LIP_LEFT].y)
        right = (face_landmarks[LIP_RIGHT].x, face_landmarks[LIP_RIGHT].y)

        vertical = self.compute_distance(top, bottom)
        horizontal = self.compute_distance(left, right)
        if horizontal == 0:
            return 0.0
        return vertical / horizontal

    def get_mouth_center(self, face_landmarks):
        """หาตำแหน่งกึ่งกลางปาก"""
        top = face_landmarks[LIP_TOP]
        bottom = face_landmarks[LIP_BOTTOM]
        return ((top.x + bottom.x) / 2.0, (top.y + bottom.y) / 2.0)

    def process(self, face_landmarks_list, hand_landmarks_list, current_time):
        """ประมวลผล Logic การกินและการแจ้งเตือนในแต่ละเฟรม"""
        mouth_mar = 0.0
        min_hand_dist = 999.0
        mouth_center = None
        is_mouth_open = False

        # 1. วิเคราะห์ใบหน้าและปาก
        if face_landmarks_list and len(face_landmarks_list) > 0:
            fl = face_landmarks_list[0]
            mouth_mar = self.calculate_mar(fl)
            mouth_center = self.get_mouth_center(fl)
            is_mouth_open = mouth_mar > MAR_OPEN_THRESHOLD

            # ตรวจสอบการเคลื่อนไหวฉับพลันของศีรษะ (ไอ/สำลัก)
            nose = fl[NOSE_TIP]
            if self.prev_nose_y is not None:
                dy = nose.y - self.prev_nose_y
                if dy > 0.08:  # ก้มหน้ากะทันหันอย่างรวดเร็ว
                    self.head_drop_count += 1
                    if self.head_drop_count >= 2:
                        self.trigger_alert("CHOKING", "WARNING: Possible Choking / Coughing!", current_time)
                else:
                    self.head_drop_count = max(0, self.head_drop_count - 1)
            self.prev_nose_y = nose.y

        # 2. วิเคราะห์มือ
        if hand_landmarks_list and mouth_center is not None:
            for hand in hand_landmarks_list:
                # ตรวจจุดปลายนิ้วชี้ (8), นิ้วโป้ง (4), และข้อมือ (0)
                for pt_idx in [4, 8, 12, 0]:
                    pt = (hand[pt_idx].x, hand[pt_idx].y)
                    dist = self.compute_distance(pt, mouth_center)
                    if dist < min_hand_dist:
                        min_hand_dist = dist

        # 3. State Machine พร้อม Hysteresis และ Debounce
        hand_is_near = (min_hand_dist < HAND_ENTER_DIST)
        hand_is_far = (min_hand_dist > HAND_EXIT_DIST)

        if self.state == "IDLE":
            if hand_is_near:
                self.state = "APPROACHING"

        elif self.state == "APPROACHING":
            if hand_is_near and is_mouth_open:
                self.state = "INTAKE"
            elif hand_is_far:
                self.state = "IDLE"

        elif self.state == "INTAKE":
            # เมื่อตักอาหารเข้าปากแล้ว มือเริ่มถอยห่างออกพ้นระยะ
            if min_hand_dist > HAND_ENTER_DIST + 0.04:
                self.state = "RETRACTING"
                # ตรวจสอบ cooldown ก่อนนับคำ
                if (current_time - self.last_bite_time) >= BITE_MIN_COOLDOWN_SEC:
                    self.record_bite(current_time)

        elif self.state == "RETRACTING":
            if hand_is_far:
                self.state = "IDLE"
            elif hand_is_near and is_mouth_open and (current_time - self.last_bite_time) >= BITE_MIN_COOLDOWN_SEC:
                # ต่อเนื่องคำใหม่หลังจากผ่าน cooldown แล้ว
                self.state = "INTAKE"

        # เคลียร์ Alert เก่าเมื่อหมดเวลา
        if self.alert_timer > 0 and (current_time - self.alert_timer) > ALERT_DISPLAY_SEC:
            self.alert_type = None

        return {
            "state": self.state,
            "mar": mouth_mar,
            "is_mouth_open": is_mouth_open,
            "hand_dist": min_hand_dist if min_hand_dist != 999.0 else None,
            "bite_count": self.bite_count,
            "alert": self.alert_type
        }

    def record_bite(self, current_time):
        """บันทึกการกิน 1 คำ และตรวจสอบว่ากินเร็วเกินไปหรือไม่"""
        self.bite_count += 1
        is_fast = False
        interval = None
        if self.last_bite_time > 0:
            interval = current_time - self.last_bite_time
            self.bite_intervals.append(interval)
            print(f"[BITE #{self.bite_count}] ระยะห่างจากคำก่อนหน้า: {interval:.2f} วินาที")

            if interval < FAST_EATING_SEC:
                is_fast = True
                self.trigger_alert("FAST_EATING", f"WARNING: Eating Too Fast! ({interval:.1f}s/bite)", current_time)
        else:
            print(f"[BITE #{self.bite_count}] เริ่มคำแรก")

        self.last_bite_time = current_time

        # Dispatch event to callback if registered
        if self.on_event_callback:
            if is_fast:
                self.on_event_callback(
                    event_type="fast_eating",
                    risk_score=0.55,
                    confidence=0.90,
                    duration=interval,
                    metadata={"bite_count": self.bite_count, "interval_sec": round(interval, 2) if interval else None}
                )
            else:
                self.on_event_callback(
                    event_type="normal_swallow",
                    risk_score=0.08,
                    confidence=0.93,
                    duration=interval,
                    metadata={"bite_count": self.bite_count, "interval_sec": round(interval, 2) if interval else None}
                )

    def trigger_alert(self, alert_type, message, current_time):
        self.alert_type = alert_type
        self.alert_timer = current_time
        print(f">>> {message}")

        if alert_type == "CHOKING" and self.on_event_callback:
            self.on_event_callback(
                event_type="possible_choking",
                risk_score=0.85,
                confidence=0.90,
                duration=None,
                metadata={"reason": "sudden_head_drop", "head_drop_count": self.head_drop_count}
            )


# ==========================================
# 3. UI OVERLAY HELPER
# ==========================================
def draw_ui(frame, stats, current_time):
    h, w, _ = frame.shape
    
    # 1. วาดแถบพื้นหลัง HUD ด้านบนซ้าย
    overlay = frame.copy()
    cv2.rectangle(overlay, (15, 15), (320, 160), (30, 30, 30), -1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)
    cv2.rectangle(frame, (15, 15), (320, 160), (80, 80, 80), 1)

    # 2. ข้อมูลสถิติ
    cv2.putText(frame, "EATING MONITOR", (30, 42), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 220, 255), 2)
    
    # แสดง State
    state_color = (0, 255, 0) if stats["state"] == "INTAKE" else (200, 200, 200)
    cv2.putText(frame, f"State: {stats['state']}", (30, 72), cv2.FONT_HERSHEY_SIMPLEX, 0.55, state_color, 1)
    
    # แสดงจำนวนคำ (Bite Count)
    cv2.putText(frame, f"Bite Count: {stats['bite_count']}", (30, 98), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    
    # แสดงสถานะปากและมือ
    mouth_text = "Mouth: OPEN" if stats["is_mouth_open"] else "Mouth: CLOSED"
    cv2.putText(frame, f"{mouth_text} (MAR:{stats['mar']:.2f})", (30, 124), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180, 180, 180), 1)
    
    dist_str = f"{stats['hand_dist']:.2f}" if stats["hand_dist"] else "N/A"
    cv2.putText(frame, f"Hand-Mouth Dist: {dist_str}", (30, 145), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180, 180, 180), 1)

    # 3. กล่องแจ้งเตือน Alert Banner ตรงกลางหน้าจอ
    if stats["alert"] == "FAST_EATING":
        # แถบเตือนกินเร็ว (สีส้ม/เหลือง)
        cv2.rectangle(frame, (w//2 - 220, 20), (w//2 + 220, 75), (0, 140, 255), -1)
        cv2.putText(frame, "SLOW DOWN! EATING TOO FAST", (w//2 - 195, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)

    elif stats["alert"] == "CHOKING":
        # แถบเตือนสำลัก (สีแดงกระพริบ)
        blink = int(current_time * 4) % 2 == 0
        bg_color = (0, 0, 255) if blink else (0, 0, 180)
        cv2.rectangle(frame, (w//2 - 240, 20), (w//2 + 240, 75), bg_color, -1)
        cv2.putText(frame, "CHOKING / COUGH ALERT!", (w//2 - 210, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)


# ==========================================
# 4. MAIN PIPELINE
# ==========================================
def main():
    BaseOptions = mp.tasks.BaseOptions
    FaceLandmarker = mp.tasks.vision.FaceLandmarker
    FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
    HandLandmarker = mp.tasks.vision.HandLandmarker
    HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
    VisionRunningMode = mp.tasks.vision.RunningMode

    # ตั้งค่าโมเดล Face & Hand
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

    cap = cv2.VideoCapture(0)
    #cap = cv2.VideoCapture("rtsp://admin:phai061za@10.6.66.1/onvif1")
    if not cap.isOpened():
        print("ไม่สามารถเปิดกล้อง 0 ได้")
        return

    detector = EatingDetector()
    last_timestamp_ms = 0

    print("==================================================")
    print("  EATING & CHOKING MONITOR SYSTEM STARTED")
    print("  - ตรวจจับการตักอาหารเข้าปาก (Bite Counter)")
    print("  - แจ้งเตือนเมื่อกินเร็วเกินไป (< 5 วินาที/คำ)")
    print("  - ตรวจจับท่าทีก้มตัว/สำลักกะทันหัน")
    print("  กด 'q' เพื่อออกจากโปรแกรม")
    print("==================================================")

    with FaceLandmarker.create_from_options(face_options) as face_landmarker, \
         HandLandmarker.create_from_options(hand_options) as hand_landmarker:

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            current_time = time.time()
            frame_timestamp_ms = int(current_time * 1000)
            if frame_timestamp_ms <= last_timestamp_ms:
                frame_timestamp_ms = last_timestamp_ms + 1
            last_timestamp_ms = frame_timestamp_ms

            # แปลงภาพเป็น RGB สำหรับ MediaPipe
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

            # ตรวจจับ Face และ Hand
            face_result = face_landmarker.detect_for_video(mp_image, frame_timestamp_ms)
            hand_result = hand_landmarker.detect_for_video(mp_image, frame_timestamp_ms)

            # วาด Keypoints ของปาก
            h, w, _ = frame.shape
            if face_result.face_landmarks:
                fl = face_result.face_landmarks[0]
                for idx in [LIP_TOP, LIP_BOTTOM, LIP_LEFT, LIP_RIGHT]:
                    pt = fl[idx]
                    cv2.circle(frame, (int(pt.x * w), int(pt.y * h)), 3, (0, 255, 255), -1)

            # วาด Keypoints ของมือ
            if hand_result.hand_landmarks:
                for hand in hand_result.hand_landmarks:
                    for lm in hand:
                        cv2.circle(frame, (int(lm.x * w), int(lm.y * h)), 3, (0, 255, 0), -1)

            # ประมวลผล Logic การกิน
            stats = detector.process(
                face_result.face_landmarks,
                hand_result.hand_landmarks,
                current_time
            )

            # วาด UI Dashboard
            draw_ui(frame, stats, current_time)

            cv2.imshow("Eating & Choking Monitor", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
