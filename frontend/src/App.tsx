import { useEffect, useState, useRef } from 'react';
import type { SwallowEvent, RiskLevel, CameraStatus, AudioStatus, DeviceInfo } from './types';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Bell, 
  Trash2, 
  RefreshCw, 
  ShieldAlert, 
  Radio, 
  Sliders, 
  MessageSquare,
  Camera,
  CameraOff,
  Video,
  Mic,
  MicOff,
  Volume2,
  Settings2
} from 'lucide-react';

const EVENT_TYPE_LABELS: Record<string, string> = {
  'normal_swallow': 'การกลืนปกติ / ตักอาหาร 1 คำ (Normal Swallow)',
  'normal_drinking': 'การดื่มน้ำปกติ (Drinking)',
  'mild_throat_clearing': 'กระแอม / เคลียร์ลำคอ (Throat Clearing)',
  'repetitive_coughing': 'ตรวจพบเสียงไอต่อเนื่องหลายครั้ง (Repetitive Cough Alert)',
  'possible_abnormal_event': 'ตรวจพบเหตุผิดปกติ/สงสัยการสำลัก (Possible Abnormal Event)',
  'fast_eating': 'ทานอาหารเร็วเกินไป (Eating Too Fast < 5s)',
  'possible_choking': 'เตือนท่าทีก้มตัวกะทันหัน/สงสัยสำลัก (Possible Choking Motion)'
};

export default function App() {
  const [events, setEvents] = useState<SwallowEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [latestAlert, setLatestAlert] = useState<SwallowEvent | null>(null);

  // Devices & Selection State
  const [cameras, setCameras] = useState<DeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<DeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<number>(0);
  const [selectedMicId, setSelectedMicId] = useState<number | null>(null);
  const [isDeviceLoading, setIsDeviceLoading] = useState(false);

  // Real-time Camera State
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>({
    is_running: false,
    camera_index: 0,
    fps: 0,
    state: 'IDLE',
    bite_count: 0,
    is_mouth_open: false,
    hand_dist: null,
    alert: null
  });
  const [isCameraLoading, setIsCameraLoading] = useState(false);

  // Real-time Audio State
  const [audioStatus, setAudioStatus] = useState<AudioStatus>({
    is_running: true,
    device_index: null,
    device_name: 'กำลังค้นหาไมโครโฟน...',
    rms_level: 0,
    raw_rms: 0,
    ambient_rms: 0.02,
    recent_cough_count: 0,
    total_cough_count: 0,
    last_sound: null
  });

  const pollTimerRef = useRef<any>(null);

  // ดึงรายการอุปกรณ์ (กล้องและไมค์)
  const fetchDevices = async () => {
    setIsDeviceLoading(true);
    try {
      const res = await fetch('/api/devices/list');
      if (res.ok) {
        const data = await res.json();
        setCameras(data.cameras || []);
        setMicrophones(data.microphones || []);
        setSelectedCameraId(data.active_camera_index ?? 0);
        setSelectedMicId(data.active_microphone_index);
      }
    } catch (err) {
      console.error("เกิดข้อผิดพลาดในการดึงรายการอุปกรณ์:", err);
    } finally {
      setIsDeviceLoading(false);
    }
  };

  // ดึงข้อมูลประวัติเหตุการณ์และสถานะเซนเซอร์
  const fetchData = async () => {
    try {
      const [eventsRes, cameraRes, audioRes] = await Promise.all([
        fetch('/api/events'),
        fetch('/api/camera/status'),
        fetch('/api/audio/status')
      ]);
      if (eventsRes.ok) {
        const evts = await eventsRes.json();
        setEvents(evts);
      }
      if (cameraRes.ok) {
        const cam = await cameraRes.json();
        setCameraStatus(cam);
      }
      if (audioRes.ok) {
        const aud = await audioRes.json();
        setAudioStatus(aud);
      }
    } catch (err) {
      console.error("เกิดข้อผิดพลาดในการดึงข้อมูล:", err);
    }
  };

  useEffect(() => {
    fetchDevices();
    fetchData();

    // เชื่อมต่อ WebSocket สำหรับอัปเดตข้อมูลแบบ Real-time
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    let ws: WebSocket;

    const connectWs = () => {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => setIsConnected(true);
      ws.onclose = () => {
        setIsConnected(false);
        setTimeout(connectWs, 3000);
      };
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.type === 'NEW_EVENT') {
            const newEvt: SwallowEvent = data.event;
            setEvents((prev) => {
              if (prev.some((e) => e.id === newEvt.id)) {
                return prev;
              }
              return [newEvt, ...prev];
            });
            if (newEvt.risk_level === 'high_risk' || newEvt.risk_level === 'elevated_risk') {
              setLatestAlert(newEvt);
            }
          } else if (data.type === 'EVENTS_CLEARED') {
            setEvents([]);
            setLatestAlert(null);
          }
        } catch (e) {
          console.error("เกิดข้อผิดพลาดในการประมวลผลข้อความ WebSocket:", e);
        }
      };
    };

    connectWs();

    // Polling สถานะกล้องและเสียงแบบเบาๆ (ทุก 1 วินาที เพื่ออัปเดต VU meter และสถานะ)
    pollTimerRef.current = setInterval(async () => {
      try {
        const [camRes, audRes] = await Promise.all([
          fetch('/api/camera/status'),
          fetch('/api/audio/status')
        ]);
        if (camRes.ok) {
          const cData = await camRes.json();
          setCameraStatus(cData);
        }
        if (audRes.ok) {
          const aData = await audRes.json();
          setAudioStatus(aData);
        }
      } catch {
        // ignore
      }
    }, 1000);

    return () => {
      if (ws) ws.close();
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // สลับอุปกรณ์กล้อง
  const handleCameraChange = async (newCamId: number) => {
    setSelectedCameraId(newCamId);
    try {
      await fetch('/api/devices/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ camera_index: newCamId })
      });
      fetchData();
    } catch (err) {
      console.error("ไม่สามารถเปลี่ยนกล้องได้:", err);
    }
  };

  // สลับอุปกรณ์ไมโครโฟน
  const handleMicChange = async (newMicId: number | null) => {
    setSelectedMicId(newMicId);
    try {
      await fetch('/api/devices/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ microphone_index: newMicId })
      });
      fetchData();
    } catch (err) {
      console.error("ไม่สามารถเปลี่ยนไมค์ได้:", err);
    }
  };

  // เปิด/ปิด กล้องตรวจจับจริง
  const toggleCamera = async () => {
    setIsCameraLoading(true);
    try {
      if (cameraStatus.is_running) {
        const res = await fetch('/api/camera/stop', { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          setCameraStatus(data.camera);
        }
      } else {
        const res = await fetch(`/api/camera/start?camera_index=${selectedCameraId}`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          setCameraStatus(data.camera);
        }
      }
    } catch (err) {
      console.error("ไม่สามารถเปลี่ยนสถานะกล้องได้:", err);
    } finally {
      setIsCameraLoading(false);
    }
  };

  // เปิด/ปิด ไมโครโฟนตรวจจับเสียง
  const toggleAudio = async () => {
    try {
      if (audioStatus.is_running) {
        const res = await fetch('/api/audio/stop', { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          setAudioStatus(data.audio);
        }
      } else {
        const url = selectedMicId !== null ? `/api/audio/start?device_index=${selectedMicId}` : '/api/audio/start';
        const res = await fetch(url, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          setAudioStatus(data.audio);
        }
      }
    } catch (err) {
      console.error("ไม่สามารถเปลี่ยนสถานะไมค์ได้:", err);
    }
  };

  // ล้างประวัติทั้งหมด
  const handleClear = async () => {
    try {
      await fetch('/api/events/clear', { method: 'POST' });
    } catch (err) {
      console.error("ไม่สามารถล้างประวัติได้:", err);
    }
  };

  const latestEvent = events[0] || null;

  // คำนวณสรุปสถิติเซสชัน
  const highRiskCount = events.filter(e => e.risk_level === 'high_risk').length;
  const elevatedRiskCount = events.filter(e => e.risk_level === 'elevated_risk').length;
  const normalCount = events.filter(e => e.risk_level === 'normal').length;

  const getRiskBadge = (level?: RiskLevel) => {
    switch (level) {
      case 'high_risk':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30">
          <ShieldAlert className="w-3.5 h-3.5" /> เสี่ยงสูง (High Risk)
        </span>;
      case 'elevated_risk':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
          <AlertTriangle className="w-3.5 h-3.5" /> เฝ้าระวัง (Elevated Risk)
        </span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 className="w-3.5 h-3.5" /> ปกติ (Normal)
        </span>;
    }
  };

  const getRiskLevelText = (level?: RiskLevel) => {
    switch (level) {
      case 'high_risk': return 'เสี่ยงสูง (High Risk)';
      case 'elevated_risk': return 'เฝ้าระวัง (Elevated Risk)';
      case 'normal': return 'ปกติ (Normal)';
      default: return 'ยังไม่มีข้อมูล';
    }
  };

  const getStateColor = (state: string) => {
    switch (state) {
      case 'INTAKE': return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/40';
      case 'APPROACHING': return 'text-amber-400 bg-amber-500/20 border-amber-500/40';
      case 'RETRACTING': return 'text-cyan-400 bg-cyan-500/20 border-cyan-500/40';
      default: return 'text-slate-400 bg-slate-800 border-slate-700';
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans">
      {/* ส่วนหัวของหน้าเว็บ (Top Navigation) */}
      <header className="border-b border-slate-800 bg-[#0f1524]/80 backdrop-blur-md sticky top-0 z-30 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              SwallowSense
            </h1>
            <p className="text-xs text-slate-400">ระบบติดตามและเฝ้าระวังความผิดปกติในการกลืนและการรับประทานอาหาร (Multimodal Vision & Audio)</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
            <Radio className={`w-3.5 h-3.5 ${isConnected ? 'text-emerald-400 animate-pulse' : 'text-rose-400'}`} />
            <span className="text-slate-300">{isConnected ? 'เชื่อมต่อสด (WebSocket)' : 'ขาดการเชื่อมต่อ'}</span>
          </div>

          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
            <Camera className={`w-3.5 h-3.5 ${cameraStatus.is_running ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
            <span className="text-slate-300">กล้อง: <strong className={cameraStatus.is_running ? 'text-emerald-300' : 'text-slate-400'}>{cameraStatus.is_running ? 'เปิด' : 'ปิด'}</strong></span>
          </div>

          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
            <Mic className={`w-3.5 h-3.5 ${audioStatus.is_running ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
            <span className="text-slate-300">ไมค์: <strong className={audioStatus.is_running ? 'text-emerald-300' : 'text-slate-400'}>{audioStatus.is_running ? 'เปิด' : 'ปิด'}</strong></span>
          </div>
        </div>
      </header>

      {/* แถบเลือกอุปกรณ์นำเข้า (Device Selection Bar) */}
      <section className="bg-[#0b101c] border-b border-slate-800 px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Settings2 className="w-4 h-4 text-indigo-400" />
            <span>อุปกรณ์ตรวจจับ (Input Devices):</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            {/* Camera Select */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5">
              <Camera className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="text-slate-400">กล้อง:</span>
              <select
                value={selectedCameraId}
                onChange={(e) => handleCameraChange(parseInt(e.target.value))}
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer text-xs font-medium"
              >
                {cameras.map((c) => (
                  <option key={c.id} value={c.id} className="bg-slate-900 text-slate-200">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Microphone Select */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5">
              <Mic className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-slate-400">ไมค์:</span>
              <select
                value={selectedMicId ?? ''}
                onChange={(e) => handleMicChange(e.target.value === '' ? null : parseInt(e.target.value))}
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer text-xs font-medium max-w-[220px] truncate"
              >
                {microphones.map((m) => (
                  <option key={m.id} value={m.id} className="bg-slate-900 text-slate-200">
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Refresh Devices Button */}
            <button
              onClick={fetchDevices}
              disabled={isDeviceLoading}
              title="ค้นหาอุปกรณ์ใหม่ เช่น เสียบสาย iPhone / Bluetooth"
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isDeviceLoading ? 'animate-spin text-indigo-400' : ''}`} />
              <span className="text-[11px]">สแกนอุปกรณ์</span>
            </button>
          </div>
        </div>
      </section>

      {/* เนื้อหาหลัก (Main Content) */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* คอลัมน์ซ้าย (2 ส่วน): กล้องสด, ไมโครโฟนสด, สถานะปัจจุบัน, และ ประวัติเหตุการณ์ */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* การ์ดกล้องตรวจจับสด (Real-time Camera Feed) */}
          <div className="bg-[#10172a] border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <Video className="w-5 h-5 text-indigo-400" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-200">กล้องตรวจจับพฤติกรรมการกิน (Real-time Vision)</h2>
                  <p className="text-[11px] text-slate-400">อุปกรณ์: {cameras.find(c => c.id === selectedCameraId)?.name || `Camera #${selectedCameraId}`}</p>
                </div>
              </div>
              
              <button
                onClick={toggleCamera}
                disabled={isCameraLoading}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-md ${
                  cameraStatus.is_running
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                }`}
              >
                {cameraStatus.is_running ? (
                  <>
                    <CameraOff className="w-4 h-4" /> ปิดกล้องตรวจจับ
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" /> เปิดกล้องตรวจจับ
                  </>
                )}
              </button>
            </div>

            {/* Video Viewport */}
            <div className="relative aspect-video w-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
              {cameraStatus.is_running ? (
                <img
                  src="/api/camera/stream"
                  alt="Live Camera Feed"
                  className="w-full h-full object-contain"
                  onError={() => console.log('Camera stream waiting/disconnected')}
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-500 p-8 text-center">
                  <div className="p-4 rounded-full bg-slate-900 border border-slate-800 mb-3">
                    <Camera className="w-8 h-8 text-slate-600" />
                  </div>
                  <p className="text-sm font-medium text-slate-300">กล้องตรวจจับยังไม่ได้เปิดใช้งาน</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    กดปุ่ม <strong>"เปิดกล้องตรวจจับ"</strong> เพื่อเริ่มระบบตรวจจับใบหน้าและมือด้วย MediaPipe
                  </p>
                </div>
              )}

              {/* Status Overlay Tag */}
              {cameraStatus.is_running && (
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  <div className="px-2.5 py-1 rounded-md bg-slate-900/80 backdrop-blur-md border border-slate-700 text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                    LIVE {cameraStatus.fps > 0 ? `${cameraStatus.fps} FPS` : ''}
                  </div>
                </div>
              )}
            </div>

            {/* Live Camera Metrics Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-2">
              <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/80">
                <span className="text-[11px] text-slate-400 block">สถานะการกิน (State)</span>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-semibold border ${getStateColor(cameraStatus.state)}`}>
                  {cameraStatus.state}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/80">
                <span className="text-[11px] text-slate-400 block">จำนวนคำ (Bite Count)</span>
                <span className="text-lg font-bold font-mono text-indigo-400 mt-0.5 block">
                  {cameraStatus.bite_count} <span className="text-xs font-normal text-slate-400">คำ</span>
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/80">
                <span className="text-[11px] text-slate-400 block">การอ้าปาก (Mouth)</span>
                <span className={`text-xs font-semibold mt-1.5 block ${cameraStatus.is_mouth_open ? 'text-amber-400' : 'text-slate-300'}`}>
                  {cameraStatus.is_mouth_open ? '👄 อ้าปาก (OPEN)' : 'หุบปาก (CLOSED)'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/80">
                <span className="text-[11px] text-slate-400 block">ระยะมือถึงปาก</span>
                <span className="text-xs font-mono text-cyan-400 mt-1.5 block">
                  {cameraStatus.hand_dist !== null ? cameraStatus.hand_dist.toFixed(2) : 'ไม่พบมือ'}
                </span>
              </div>
            </div>
          </div>

          {/* การ์ดตรวจจับเสียงไมโครโฟนสด (Live Audio & Cough Monitor) */}
          <div className="bg-[#10172a] border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <Volume2 className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">ระบบดักฟังสัญญาณเสียงการกลืนและเสียงไอ (Live Audio Activity)</h3>
                  <p className="text-[11px] text-slate-400">ไมค์: {audioStatus.device_name}</p>
                </div>
              </div>

              <button
                onClick={toggleAudio}
                className={`px-3 py-1 rounded-xl text-xs font-medium flex items-center gap-1.5 border transition-all cursor-pointer ${
                  audioStatus.is_running
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                }`}
              >
                {audioStatus.is_running ? <><Mic className="w-3.5 h-3.5" /> เปิดดักฟังเสียง</> : <><MicOff className="w-3.5 h-3.5" /> ปิดเสียง</>}
              </button>
            </div>

            {/* Live VU Meter (Audio Energy Bar) */}
            <div className="space-y-2 pt-1">
              <div className="flex justify-between items-center text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${audioStatus.is_running ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'}`}></span>
                  ระดับพลังงานเสียงสด (Live Audio Level):
                </span>
                <span className="font-mono text-cyan-300 font-semibold">{Math.round(audioStatus.rms_level * 100)}%</span>
              </div>

              <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-800 p-0.5">
                <div 
                  className={`h-full rounded-full transition-all duration-75 ${
                    audioStatus.rms_level > 0.6 
                      ? 'bg-rose-500 shadow-rose-500/50 shadow-sm' 
                      : audioStatus.rms_level > 0.3 
                      ? 'bg-amber-400' 
                      : 'bg-cyan-400'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(2, audioStatus.rms_level * 100))}%` }}
                ></div>
              </div>

              <div className="flex items-center justify-between text-[11px] pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">สถานะเสียง:</span>
                  {audioStatus.last_sound === 'repetitive_coughing' ? (
                    <span className="text-rose-400 font-semibold bg-rose-500/20 px-2 py-0.5 rounded border border-rose-500/30">
                      🚨 ตรวจพบเสียงไอต่อเนื่อง!
                    </span>
                  ) : audioStatus.last_sound === 'mild_throat_clearing' ? (
                    <span className="text-amber-400 font-semibold bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">
                      ⚠️ มีเสียงกระแอม/ไอ
                    </span>
                  ) : (
                    <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      🎙️ สภาพแวดล้อมเงียบ/ปกติ
                    </span>
                  )}
                </div>

                <div className="text-slate-400 font-mono">
                  ไอสะสม: <strong className="text-slate-200">{audioStatus.total_cough_count}</strong> ครั้ง
                </div>
              </div>
            </div>
          </div>

          {/* การ์ดสรุปสถานะความเสี่ยงล่าสุด */}
          <div className="bg-[#10172a] border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">สถานะการเฝ้าระวังล่าสุด (Latest Risk Summary)</h2>
              {latestEvent && getRiskBadge(latestEvent.risk_level)}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-4">
                <span className="text-xs text-slate-400">ระดับความเสี่ยง</span>
                <p className="text-xl font-bold mt-1 text-slate-100 truncate">
                  {getRiskLevelText(latestEvent?.risk_level)}
                </p>
              </div>
              <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-4">
                <span className="text-xs text-slate-400">คะแนนความเสี่ยง (Risk Score)</span>
                <p className="text-2xl font-bold mt-1 text-indigo-400 font-mono">
                  {latestEvent ? `${Math.round(latestEvent.risk_score * 100)}%` : '--'}
                </p>
              </div>
              <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-4">
                <span className="text-xs text-slate-400">ความเชื่อมั่น (Confidence)</span>
                <p className="text-2xl font-bold mt-1 text-cyan-400 font-mono">
                  {latestEvent ? `${Math.round(latestEvent.confidence * 100)}%` : '--'}
                </p>
              </div>
            </div>

            {/* แบนเนอร์แจ้งเตือนเมื่อเกิดเหตุการณ์เสี่ยงสูง */}
            {latestAlert && (
              <div className="mt-5 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3.5">
                <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 shrink-0">
                  <Bell className="w-5 h-5 animate-bounce" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-rose-300">🚨 ส่งการแจ้งเตือนผู้ดูแลเรียบร้อยแล้ว</h4>
                    <span className="text-xs text-slate-400 font-mono">{new Date(latestAlert.timestamp).toLocaleTimeString('th-TH')}</span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    ตรวจพบเหตุการณ์ <strong>{EVENT_TYPE_LABELS[latestAlert.event_type] || latestAlert.event_type}</strong> ด้วยค่าความเสี่ยง {Math.round(latestAlert.risk_score * 100)}% 
                    ระบบได้ส่งข้อความผ่าน <span className="text-rose-400 font-medium">{latestAlert.alert_channel || 'LINE Channel'}</span>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ประวัติเหตุการณ์แบบเรียลไทม์ */}
          <div className="bg-[#10172a] border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col min-h-[480px]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-200">ประวัติเหตุการณ์ย้อนหลัง (Multimodal Event Log)</h3>
                <p className="text-xs text-slate-400">รายการตรวจจับสัญญาณการกลืนและพฤติกรรมจากกล้อง AI และไมโครโฟน</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchData}
                  title="รีเฟรชข้อมูล"
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={handleClear}
                  title="ล้างประวัติ"
                  className="p-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-900/40 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[450px] pr-1">
              {events.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-slate-500 text-sm">
                  <Activity className="w-8 h-8 mb-2 stroke-[1.5] text-slate-600" />
                  ยังไม่มีประวัติเหตุการณ์ ระบบกำลังเฝ้าระวังผ่านกล้องและไมโครโฟน
                </div>
              ) : (
                events.map((evt) => (
                  <div
                    key={evt.id}
                    className={`p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                      evt.risk_level === 'high_risk'
                        ? 'bg-rose-950/20 border-rose-500/30'
                        : evt.risk_level === 'elevated_risk'
                        ? 'bg-amber-950/20 border-amber-500/30'
                        : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-slate-400 font-mono">
                        {new Date(evt.timestamp).toLocaleTimeString('th-TH')}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-200">
                            {EVENT_TYPE_LABELS[evt.event_type] || evt.event_type}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                            evt.source.startsWith('mic') 
                              ? 'bg-cyan-900/50 text-cyan-300 border border-cyan-700/40' 
                              : 'bg-indigo-900/50 text-indigo-300 border border-indigo-700/40'
                          }`}>
                            {evt.source.startsWith('mic') ? '🎙️ AI Mic' : '📷 AI Camera'}
                          </span>
                          {evt.alert_triggered && (
                            <span className="text-[10px] bg-indigo-900/40 text-indigo-300 border border-indigo-700/40 px-1.5 py-0.5 rounded flex items-center gap-1">
                              <Bell className="w-2.5 h-2.5" /> ส่งแจ้งเตือนแล้ว
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap gap-x-3 gap-y-1 font-mono">
                          <span>ความเชื่อมั่น: <strong className="text-slate-300">{Math.round(evt.confidence * 100)}%</strong></span>
                          <span>ความเสี่ยง: <strong className="text-slate-300">{Math.round(evt.risk_score * 100)}%</strong></span>
                          {evt.duration && <span>ระยะเวลา: <strong className="text-slate-300">{evt.duration.toFixed(1)} วิ</strong></span>}
                          {evt.metadata?.bite_count && <span>คำที่: <strong className="text-slate-300">#{evt.metadata.bite_count}</strong></span>}
                          {evt.metadata?.cough_count && <span>ไอต่อเนื่อง: <strong className="text-rose-400">{evt.metadata.cough_count} ครั้ง</strong></span>}
                        </div>
                      </div>
                    </div>

                    <div>{getRiskBadge(evt.risk_level)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* คอลัมน์ขวา (1 ส่วน): สรุปสถิติเซสชัน & พารามิเตอร์การตรวจจับ & LINE */}
        <div className="space-y-6">

          {/* สรุปสถิติเซสชันการรับประทานอาหาร */}
          <div className="bg-[#10172a] border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-200">สรุปเซสชันปัจจุบัน (Session Stats)</h3>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
                  <span className="text-[11px] text-slate-400 block">จำนวนคำที่กลืน</span>
                  <span className="text-lg font-bold font-mono text-indigo-400 mt-0.5 block">{cameraStatus.bite_count} คำ</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
                  <span className="text-[11px] text-slate-400 block">จำนวนครั้งที่ไอ</span>
                  <span className="text-lg font-bold font-mono text-cyan-400 mt-0.5 block">{audioStatus.total_cough_count} ครั้ง</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="p-2.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-center">
                  <span className="text-[10px] text-emerald-400 block font-medium">ปกติ</span>
                  <span className="text-sm font-bold font-mono text-emerald-300 mt-0.5 block">{normalCount}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-500/30 text-center">
                  <span className="text-[10px] text-amber-400 block font-medium">เฝ้าระวัง</span>
                  <span className="text-sm font-bold font-mono text-amber-300 mt-0.5 block">{elevatedRiskCount}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-950/20 border border-rose-500/30 text-center">
                  <span className="text-[10px] text-rose-400 block font-medium">เสี่ยงสูง</span>
                  <span className="text-sm font-bold font-mono text-rose-300 mt-0.5 block">{highRiskCount}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ข้อมูลพารามิเตอร์การตรวจจับ AI (Vision & Audio Parameters) */}
          <div className="bg-[#10172a] border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-semibold text-slate-200">เกณฑ์การตรวจจับ (Multimodal Thresholds)</h3>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                <div className="text-slate-300">
                  <span>ตรวจจับเสียงไอฉับพลัน (Audio)</span>
                  <p className="text-[10px] text-slate-500">Transient Surge Threshold</p>
                </div>
                <span className="font-mono text-cyan-400 font-semibold">&gt; 3.0x Noise</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                <div className="text-slate-300">
                  <span>เตือนไอต่อเนื่อง (Audio)</span>
                  <p className="text-[10px] text-slate-500">Cough Frequency Window</p>
                </div>
                <span className="font-mono text-rose-400 font-semibold">&ge; 3 ครั้ง / 8 วิ</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                <div className="text-slate-300">
                  <span>ระยะมือเข้าใกล้ปาก (Vision)</span>
                  <p className="text-[10px] text-slate-500">Normalized Distance</p>
                </div>
                <span className="font-mono text-indigo-400 font-semibold">&lt; 0.14</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                <div className="text-slate-300">
                  <span>เกณฑ์ทานเร็วเกินไป (Vision)</span>
                  <p className="text-[10px] text-slate-500">Bite Interval Cooldown</p>
                </div>
                <span className="font-mono text-amber-400 font-semibold">&lt; 5.0 วินาที</span>
              </div>
            </div>
          </div>

          {/* กล่องข้อมูลระบบแจ้งเตือน LINE */}
          <div className="bg-[#10172a] border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-semibold text-slate-200">การแจ้งเตือนผ่าน LINE (LINE Alert)</h4>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              เมื่อระบบประเมินพบระดับ <span className="text-amber-300">เฝ้าระวัง (Elevated)</span> หรือ <span className="text-rose-400 font-semibold">เสี่ยงสูง (High Risk)</span> ระบบจะส่งข้อความแจ้งเตือนอัตโนมัติไปยังผู้ดูแล
            </p>
            <div className="mt-3 p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400 space-y-1 font-mono">
              <div>การตั้งค่า Token: <span className="text-slate-200">ไฟล์ .env</span></div>
              <div>โหมดการทำงาน: <span className="text-emerald-400">Push API / Console Mock</span></div>
            </div>
          </div>

        </div>

      </main>
    </div>
  );
}
