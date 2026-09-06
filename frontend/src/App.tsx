import React, { useEffect, useState, useRef } from 'react';
import type { SwallowEvent, MockScenario, RiskLevel } from './types';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Bell, 
  Send, 
  Trash2, 
  RefreshCw, 
  ShieldAlert, 
  Radio, 
  SlidersHorizontal,
  MessageSquare
} from 'lucide-react';

const EVENT_TYPE_LABELS: Record<string, string> = {
  'normal_swallow': 'การกลืนปกติ (Normal Swallow)',
  'normal_drinking': 'การดื่มน้ำปกติ (Drinking)',
  'mild_throat_clearing': 'กระแอม/เคลียร์ลำคอเบาๆ (Throat Clearing)',
  'repetitive_coughing': 'ไอต่อเนื่องหลายครั้ง (Repetitive Cough)',
  'possible_abnormal_event': 'ตรวจพบเหตุผิดปกติ/สงสัยการสำลัก (Possible Abnormal Event)',
};

export default function App() {
  const [events, setEvents] = useState<SwallowEvent[]>([]);
  const [scenarios, setScenarios] = useState<MockScenario[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isAutoSimulating, setIsAutoSimulating] = useState(false);
  const [latestAlert, setLatestAlert] = useState<SwallowEvent | null>(null);
  const [customEventType, setCustomEventType] = useState('possible_abnormal_event');
  const [customConfidence, setCustomConfidence] = useState(0.85);
  const [customRiskScore, setCustomRiskScore] = useState(0.75);

  const autoSimTimerRef = useRef<any>(null);

  // ดึงข้อมูลเหตุการณ์และสถานการณ์จำลองเริ่มต้น
  const fetchData = async () => {
    try {
      const [eventsRes, scenariosRes] = await Promise.all([
        fetch('/api/events'),
        fetch('/api/mock/scenarios')
      ]);
      if (eventsRes.ok) {
        const evts = await eventsRes.json();
        setEvents(evts);
      }
      if (scenariosRes.ok) {
        const scns = await scenariosRes.json();
        setScenarios(scns);
      }
    } catch (err) {
      console.error("เกิดข้อผิดพลาดในการดึงข้อมูล:", err);
    }
  };

  useEffect(() => {
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
        setTimeout(connectWs, 3000); // พยายามเชื่อมต่อใหม่
      };
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.type === 'NEW_EVENT') {
            const newEvt: SwallowEvent = data.event;
            setEvents((prev) => [newEvt, ...prev]);
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

    return () => {
      if (ws) ws.close();
    };
  }, []);

  // สั่งยิงสถานการณ์จำลอง
  const triggerScenario = async (idx: number) => {
    try {
      await fetch(`/api/mock/trigger/${idx}`, { method: 'POST' });
    } catch (err) {
      console.error("ไม่สามารถส่งข้อมูลจำลองได้:", err);
    }
  };

  // ส่งข้อมูลที่กำหนดเอง
  const triggerCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: customEventType,
          confidence: parseFloat(customConfidence.toString()),
          risk_score: parseFloat(customRiskScore.toString()),
          source: 'manual_mock_dashboard'
        })
      });
    } catch (err) {
      console.error("ไม่สามารถส่งข้อมูลกำหนดเองได้:", err);
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

  // ระบบจำลองอัตโนมัติ (Auto-simulate)
  useEffect(() => {
    if (isAutoSimulating) {
      autoSimTimerRef.current = setInterval(async () => {
        try {
          await fetch('/api/mock/random', { method: 'POST' });
        } catch (e) {
          console.error(e);
        }
      }, 4000);
    } else {
      if (autoSimTimerRef.current) clearInterval(autoSimTimerRef.current);
    }
    return () => {
      if (autoSimTimerRef.current) clearInterval(autoSimTimerRef.current);
    };
  }, [isAutoSimulating]);

  const latestEvent = events[0] || null;

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
            <p className="text-xs text-slate-400">ระบบติดตามและเฝ้าระวังความผิดปกติในการกลืนและการรับประทานอาหาร</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
            <Radio className={`w-3.5 h-3.5 ${isConnected ? 'text-emerald-400 animate-pulse' : 'text-rose-400'}`} />
            <span className="text-slate-300">{isConnected ? 'เชื่อมต่อสด (Live WebSocket)' : 'ขาดการเชื่อมต่อ'}</span>
          </div>

          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="text-slate-300">สถานะการตรวจจับ: <strong className="text-emerald-300">เปิดทำงาน</strong></span>
          </div>
        </div>
      </header>

      {/* เนื้อหาหลัก (Main Content) */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* คอลัมน์ซ้าย (2 ส่วน): การแสดงผลสถานะสด และ ประวัติเหตุการณ์ */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* การ์ดสรุปสถานะปัจจุบัน */}
          <div className="bg-[#10172a] border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">สถานะการเฝ้าระวังล่าสุด</h2>
              {latestEvent && getRiskBadge(latestEvent.risk_level)}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-4">
                <span className="text-xs text-slate-400">ระดับความเสี่ยงปัจจุบัน</span>
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
                <h3 className="text-base font-semibold text-slate-200">ประวัติเหตุการณ์ย้อนหลัง</h3>
                <p className="text-xs text-slate-400">รายการตรวจจับสัญญาณการกลืนและพฤติกรรมการรับประทานอาหาร</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchData}
                  title="รีเฟรชข้อมูล"
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={handleClear}
                  title="ล้างประวัติ"
                  className="p-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-900/40 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[450px] pr-1">
              {events.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-slate-500 text-sm">
                  <Activity className="w-8 h-8 mb-2 stroke-[1.5] text-slate-600" />
                  ยังไม่มีประวัติเหตุการณ์ สามารถกดจำลองเหตุการณ์จากเมนูด้านขวาได้
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
                          <span className="text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-800">
                            อุปกรณ์: {evt.source}
                          </span>
                          {evt.alert_triggered && (
                            <span className="text-[10px] bg-indigo-900/40 text-indigo-300 border border-indigo-700/40 px-1.5 py-0.5 rounded flex items-center gap-1">
                              <Bell className="w-2.5 h-2.5" /> ส่งแจ้งเตือนแล้ว
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 flex gap-3 font-mono">
                          <span>ความเชื่อมั่น: <strong className="text-slate-300">{Math.round(evt.confidence * 100)}%</strong></span>
                          <span>ความเสี่ยง: <strong className="text-slate-300">{Math.round(evt.risk_score * 100)}%</strong></span>
                          {evt.duration && <span>ระยะเวลา: <strong className="text-slate-300">{evt.duration} วินาที</strong></span>}
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

        {/* คอลัมน์ขวา (1 ส่วน): แผงควบคุม Mock & ข้อมูลการแจ้งเตือน LINE */}
        <div className="space-y-6">

          {/* แผงปุ่มจำลองเหตุการณ์ด่วน */}
          <div className="bg-[#10172a] border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">จำลองเหตุการณ์ (Mock Events)</h3>
                <p className="text-xs text-slate-400">ทดสอบยิงสัญญาณจากเซนเซอร์จำลอง</p>
              </div>
              <button
                onClick={() => setIsAutoSimulating(!isAutoSimulating)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  isAutoSimulating
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                {isAutoSimulating ? 'หยุดจำลองอัตโนมัติ' : 'จำลองอัตโนมัติ (4วิ)'}
              </button>
            </div>

            <div className="space-y-2">
              {scenarios.map((scn, idx) => (
                <button
                  key={idx}
                  onClick={() => triggerScenario(idx)}
                  className="w-full text-left p-3 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-slate-800 hover:border-indigo-500/40 transition-all flex items-center justify-between group"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-200 group-hover:text-indigo-300">
                      {EVENT_TYPE_LABELS[scn.event_type] || scn.event_type}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      ความเสี่ยง: {Math.round(scn.risk_score * 100)}% | ความเชื่อมั่น: {Math.round(scn.confidence * 100)}%
                    </div>
                  </div>
                  <Send className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400" />
                </button>
              ))}
            </div>
          </div>

          {/* แผงปรับแต่งค่าเหตุการณ์ด้วยตนเอง */}
          <div className="bg-[#10172a] border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <SlidersHorizontal className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-semibold text-slate-200">กำหนดค่าจำลองด้วยตนเอง</h3>
            </div>

            <form onSubmit={triggerCustom} className="space-y-3.5">
              <div>
                <label className="block text-xs text-slate-400 mb-1">ชื่อเหตุการณ์ (Event Type)</label>
                <input
                  type="text"
                  value={customEventType}
                  onChange={(e) => setCustomEventType(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>ระดับความเสี่ยง (Risk Score)</span>
                  <span className="font-mono text-indigo-400 font-semibold">{Math.round(customRiskScore * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={customRiskScore}
                  onChange={(e) => setCustomRiskScore(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>ระดับความเชื่อมั่น (Confidence)</span>
                  <span className="font-mono text-cyan-400 font-semibold">{Math.round(customConfidence * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={customConfidence}
                  onChange={(e) => setCustomConfidence(parseFloat(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors flex items-center justify-center gap-1.5 mt-2 cursor-pointer shadow-lg shadow-indigo-600/20"
              >
                <Send className="w-3.5 h-3.5" /> ส่งสัญญาณทดสอบ
              </button>
            </form>
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
