# 📊 SwallowSense: สถานะความคืบหน้าของโปรเจกต์ (Project Status & Tracker)

> **อัปเดตล่าสุด:** 15 กันยายน 2026 (Phase 1 & Phase 2 เสร็จสมบูรณ์)  
> **เวอร์ชันปัจจุบัน:** `v0.2.0-multimodal-beta`  
> **สถานะภาพรวม:** ✅ ระบบใช้งานได้จริงพร้อมกล้องและไมโครโฟนสด (Hot-swap รองรับ Mac + iPhone Continuity)

---

## 🚦 ตารางสรุปสถานะฟีเจอร์ (Feature Completion Matrix)

| หมวดหมู่ | ฟีเจอร์ / โมดูล | สถานะ | รายละเอียดการทำงาน |
|---|---|:---:|---|
| **Vision AI** | ตรวจจับการตักอาหาร 1 คำ (Bite Counter) | ✅ เสร็จสิ้น | MediaPipe Face (MAR) + Hand (Distance) + State Machine + Hysteresis กันกระตุก |
| **Vision AI** | ตรวจจับการทานเร็วเกินไป (Fast Eating) | ✅ เสร็จสิ้น | แจ้งเตือนระดับเฝ้าระวังเมื่อตักคำใหม่เร็วกว่า 5.0 วินาที |
| **Vision AI** | ตรวจจับท่าทีก้มตัวกะทันหัน (Sudden Head Motion) | ✅ เสร็จสิ้น | ตรวจจับการเคลื่อนที่แกน Y ของจมูก (&Delta;y > 0.08) |
| **Vision AI** | ตรวจจับท่ามือกุมคอ (Universal Choking Sign) | 🔄 แผนถัดไป (Phase 3) | เตรียมใช้ MediaPipe Pose ตรวจจับมือแตะลำคอ |
| **Vision AI** | นับรอบการเคี้ยว & อมข้าวนาน (Pocketing Timer) | 🔄 แผนถัดไป (Phase 3) | ตรวจจับการขยับขากรรไกร และจับเวลาอาหารค้างในปาก > 20s |
| **Audio AI** | ดักฟังสัญญาณเสียงสด (Live Audio Stream) | ✅ เสร็จสิ้น | ดึงเสียง 16kHz Mono ผ่าน `sounddevice` แสดงผลบน Live VU Meter |
| **Audio AI** | ตรวจจับเสียงกระแอม/ไอเดี่ยว (Throat Clearing) | ✅ เสร็จสิ้น | Transient Energy Surge > 3x เสียงแวดล้อม (Risk Score 42%) |
| **Audio AI** | ตรวจจับเสียงไอต่อเนื่อง (Repetitive Cough Alert) | ✅ เสร็จสิ้น | ตรวจพบเสียงไอ &ge; 3 ครั้งใน 8 วินาที (Risk Score 68% ➔ ส่ง LINE Alert) |
| **Device Manager** | สลับกล้องแบบไดนามิก (Camera Selection) | ✅ เสร็จสิ้น | สลับระหว่าง Mac FaceTime HD และ iPhone Continuity Camera ได้ทันที |
| **Device Manager** | สลับไมค์แบบไดนามิก (Mic Selection) | ✅ เสร็จสิ้น | สลับระหว่าง Mac Mic, iPhone Microphone และ USB Mic ได้ทันที |
| **Backend API** | FastAPI Pipeline & Video Stream | ✅ เสร็จสิ้น | Endpoints สำหรับ Video MJPEG Stream, Device Selection, Audio Status, WebSocket |
| **Database** | SQLite Event Logging | ✅ เสร็จสิ้น | บันทึกประวัติเหตุการณ์ทั้งหมดพร้อม Metadata และคะแนนความเสี่ยง |
| **Notification** | LINE Alert Emergency Service | ✅ เสร็จสิ้น | ส่งแจ้งเตือนอัตโนมัติเมื่อพบเหตุการณ์เสี่ยงสูง (High / Elevated Risk) |
| **Frontend UI** | Real-time React Dashboard | ✅ เสร็จสิ้น | Live Video Feed + HUD Overlay + Live Audio VU Meter + Event History Log |

---

## 📡 สรุปอุปกรณ์และเซนเซอร์ที่รองรับในปัจจุบัน (Input Devices)

| ชนิดอุปกรณ์ | อุปกรณ์ที่ทดสอบและรองรับ | สถานะการทำงาน |
|---|---|:---:|
| 📷 **กล้องหลัก (Primary Camera)** | Built-in FaceTime HD Camera (MacBook) | ✅ รองรับ |
| 📷 **กล้องเสริม (Secondary Camera)** | iPhone Continuity Camera (ไร้สาย / เสียบสาย) | ✅ รองรับ |
| 🎙️ **ไมโครโฟนหลัก (Primary Mic)** | Built-in Microphone (MacBook Air / Pro) | ✅ รองรับ |
| 🎙️ **ไมโครโฟนเสริม (Secondary Mic)** | iPhone Microphone (`iPhonePhaiNa Microphone`) | ✅ รองรับ |
| 🌐 **กล้องเน็ตเวิร์ก (Network Camera)** | RTSP / IP Camera Stream | ✅ รองรับในสถาปัตยกรรม |

---

## 🔌 API Endpoints ที่พร้อมใช้งาน (Active Backend Endpoints)

### 1. Device Management
- `GET /api/devices/list` — ดึงรายชื่อกล้องและไมโครโฟนที่มีอยู่ในระบบทั้งหมด
- `POST /api/devices/select` — สลับกล้องหรือไมค์ที่กำลังใช้งานสด (Body: `{ camera_index, microphone_index }`)

### 2. Live Streams & Hardware Control
- `GET /api/camera/stream` — สตรีมวิดีโอสด MJPEG พร้อม Keypoints & HUD Overlay
- `POST /api/camera/start` & `POST /api/camera/stop` — เปิด/ปิด กล้องตรวจจับ
- `GET /api/camera/status` — เช็คสถานะกล้องสด (FPS, State, Bite Count)
- `POST /api/audio/start` & `POST /api/audio/stop` — เปิด/ปิด ไมโครโฟนดักฟังเสียง
- `GET /api/audio/status` — เช็คระดับความดังเสียงสด (RMS %), ประวัติเสียงไอ

### 3. Events & Alerts
- `GET /api/events` — ดึงประวัติเหตุการณ์ย้อนหลัง (Limit 1-100)
- `POST /api/events` — รับข้อมูล Event จากภายนอกหรือเซนเซอร์
- `POST /api/events/clear` — ล้างประวัติเหตุการณ์ทั้งหมด
- `WS /ws` — WebSocket สำหรับส่งข้อมูลอัปเดตสดไปยัง Dashboard

---

## 🚀 ลำดับงานถัดไป (Next Priorities - Phase 3)
1. 🔲 **เพิ่ม MediaPipe Pose Landmark:** ตรวจจับท่ามือกุมคอ (Universal Choking Sign) และวัดมุมก้ม/แหงนศีรษะ
2. 🔲 **เพิ่ม Food Pocketing Timer:** ตัวนับเวลาถอยหลัง 20–30 วินาที เตือนเมื่อผู้ป่วยอมข้าวไม่ยอมกลืน
3. 🔲 **เพิ่ม Chewing Dynamics:** นับจังหวะการเคี้ยวอาหาร (Jaw Oscillations) ก่อนกลืน
