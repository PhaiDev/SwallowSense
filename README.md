# SwallowSense — Early Foundation Prototype

ระบบต้นแบบตรวจจับและเฝ้าระวังความผิดปกติในการกลืนและการรับประทานอาหาร (SwallowSense) ตามสถาปัตยกรรม Decoupled / Mock Pipeline ใน [init_project.md](init_project.md)

---

## 🛠️ โครงสร้างโปรเจกต์ (Tech Stack Option 2: FastAPI + React)

```text
SwallowSense/
├── backend/
│   ├── detection/
│   │   ├── eating_detector.py   # MediaPipe Face & Hand Landmark eating detector
│   │   ├── face_landmarker.task # Face Landmark model
│   │   ├── hand_landmarker.task # Hand Landmark model
│   ├── models/
│   │   └── event.py             # Event & Risk schemas (Pydantic)
│   ├── services/
│   │   ├── device_service.py    # Auto-discovery for Camera & Microphone devices
│   │   ├── audio_service.py     # Live Microphone Stream & Cough Detection
│   │   ├── camera_service.py    # Background Camera Detection & MJPEG Stream Manager
│   │   ├── risk_service.py      # Confidence-weighted Risk Assessment
│   │   ├── notification_service.py # LINE Messaging API / LINE Notify & Mock alert
│   │   └── websocket_manager.py # Real-time dashboard broadcast
│   ├── database.py              # SQLite event storage (aiosqlite)
│   └── main.py                  # FastAPI Application, Stream Endpoints & WebSockets
│
├── frontend/                    # Vite + React (TypeScript) + Tailwind CSS
│   ├── src/
│   │   ├── App.tsx              # Real-time Monitoring Dashboard & Mock Controller
│   │   └── types.ts             # Type definitions
│   └── vite.config.ts           # Proxy to backend (:8000)
│
├── .env                         # สำหรับใส่ LINE Channel Token / User ID
└── init_project.md              # Project Blueprint
```

---

## 🚀 วิธีการรันระบบ (Quickstart)

### 1. รัน Backend (FastAPI)
```bash
# เปิด Terminal 1
source venv/bin/activate
uvicorn backend.main:app --reload --port 8000
```
- API Docs: `http://localhost:8000/docs`
- Health Check: `http://localhost:8000/api/health`

### 2. รัน Frontend Dashboard (React + Vite)
```bash
# เปิด Terminal 2
cd frontend
npm run dev
```
- Dashboard UI: `http://localhost:5173`

---

## 🔔 การตั้งค่าแจ้งเตือน LINE (LINE Alert)

เปิดไฟล์ `.env` ที่ root ของโปรเจกต์:

```env
# สำหรับ LINE Messaging API (แนะนำ)
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token_here
LINE_USER_ID=your_user_id_here

# หรือ LINE Notify Token (ทางเลือกเสริม)
LINE_NOTIFY_TOKEN=your_line_notify_token_here
```

> **หมายเหตุ:** หากไม่ได้ใส่ Token ระบบจะทำงานในโหมด **Simulated Console/Mock Alert** โดยจะแสดงการแจ้งเตือนบนหน้าจอ Dashboard และ Terminal ทันทีเมื่อเกิดเหตุการณ์ระดับ `Elevated Risk` หรือ `High Risk`
