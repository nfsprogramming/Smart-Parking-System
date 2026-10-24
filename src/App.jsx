import { useState, useEffect, useRef, useMemo } from "react";
import {
  firebaseLogin, firebaseLogout,
  subscribeToSlots, subscribeToBookings,
  updateSlot, createBooking, closeBooking,
  getVehicles, getRevenue, seedFirestoreIfEmpty,
} from "./firebase.js";

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
const T = {
  bg0: "#07080c", bg1: "#0d0e14", bg2: "#12141c", bg3: "#181a25",
  border: "#1e2030", border2: "#252840",
  accent: "#00d4ff", accentDim: "#00d4ff22", accentHover: "#33ddff",
  green: "#00e676", greenDim: "#00e67622",
  red: "#ff4757", redDim: "#ff475722",
  amber: "#ffb300", amberDim: "#ffb30022",
  purple: "#b388ff", purpleDim: "#b388ff22",
  text0: "#f0f2ff", text1: "#a0a8c8", text2: "#505878", text3: "#303550",
  // Font system: Inter for UI, Space Mono for technical data, Orbitron for logo
  font: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
  fontMono: "'Space Mono', 'JetBrains Mono', 'Courier New', monospace",
  fontDisplay: "'Orbitron', sans-serif",
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const FLOORS = [
  { id: "B2", label: "BASEMENT 2", rate: 20 },
  { id: "B1", label: "BASEMENT 1", rate: 25 },
  { id: "GF", label: "GROUND FLOOR", rate: 40 },
  { id: "L1", label: "LEVEL 1", rate: 40 },
  { id: "L2", label: "LEVEL 2", rate: 35 },
  { id: "L3", label: "LEVEL 3 (ROOF)", rate: 30 },
];
const COLS = 8, ROWS = 4;
const SLOT_TYPES = ["standard", "standard", "standard", "standard", "ev", "standard", "disabled", "standard"];
const VEHICLE_TYPES = ["Car", "Bike", "SUV", "Truck", "EV Car"];
const USERS_DB = [
  { id: 1, name: "Admin User", email: "admin@parknet.in", password: "admin123", role: "admin", avatar: "AU" },
  { id: 2, name: "Operator Dev", email: "operator@parknet.in", password: "op123", role: "operator", avatar: "OD" },
  { id: 3, name: "Nifras NFS", email: "nfs@parknet.in", password: "nfs123", role: "user", avatar: "NF" },
];

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function uid() { return Math.random().toString(36).slice(2, 9).toUpperCase(); }
function plate() {
  const s = "ABCDEFGHJKLMNPRSTUVWXY";
  const r = () => s[rnd(0, s.length - 1)];
  return `TN${rnd(1,99).toString().padStart(2,"0")} ${r()}${r()} ${rnd(1000,9999)}`;
}
function fmt(ts) {
  if (!ts) return "–";
  const d = new Date(ts);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
function _fmtDate(ts) {
  if (!ts) return "–";
  return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function elapsed(since) {
  if (!since) return "–";
  const m = Math.floor((Date.now() - since) / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function fee(since, rate) {
  if (!since) return 0;
  const hrs = Math.max(0.5, (Date.now() - since) / 3600000);
  return Math.ceil(hrs) * rate;
}

function _genFloor(fid, rate) {
  const slots = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const occ = Math.random() < 0.52;
      const sinceMs = occ ? Date.now() - rnd(5, 240) * 60000 : null;
      slots.push({
        id: `${fid}-${r}-${c}`, fid, row: r, col: c,
        type: SLOT_TYPES[c % SLOT_TYPES.length],
        occupied: occ, reserved: !occ && Math.random() < 0.07,
        plate: occ ? plate() : null,
        since: sinceMs,
        vehicleType: occ ? VEHICLE_TYPES[rnd(0, VEHICLE_TYPES.length - 1)] : null,
        bookingId: occ ? uid() : null,
        rate,
      });
    }
  }
  return slots;
}

function _initParkingData() {
  const data = {};
  FLOORS.forEach(f => { data[f.id] = _genFloor(f.id, f.rate); });
  return data;
}

function _genRevenueData() {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push({
      date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      revenue: rnd(8000, 28000),
      bookings: rnd(80, 320),
      vehicles: rnd(60, 280),
    });
  }
  return days;
}

function _genBookingHistory() {
  const bookings = [];
  for (let i = 0; i < 40; i++) {
    const ago = rnd(10, 480);
    const dur = rnd(30, 300);
    const fObj = FLOORS[rnd(0, FLOORS.length - 1)];
    const r = rnd(0, ROWS - 1), c = rnd(0, COLS - 1);
    bookings.push({
      id: uid(), plate: plate(),
      slot: `${String.fromCharCode(65 + r)}${c + 1}`,
      floor: fObj.id, floorLabel: fObj.label,
      entry: Date.now() - ago * 60000,
      exit: Date.now() - (ago - dur) * 60000,
      duration: dur, fee: Math.ceil(dur / 60) * fObj.rate + fObj.rate,
      vehicle: VEHICLE_TYPES[rnd(0, VEHICLE_TYPES.length - 1)],
      status: "completed",
      payment: ["UPI", "Cash", "Card", "FASTag"][rnd(0, 3)],
    });
  }
  return bookings.sort((a, b) => b.entry - a.entry);
}

function _genVehicles() {
  const veh = [];
  for (let i = 0; i < 18; i++) {
    veh.push({
      id: uid(), plate: plate(),
      owner: ["Arjun R", "Priya S", "Karthik M", "Divya N", "Ravi K", "Sunitha P"][rnd(0, 5)],
      type: VEHICLE_TYPES[rnd(0, VEHICLE_TYPES.length - 1)],
      visits: rnd(3, 45), totalFee: rnd(500, 12000),
      lastSeen: Date.now() - rnd(10, 5000) * 60000,
      tag: Math.random() > 0.5 ? "VIP" : Math.random() > 0.5 ? "Monthly" : null,
    });
  }
  return veh;
}

// ─── HOOKS & MINI-COMPONENTS ──────────────────────────────────────────────────
function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    const end = typeof target === "number" ? target : 0;
    let t0 = null;
    function step(ts) {
      if (!t0) t0 = ts;
      const p = Math.min((ts - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(end * eased));
      if (p < 1) ref.current = requestAnimationFrame(step);
    }
    cancelAnimationFrame(ref.current);
    ref.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(ref.current);
  }, [target, duration]);
  return val;
}

function Sparkline({ data, color, height = 28, width = 72 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data); const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * width,
    height - ((v - min) / range) * (height - 4) - 2,
  ]);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${d} L${width},${height} L0,${height} Z`;
  const gid = `sg${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill={color} />
    </svg>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [parking, setParking] = useState({});
  const [revenue, setRevenue] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [activeFloor, setActiveFloor] = useState("GF");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [aiChat, setAiChat] = useState([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [searchPlate, setSearchPlate] = useState("");
  const [checkinForm, setCheckinForm] = useState({ plate: "", vehicle: "Car", name: "" });
  const [sideOpen, setSideOpen] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const [recentSlots, setRecentSlots] = useState(new Set());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Ctrl+K command palette
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); setCmdOpen(o => !o); setCmdQuery(""); }
      if (e.key === "Escape") { setCmdOpen(false); setNotifOpen(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    seedFirestoreIfEmpty();
    const unsubSlots = subscribeToSlots((data) => {
      setParking(prev => {
        // detect changed slots for pulse animation
        const changed = [];
        Object.entries(data).forEach(([fid, slots]) => {
          (slots || []).forEach(s => {
            const old = (prev[fid] || []).find(p => p.id === s.id);
            if (old && old.occupied !== s.occupied) {
              changed.push(s.id);
              const notif = {
                id: Date.now() + Math.random(), time: Date.now(),
                msg: s.occupied ? `↑ Check-in · ${s.plate}` : `↓ Check-out · Slot ${fid}`,
                type: s.occupied ? "in" : "out",
              };
              setNotifications(prev => [notif, ...prev].slice(0, 20));
            }
          });
        });
        if (changed.length) {
          setRecentSlots(prev => { const n = new Set(prev); changed.forEach(id => n.add(id)); return n; });
          setTimeout(() => setRecentSlots(prev => { const n = new Set(prev); changed.forEach(id => n.delete(id)); return n; }), 2000);
        }
        return data;
      });
    });
    const unsubBookings = subscribeToBookings(setBookings);
    getVehicles().then(setVehicles);
    getRevenue().then(setRevenue);
    return () => { unsubSlots(); unsubBookings(); };
  }, []);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleCheckIn() {
    if (!selectedSlot || !checkinForm.plate) return;
    const plate = checkinForm.plate.toUpperCase();
    const since = Date.now();
    const bookingId = Math.random().toString(36).slice(2, 9).toUpperCase();
    try {
      await updateSlot(selectedSlot.id, {
        occupied: true, plate, since, vehicleType: checkinForm.vehicle, bookingId,
      });
      await createBooking({
        id: bookingId, plate,
        slot: `${String.fromCharCode(65 + selectedSlot.row)}${selectedSlot.col + 1}`,
        floor: selectedSlot.fid,
        floorLabel: FLOORS.find(f => f.id === selectedSlot.fid)?.label,
        entry: since, exit: null, duration: null, fee: null,
        vehicle: checkinForm.vehicle, status: "active", payment: null,
      });
      setModal(null); setSelectedSlot(null);
      showToast(`✅ Checked in · ${plate}`);
      setCheckinForm({ plate: "", vehicle: "Car", name: "" });
    } catch {
      showToast("Check-in failed — try again", "error");
    }
  }

  async function handleCheckOut() {
    if (!selectedSlot) return;
    const s = selectedSlot;
    const amt = fee(s.since, s.rate);
    const duration = Math.floor((Date.now() - s.since) / 60000);
    try {
      await updateSlot(s.id, {
        occupied: false, plate: null, since: null, vehicleType: null, bookingId: null,
      });
      if (s.bookingId) {
        await closeBooking(s.bookingId, { fee: amt, duration, payment: "UPI" });
      }
      setModal(null); setSelectedSlot(null);
      showToast(`✅ Checked out · ₹${amt} collected`);
    } catch {
      showToast("Check-out failed — try again", "error");
    }
  }

  async function sendAiMessage() {
    if (!aiInput.trim() || aiLoading) return;
    const msg = aiInput.trim();
    setAiInput("");
    setAiLoading(true);
    const allSlots = Object.values(parking).flat();
    const totalSlots = allSlots.length;
    const freeSlots = allSlots.filter(s => !s.occupied && !s.reserved).length;
    const occupiedSlots = allSlots.filter(s => s.occupied).length;
    const floorStats = FLOORS.map(f => {
      const fs = parking[f.id] || [];
      const free = fs.filter(s => !s.occupied && !s.reserved).length;
      return `${f.label}: ${free}/${fs.length} free`;
    }).join(", ");
    const context = `You are an AI assistant for PARKNET Smart Parking Management System. Current stats: ${totalSlots} total slots, ${freeSlots} free, ${occupiedSlots} occupied. Floor breakdown: ${floorStats}. Today's revenue is estimated ₹${(occupiedSlots * 35).toLocaleString("en-IN")}. Active bookings: ${bookings.filter(b => b.status === "active").length}. Answer concisely and practically. Use Indian context (₹, Tamil Nadu plates, etc).`;
    const newChat = [...aiChat, { role: "user", content: msg }];
    setAiChat(newChat);
    try {
      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
      if (!apiKey) {
        setAiChat([...newChat, { role: "assistant", content: "Missing VITE_ANTHROPIC_API_KEY in environment variables." }]);
        setAiLoading(false);
        return;
      }
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerously-allow-browser": "true"
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20240620",
          max_tokens: 1000,
          system: context,
          messages: newChat.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || "Unable to respond.";
      setAiChat([...newChat, { role: "assistant", content: reply }]);
    } catch {
      setAiChat([...newChat, { role: "assistant", content: "Connection error. Please try again." }]);
    }
    setAiLoading(false);
  }

  const globalStats = useMemo(() => {
    const all = Object.values(parking).flat();
    return {
      total: all.length, free: all.filter(s => !s.occupied && !s.reserved).length,
      occupied: all.filter(s => s.occupied).length, reserved: all.filter(s => s.reserved).length,
      ev: all.filter(s => s.type === "ev" && !s.occupied).length,
      revenue: all.filter(s => s.occupied).reduce((acc, s) => acc + fee(s.since, s.rate), 0),
    };
  }, [parking]);

  if (!user) return <LoginScreen onLogin={u => { setUser(u); showToast(`Welcome back, ${u.name.split(" ")[0]}!`); }} />;

  const currentSlots = parking[activeFloor] || [];
  const filtered = currentSlots.filter(s => {
    if (filterType !== "all" && s.type !== filterType) return false;
    if (searchPlate && !s.plate?.includes(searchPlate.toUpperCase())) return false;
    return true;
  });

  const pages = {
    dashboard: <Dashboard stats={globalStats} parking={parking} revenue={revenue} bookings={bookings} />,
    map: <ParkingMap
      floors={FLOORS} parking={parking} activeFloor={activeFloor} setActiveFloor={setActiveFloor}
      filtered={filtered} selected={selectedSlot} onSelect={setSelectedSlot}
      filterType={filterType} setFilterType={setFilterType}
      searchPlate={searchPlate} setSearchPlate={setSearchPlate}
      onCheckIn={() => setModal("checkin")} onCheckOut={() => setModal("checkout")}
      user={user} recentSlots={recentSlots}
    />,
    bookings: <BookingsPage bookings={bookings} />,
    vehicles: <VehiclesPage vehicles={vehicles} />,
    reports: <ReportsPage revenue={revenue} bookings={bookings} stats={globalStats} />,
    settings: <SettingsPage user={user} />,
  };

  const navItems = [
    { id: "dashboard", icon: "⬡", label: "DASHBOARD" },
    { id: "map", icon: "◈", label: "LIVE MAP" },
    { id: "bookings", icon: "◉", label: "BOOKINGS" },
    { id: "vehicles", icon: "◈", label: "VEHICLES" },
    { id: "reports", icon: "◫", label: "REPORTS" },
    ...(user.role === "admin" ? [{ id: "settings", icon: "◌", label: "SETTINGS" }] : []),
  ];

  return (
    <div style={{ display: "flex", height: "100vh", background: T.bg0, color: T.text0, fontFamily: T.font, overflow: "hidden" }}>
      {/* Sidebar */}
      <aside style={{
        width: sideOpen ? 220 : 60, transition: "width 0.3s cubic-bezier(.4,0,.2,1)",
        background: T.bg1, borderRight: `1px solid ${T.border}`,
        display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden",
      }}>
        {/* Logo */}
        <div style={{ padding: "20px 16px 16px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, background: `linear-gradient(135deg, ${T.accent}, #0080ff)`,
              borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, flexShrink: 0,
            }}>⬡</div>
            {sideOpen && <div>
              <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: 4, color: T.text0, fontFamily: T.fontDisplay }}>PARKNET</div>
              <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: 2, color: T.text2, marginTop: 2 }}>SMART PARKING v2.0</div>
            </div>}
          </div>
        </div>
        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 0" }}>
          {navItems.map(n => (
            <button key={n.id} onClick={() => setPage(n.id)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 12,
              padding: sideOpen ? "11px 16px" : "11px 0", justifyContent: sideOpen ? "flex-start" : "center",
              background: page === n.id ? T.accentDim : "transparent",
              border: "none", borderLeft: `3px solid ${page === n.id ? T.accent : "transparent"}`,
              color: page === n.id ? T.accent : T.text2, cursor: "pointer",
              fontSize: 12, fontWeight: 600, fontFamily: T.font, transition: "all 0.15s",
              letterSpacing: 0.3,
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{n.icon}</span>
              {sideOpen && <span>{n.label}</span>}
            </button>
          ))}
        </nav>
        {/* AI Button */}
        <div style={{ padding: "12px 10px", borderTop: `1px solid ${T.border}` }}>
          <button onClick={() => setModal("ai")} style={{
            width: "100%", padding: sideOpen ? "10px 14px" : "10px 0",
            background: `linear-gradient(135deg, #b388ff18, #00d4ff18)`,
            border: `1px solid ${T.purple}44`, borderRadius: 10,
            color: T.purple, cursor: "pointer", fontSize: 12, fontWeight: 700,
            fontFamily: T.font, display: "flex", alignItems: "center", gap: 8,
            justifyContent: sideOpen ? "flex-start" : "center",
          }}>
            <span style={{ fontSize: 16 }}>◈</span>
            {sideOpen && "AI Assistant"}
          </button>
        </div>
        {/* User */}
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg, ${T.accent}44, ${T.purple}44)`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0,
          }}>{user.avatar}</div>
          {sideOpen && <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.accent, letterSpacing: 2, textTransform: "uppercase", marginTop: 1 }}>{user.role}</div>
          </div>}
          {sideOpen && <button onClick={() => { firebaseLogout(); setUser(null); }} style={{ background: "transparent", border: "none", color: T.text2, cursor: "pointer", fontSize: 14, padding: 4 }}>⏏</button>}
        </div>
        <button onClick={() => setSideOpen(p => !p)} style={{
          background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 0,
          color: T.text2, cursor: "pointer", padding: "8px", fontSize: 12,
        }}>{sideOpen ? "◀" : "▶"}</button>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Topbar */}
        <header style={{
          height: 52, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 24px", borderBottom: `1px solid ${T.border}`, background: T.bg1, flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.3, color: T.text0 }}>
              {navItems.find(n => n.id === page)?.label}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: T.green, animation: "livePulse 2s infinite" }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: T.green }}>LIVE</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text2 }}>
              <span style={{ color: T.green, fontWeight: 800 }}>{globalStats.free}</span> / {globalStats.total} free
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.amber }}>
              ₹{globalStats.revenue.toLocaleString("en-IN")} today
            </div>
            {/* Ctrl+K palette button */}
            <button onClick={() => { setCmdOpen(true); setCmdQuery(""); }} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
              background: T.bg2, border: `1px solid ${T.border2}`, borderRadius: 8,
              color: T.text2, cursor: "pointer", fontSize: 11, fontFamily: T.font,
            }}>
              <span>🔍</span>
              <span style={{ display: "flex", gap: 3 }}>
                <kbd style={{ background: T.bg3, border: `1px solid ${T.border2}`, borderRadius: 4, padding: "1px 5px", fontSize: 10, color: T.text1 }}>Ctrl</kbd>
                <kbd style={{ background: T.bg3, border: `1px solid ${T.border2}`, borderRadius: 4, padding: "1px 5px", fontSize: 10, color: T.text1 }}>K</kbd>
              </span>
            </button>
            {/* Notification bell */}
            <div style={{ position: "relative" }}>
              <button onClick={() => setNotifOpen(o => !o)} style={{
                background: "transparent", border: "none", cursor: "pointer",
                fontSize: 18, position: "relative", padding: "4px 6px", lineHeight: 1,
              }}>
                🔔
                {notifications.filter(n => now - n.time < 60000).length > 0 && (
                  <span style={{
                    position: "absolute", top: 0, right: 0, width: 16, height: 16,
                    background: T.red, borderRadius: "50%", fontSize: 9, fontWeight: 800,
                    color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{Math.min(notifications.filter(n => now - n.time < 60000).length, 9)}</span>
                )}
              </button>
              {notifOpen && (
                <div style={{
                  position: "absolute", right: 0, top: "calc(100% + 8px)", width: 300, zIndex: 1000,
                  background: T.bg2, border: `1px solid ${T.border2}`, borderRadius: 14,
                  boxShadow: "0 20px 60px rgba(0,0,0,0.5)", overflow: "hidden",
                }}>
                  <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.text0 }}>Activity Feed</span>
                    <button onClick={() => setNotifications([])} style={{ background: "none", border: "none", color: T.text2, cursor: "pointer", fontSize: 11 }}>Clear</button>
                  </div>
                  <div style={{ maxHeight: 320, overflowY: "auto" }}>
                    {notifications.length === 0
                      ? <div style={{ padding: "20px 16px", color: T.text2, fontSize: 12, textAlign: "center" }}>No recent activity</div>
                      : notifications.map(n => (
                        <div key={n.id} style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 16 }}>{n.type === "in" ? "🟢" : "🔴"}</span>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: T.text0 }}>{n.msg}</div>
                            <div style={{ fontSize: 10, color: T.text2, marginTop: 2 }}>{Math.round((now - n.time) / 1000)}s ago</div>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
            <div style={{ fontSize: 12, fontWeight: 500, color: T.text2, fontFamily: T.fontMono }}>{new Date(now).toLocaleTimeString("en-IN")}</div>
          </div>
        </header>

        {/* Page content */}
        <div style={{ flex: 1, overflow: "auto" }}>{pages[page]}</div>
      </div>

      {/* Command Palette */}
      {cmdOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "15vh", backdropFilter: "blur(4px)" }}
          onClick={() => setCmdOpen(false)}>
          <div style={{ width: 560, background: T.bg2, border: `1px solid ${T.border2}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 40px 80px rgba(0,0,0,0.6)", animation: "fadeIn 0.15s ease" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${T.border}`, gap: 10 }}>
              <span style={{ fontSize: 16 }}>🔍</span>
              <input autoFocus value={cmdQuery} onChange={e => setCmdQuery(e.target.value)}
                placeholder="Search pages, actions…" style={{ flex: 1, background: "none", border: "none", outline: "none", color: T.text0, fontSize: 15, fontFamily: T.font }} />
              <kbd style={{ background: T.bg3, border: `1px solid ${T.border2}`, borderRadius: 4, padding: "2px 8px", fontSize: 10, color: T.text2 }}>ESC</kbd>
            </div>
            <div style={{ padding: "8px 0", maxHeight: 360, overflowY: "auto" }}>
              {[
                { label: "Dashboard", icon: "⬡", id: "dashboard", desc: "Overview & KPIs" },
                { label: "Live Map", icon: "◈", id: "map", desc: "6-floor parking grid" },
                { label: "Bookings", icon: "◉", id: "bookings", desc: "Booking history" },
                { label: "Vehicles", icon: "🚗", id: "vehicles", desc: "Vehicle registry" },
                { label: "Reports", icon: "◫", id: "reports", desc: "Revenue analytics" },
                { label: "Settings", icon: "◌", id: "settings", desc: "System configuration" },
                { label: "AI Assistant", icon: "◈", id: "ai", desc: "Parking recommendations" },
              ].filter(item => !cmdQuery || item.label.toLowerCase().includes(cmdQuery.toLowerCase()) || item.desc.toLowerCase().includes(cmdQuery.toLowerCase()))
               .map(item => (
                <button key={item.id} onClick={() => { if (item.id === "ai") setModal("ai"); else setPage(item.id); setCmdOpen(false); }} style={{
                  width: "100%", padding: "12px 18px", display: "flex", alignItems: "center", gap: 14,
                  background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
                  transition: "background 0.1s",
                }}
                  onMouseEnter={e => e.currentTarget.style.background = T.bg3}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span style={{ fontSize: 20, width: 28, textAlign: "center" }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text0 }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: T.text2 }}>{item.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}


      {/* Modals */}
      {modal === "checkin" && selectedSlot && !selectedSlot.occupied && (
        <Modal title="CHECK IN VEHICLE" onClose={() => setModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <InfoRow label="SLOT" value={`${String.fromCharCode(65 + selectedSlot.row)}${selectedSlot.col + 1} · ${activeFloor}`} />
            <InfoRow label="TYPE" value={selectedSlot.type.toUpperCase()} />
            <Label text="LICENSE PLATE" />
            <input value={checkinForm.plate} onChange={e => setCheckinForm(p => ({ ...p, plate: e.target.value }))}
              placeholder="TN 01 AB 1234" style={inputStyle} />
            <Label text="VEHICLE TYPE" />
            <select value={checkinForm.vehicle} onChange={e => setCheckinForm(p => ({ ...p, vehicle: e.target.value }))} style={inputStyle}>
              {VEHICLE_TYPES.map(v => <option key={v}>{v}</option>)}
            </select>
            <Label text="OWNER NAME (OPTIONAL)" />
            <input value={checkinForm.name} onChange={e => setCheckinForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Customer name" style={inputStyle} />
            <Btn text="CONFIRM CHECK IN" color={T.green} onClick={handleCheckIn} />
          </div>
        </Modal>
      )}

      {modal === "checkout" && selectedSlot && selectedSlot.occupied && (
        <Modal title="CHECK OUT VEHICLE" onClose={() => setModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <InfoRow label="PLATE" value={selectedSlot.plate} accent />
            <InfoRow label="SLOT" value={`${String.fromCharCode(65 + selectedSlot.row)}${selectedSlot.col + 1} · ${activeFloor}`} />
            <InfoRow label="VEHICLE" value={selectedSlot.vehicleType} />
            <InfoRow label="ENTRY" value={fmt(selectedSlot.since)} />
            <InfoRow label="DURATION" value={elapsed(selectedSlot.since)} />
            <InfoRow label="RATE" value={`₹${selectedSlot.rate}/hr`} />
            <div style={{
              background: T.amberDim, border: `1px solid ${T.amber}44`, borderRadius: 8, padding: "14px 18px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: 10, letterSpacing: 3, color: T.amber }}>TOTAL AMOUNT</span>
              <span style={{ fontSize: 24, fontWeight: 800, color: T.amber }}>₹{fee(selectedSlot.since, selectedSlot.rate)}</span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {["UPI", "Card", "Cash", "FASTag"].map(p => (
                <button key={p} style={{
                  flex: 1, padding: "8px", background: T.bg3, border: `1px solid ${T.border2}`,
                  color: T.text1, borderRadius: 6, cursor: "pointer", fontSize: 9, letterSpacing: 1, fontFamily: T.font,
                }}>{p}</button>
              ))}
            </div>
            <Btn text="CONFIRM CHECK OUT" color={T.red} onClick={handleCheckOut} />
          </div>
        </Modal>
      )}

      {modal === "ai" && (
        <Modal title="AI PARKING ASSISTANT" onClose={() => setModal(null)} wide>
          <AiChat chat={aiChat} input={aiInput} setInput={setAiInput} onSend={sendAiMessage} loading={aiLoading} />
        </Modal>
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 28, right: 28, zIndex: 9999,
          background: toast.type === "success" ? `${T.bg2}ee` : `${T.bg2}ee`,
          border: `1px solid ${toast.type === "success" ? T.green : T.red}`,
          color: toast.type === "success" ? T.green : T.red,
          borderRadius: 12, padding: "14px 22px", fontSize: 13, fontWeight: 600,
          boxShadow: `0 8px 32px rgba(0,0,0,0.4)`,
          animation: "fadeIn 0.25s ease", backdropFilter: "blur(8px)",
        }}>{toast.msg}</div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Orbitron:wght@700;900&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: ${T.font}; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: ${T.bg1}; }
        ::-webkit-scrollbar-thumb { background: ${T.border2}; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: ${T.accent}44; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes livePulse { 0%,100% { box-shadow: 0 0 0 0 ${T.green}66; } 70% { box-shadow: 0 0 0 6px transparent; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes slotPulse { 0%,100% { transform: scale(1); box-shadow: none; } 40% { transform: scale(1.12); box-shadow: 0 0 18px ${T.green}; } }
        select option { background: ${T.bg2}; color: ${T.text0}; font-family: ${T.font}; }
        button { font-family: ${T.font}; }
        input, select { font-family: ${T.font}; }
      `}</style>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("admin@parknet.in");
  const [pass, setPass] = useState("admin123");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true); setErr("");
    try {
      const u = await firebaseLogin(email, pass);
      onLogin(u);
    } catch (e) {
      setErr(e.message?.includes("auth") ? "Invalid credentials" : "Connection error");
      setLoading(false);
    }
  }



  return (
    <div style={{
      height: "100vh", background: T.bg0, display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: T.font, position: "relative", overflow: "hidden",
    }}>
      {/* Animated background dots */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `radial-gradient(circle, ${T.border} 1px, transparent 1px)`,
          backgroundSize: "32px 32px", opacity: 0.6,
        }} />
        <div style={{
          position: "absolute", top: "20%", left: "10%", width: 400, height: 400,
          background: `radial-gradient(circle, ${T.accent}08, transparent 70%)`,
          borderRadius: "50%",
        }} />
        <div style={{
          position: "absolute", bottom: "15%", right: "8%", width: 300, height: 300,
          background: `radial-gradient(circle, ${T.purple}08, transparent 70%)`,
          borderRadius: "50%",
        }} />
      </div>

      <div style={{
        position: "relative", width: 440, background: T.bg1, border: `1px solid ${T.border2}`,
        borderRadius: 20, padding: "40px 44px", animation: "fadeIn 0.5s ease",
        boxShadow: `0 0 0 1px ${T.border}, 0 40px 80px rgba(0,0,0,0.6), 0 0 60px ${T.accent}0a`,
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            width: 64, height: 64, background: `linear-gradient(135deg, ${T.accent}, #0055ff)`,
            borderRadius: 18, display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 30, marginBottom: 18,
            boxShadow: `0 0 0 1px ${T.accent}33, 0 20px 40px ${T.accent}22`,
          }}>⬡</div>
          <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 8, color: T.text0, fontFamily: T.fontDisplay }}>PARKNET</div>
          <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: 3, color: T.text2, marginTop: 6, textTransform: "uppercase" }}>
            Smart Parking Management
          </div>
        </div>

        {/* Form */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.text2, letterSpacing: 1, marginBottom: 7, textTransform: "uppercase" }}>Email</div>
          <input value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="you@parknet.in" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.text2, letterSpacing: 1, marginBottom: 7, textTransform: "uppercase" }}>Password</div>
          <input type="password" value={pass} onChange={e => setPass(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="••••••••" style={inputStyle} />
        </div>

        {err && (
          <div style={{
            background: T.redDim, border: `1px solid ${T.red}44`, borderRadius: 8,
            padding: "10px 14px", fontSize: 13, color: T.red, marginBottom: 12, marginTop: 6,
          }}>⚠ {err}</div>
        )}

        <div style={{ marginBottom: 18 }} />
        <Btn text={loading ? "Signing in..." : "Sign In →"} color={T.accent} onClick={handleLogin} />




      </div>
    </div>
  );
}


// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, color, icon, sparkData, prefix = "" }) {
  const numVal = typeof value === "number" ? value : null;
  const counted = useCountUp(numVal || 0);
  const display = numVal !== null ? `${prefix}${counted.toLocaleString("en-IN")}` : value;
  return (
    <div style={{
      background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 20px",
      transition: "all 0.2s", cursor: "default", position: "relative", overflow: "hidden",
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color + "55"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.transform = ""; }}
    >
      <div style={{ position: "absolute", bottom: 0, right: 0, opacity: 0.15, pointerEvents: "none" }}>
        <Sparkline data={sparkData || []} color={color} width={90} height={50} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.text2 }}>{label}</div>
        <span style={{ fontSize: 18, filter: "drop-shadow(0 0 6px " + color + ")" }}>{icon}</span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 900, color, letterSpacing: -1, lineHeight: 1 }}>{display}</div>
      {sparkData && sparkData.length > 1 && (
        <div style={{ marginTop: 10 }}>
          <Sparkline data={sparkData} color={color} width={100} height={24} />
        </div>
      )}
    </div>
  );
}

function Dashboard({ stats, parking, revenue, bookings }) {
  const [hoverBar, setHoverBar] = useState(null);
  const recent7 = revenue.slice(-7);
  const maxRev = Math.max(...recent7.map(d => d.revenue), 1);
  const activeBookings = bookings.filter(b => b.status === "active").slice(0, 8);
  const revenueSpark = revenue.slice(-14).map(d => d.revenue);

  const floorOccupancy = FLOORS.map(f => {
    const sl = parking[f.id] || [];
    const occ = sl.filter(s => s.occupied).length;
    const pct = sl.length ? Math.round((occ / sl.length) * 100) : 0;
    return { ...f, occ, total: sl.length, pct };
  });

  const todayRev = recent7[recent7.length - 1]?.revenue || 0;
  const avgRev = Math.round(recent7.reduce((a, d) => a + d.revenue, 0) / (recent7.length || 1));

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, overflowY: "auto", height: "100%" }}>
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <KpiCard label="Total Slots" value={stats.total} color={T.text1} icon="🅿" sparkData={[30, 32, 31, 32, 32, 32, stats.total]} />
        <KpiCard label="Available" value={stats.free} color={T.green} icon="✓" sparkData={revenueSpark.map((_, i, a) => a.length - i)} />
        <KpiCard label="Occupied" value={stats.occupied} color={T.red} icon="🚗" sparkData={revenueSpark} />
        <KpiCard label="Live Revenue" value={stats.revenue} color={T.amber} icon="₹" prefix="₹" sparkData={revenueSpark} />
        <KpiCard label="EV Free" value={stats.ev} color={T.accent} icon="⚡" sparkData={[2, 4, 3, 5, 4, 6, stats.ev]} />
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        {/* Revenue SVG Chart */}
        <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 14, padding: "22px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text0 }}>7-Day Revenue</div>
              <div style={{ fontSize: 11, color: T.text2, marginTop: 2 }}>Hover bars for details</div>
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              {[
                { label: "Today", value: `₹${todayRev.toLocaleString("en-IN")}`, color: T.accent },
                { label: "Avg/day", value: `₹${avgRev.toLocaleString("en-IN")}`, color: T.green },
                { label: "Bookings", value: recent7[recent7.length - 1]?.bookings || 0, color: T.amber },
              ].map(m => (
                <div key={m.label} style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: T.text2, fontWeight: 600 }}>{m.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: m.color }}>{m.value}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ position: "relative", height: 120 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100, paddingTop: 4 }}>
              {recent7.map((d, i) => {
                const h = Math.max(8, (d.revenue / maxRev) * 90);
                const isHov = hoverBar === i;
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}
                    onMouseEnter={() => setHoverBar(i)} onMouseLeave={() => setHoverBar(null)}>
                    {isHov && (
                      <div style={{
                        position: "absolute", bottom: 110, left: `${(i / recent7.length) * 100 + 5}%`,
                        background: T.bg3, border: `1px solid ${T.border2}`, borderRadius: 8,
                        padding: "6px 10px", fontSize: 11, fontWeight: 600, color: T.text0,
                        whiteSpace: "nowrap", zIndex: 10, pointerEvents: "none",
                        boxShadow: `0 4px 20px rgba(0,0,0,0.4)`,
                      }}>
                        {d.date}: ₹{d.revenue.toLocaleString("en-IN")}
                      </div>
                    )}
                    <div style={{
                      width: "100%", borderRadius: "4px 4px 0 0",
                      height: `${h}px`,
                      background: isHov
                        ? `linear-gradient(180deg, ${T.accentHover}, ${T.accent})`
                        : `linear-gradient(180deg, ${T.accent}cc, ${T.accent}55)`,
                      boxShadow: isHov ? `0 0 16px ${T.accent}66` : `0 0 6px ${T.accent}22`,
                      transition: "all 0.15s",
                    }} />
                    <div style={{ fontSize: 9, fontWeight: 500, color: isHov ? T.accent : T.text2 }}>{d.date}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Floor occupancy heatmap */}
        <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 14, padding: "22px 24px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text0, marginBottom: 4 }}>Floor Heatmap</div>
          <div style={{ fontSize: 11, color: T.text2, marginBottom: 18 }}>Occupancy by level</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {floorOccupancy.map(f => {
              const c = f.pct > 80 ? T.red : f.pct > 50 ? T.amber : T.green;
              return (
                <div key={f.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.text1 }}>{f.id}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, color: T.text2 }}>{f.occ}/{f.total}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: c }}>{f.pct}%</span>
                    </div>
                  </div>
                  <div style={{ height: 6, background: T.bg3, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 3, width: `${f.pct}%`,
                      background: `linear-gradient(90deg, ${c}aa, ${c})`,
                      boxShadow: `0 0 8px ${c}44`,
                      transition: "width 1s cubic-bezier(.4,0,.2,1)",
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Active sessions */}
      <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 14, padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text0 }}>Active Sessions</div>
            <div style={{ fontSize: 11, color: T.text2, marginTop: 2 }}>{activeBookings.length} vehicles currently parked</div>
          </div>
          <div style={{
            padding: "4px 12px", borderRadius: 20, background: T.greenDim,
            border: `1px solid ${T.green}33`, fontSize: 11, fontWeight: 700, color: T.green,
          }}>LIVE</div>
        </div>
        {activeBookings.length === 0
          ? <div style={{ fontSize: 13, color: T.text2, textAlign: "center", padding: "24px 0" }}>No active sessions right now</div>
          : <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {["Booking ID", "Plate", "Floor", "Slot", "Entry", "Vehicle", "Elapsed", "Est. Fee"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: T.text2, fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeBookings.map(b => (
                <tr key={b.id} style={{ borderBottom: `1px solid ${T.border}11`, transition: "background 0.1s" }}
                  onMouseEnter={e => e.currentTarget.style.background = T.bg2}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "10px 12px", color: T.accent, fontFamily: T.fontMono, fontSize: 11 }}>{b.id}</td>
                  <td style={{ padding: "10px 12px", color: T.text0, fontFamily: T.fontMono, fontWeight: 700, fontSize: 12 }}>{b.plate}</td>
                  <td style={{ padding: "10px 12px", color: T.text1, fontWeight: 600 }}>{b.floor}</td>
                  <td style={{ padding: "10px 12px", color: T.text1 }}>{b.slot}</td>
                  <td style={{ padding: "10px 12px", color: T.text2, fontFamily: T.fontMono, fontSize: 11 }}>{fmt(b.entry)}</td>
                  <td style={{ padding: "10px 12px", color: T.text1 }}>{b.vehicle}</td>
                  <td style={{ padding: "10px 12px", color: T.purple, fontWeight: 600 }}>{elapsed(b.entry)}</td>
                  <td style={{ padding: "10px 12px", color: T.amber, fontWeight: 700 }}>₹{fee(b.entry, FLOORS.find(f => f.id === b.floor)?.rate || 40)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>
    </div>
  );
}

// ─── PARKING MAP ──────────────────────────────────────────────────────────────
function ParkingMap({ floors, parking, activeFloor, setActiveFloor, filtered, selected, onSelect,
  filterType, setFilterType, searchPlate, setSearchPlate, onCheckIn, onCheckOut, user, recentSlots = new Set() }) {

  const currentSlots = parking[activeFloor] || [];
  const freeCount = currentSlots.filter(s => !s.occupied && !s.reserved).length;
  const floorRate = floors.find(f => f.id === activeFloor)?.rate || 40;

  function slotBg(s) {
    if (s.occupied) return T.red;
    if (s.reserved) return T.amber;
    if (s.type === "ev") return T.accent;
    if (s.type === "disabled") return T.purple;
    return T.green;
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left: floor selector */}
      <div style={{ width: 160, background: T.bg1, borderRight: `1px solid ${T.border}`, padding: "16px 0", overflowY: "auto", flexShrink: 0 }}>
        <div style={{ fontSize: 8, letterSpacing: 3, color: T.text2, padding: "0 16px 12px" }}>LEVELS</div>
        {floors.map(f => {
          const sl = parking[f.id] || [];
          const fr = sl.filter(s => !s.occupied && !s.reserved).length;
          const pct = Math.round((fr / sl.length) * 100);
          return (
            <button key={f.id} onClick={() => setActiveFloor(f.id)} style={{
              width: "100%", padding: "12px 16px", background: activeFloor === f.id ? T.accentDim : "transparent",
              border: "none", borderLeft: `2px solid ${activeFloor === f.id ? T.accent : "transparent"}`,
              cursor: "pointer", textAlign: "left",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: activeFloor === f.id ? T.accent : T.text0, letterSpacing: 1 }}>{f.id}</div>
              <div style={{ fontSize: 8, color: T.text2, letterSpacing: 1, marginBottom: 6 }}>{f.label}</div>
              <div style={{ height: 3, background: T.bg3, borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${pct}%`, background: pct > 40 ? T.green : pct > 15 ? T.amber : T.red, borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: 8, color: pct > 40 ? T.green : pct > 15 ? T.amber : T.red, marginTop: 4 }}>{fr} free</div>
            </button>
          );
        })}
      </div>

      {/* Center: map */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Toolbar */}
        <div style={{ padding: "12px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 12, alignItems: "center", background: T.bg1, flexShrink: 0 }}>
          <input value={searchPlate} onChange={e => setSearchPlate(e.target.value)}
            placeholder="SEARCH PLATE..." style={{ ...inputStyle, flex: 1, maxWidth: 220, padding: "7px 12px" }} />
          {["all", "standard", "ev", "disabled"].map(t => (
            <button key={t} onClick={() => setFilterType(t)} style={{
              padding: "6px 12px", background: filterType === t ? T.accentDim : T.bg2,
              border: `1px solid ${filterType === t ? T.accent : T.border}`,
              color: filterType === t ? T.accent : T.text2, borderRadius: 6, cursor: "pointer",
              fontSize: 9, letterSpacing: 1, fontFamily: T.font,
            }}>{t.toUpperCase()}</button>
          ))}
          <div style={{ marginLeft: "auto", fontSize: 10, color: T.text2, letterSpacing: 1 }}>
            <span style={{ color: T.green, fontWeight: 700 }}>{freeCount}</span> / {currentSlots.length} · ₹{floorRate}/hr
          </div>
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {/* Col headers */}
          <div style={{ display: "grid", gridTemplateColumns: `24px repeat(${COLS}, 1fr)`, gap: 6, marginBottom: 4 }}>
            <div />
            {Array.from({ length: COLS }, (_, i) => (
              <div key={i} style={{ textAlign: "center", fontSize: 9, color: T.text2 }}>{i + 1}</div>
            ))}
          </div>

          {Array.from({ length: ROWS }, (_, row) => (
            <div key={row} style={{ display: "grid", gridTemplateColumns: `24px repeat(${COLS}, 1fr)`, gap: 6, marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: T.text2 }}>
                {String.fromCharCode(65 + row)}
              </div>
              {Array.from({ length: COLS }, (_, col) => {
                const s = (parking[activeFloor] || []).find(sl => sl.row === row && sl.col === col);
                if (!s) return <div key={col} />;
                const visible = filtered.find(f => f.id === s.id);
                const isSel = selected?.id === s.id;
                const bg = slotBg(s);
                const dimmed = !visible && (searchPlate || filterType !== "all");
                const isRecent = recentSlots.has(s.id);
                return (
                  <div key={s.id} onClick={() => onSelect(s)} title={s.plate || (s.reserved ? "Reserved" : "Available")} style={{
                    aspectRatio: "1 / 1.4", borderRadius: 6, background: bg,
                    opacity: dimmed ? 0.2 : 1, cursor: "pointer",
                    boxShadow: isSel ? `0 0 0 2px #fff, 0 0 14px ${bg}` : `0 0 6px ${bg}44`,
                    transform: isSel ? "scale(1.06)" : "scale(1)",
                    animation: isRecent ? "slotPulse 0.7s ease" : undefined,
                    transition: "all 0.15s",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                  }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(0,0,0,0.6)" }}>
                      {String.fromCharCode(65 + row)}{col + 1}
                    </div>
                    <div style={{ fontSize: 11 }}>
                      {s.type === "ev" ? "⚡" : s.type === "disabled" ? "♿" : "🚗"}
                    </div>
                    {s.occupied && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(0,0,0,0.4)" }} />}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Legend */}
          <div style={{ display: "flex", gap: 20, marginTop: 20 }}>
            {[
              { color: T.green, label: "AVAILABLE" }, { color: T.red, label: "OCCUPIED" },
              { color: T.amber, label: "RESERVED" }, { color: T.accent, label: "EV SLOT" },
              { color: T.purple, label: "ACCESSIBLE" },
            ].map(l => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
                <span style={{ fontSize: 8, letterSpacing: 2, color: T.text2 }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: slot detail */}
      {selected && (
        <div style={{
          width: 260, background: T.bg1, borderLeft: `1px solid ${T.border}`,
          padding: 20, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, letterSpacing: 3, color: T.text0, fontWeight: 700 }}>
              SLOT {String.fromCharCode(65 + selected.row)}{selected.col + 1}
            </span>
            <button onClick={() => onSelect(null)} style={{ background: "transparent", border: "none", color: T.text2, cursor: "pointer" }}>✕</button>
          </div>
          <div style={{
            height: 4, borderRadius: 2,
            background: selected.occupied ? T.red : selected.reserved ? T.amber : T.green,
          }} />
          <InfoRow label="FLOOR" value={activeFloor} />
          <InfoRow label="TYPE" value={selected.type.toUpperCase()} />
          <InfoRow label="STATUS" value={selected.occupied ? "OCCUPIED" : selected.reserved ? "RESERVED" : "AVAILABLE"}
            accent color={selected.occupied ? T.red : selected.reserved ? T.amber : T.green} />
          {selected.occupied && <>
            <InfoRow label="PLATE" value={selected.plate} accent />
            <InfoRow label="VEHICLE" value={selected.vehicleType} />
            <InfoRow label="ENTRY" value={fmt(selected.since)} />
            <InfoRow label="DURATION" value={elapsed(selected.since)} />
            <InfoRow label="BOOKING ID" value={selected.bookingId} />
            <div style={{
              background: T.amberDim, border: `1px solid ${T.amber}33`, borderRadius: 8, padding: "12px 16px",
              display: "flex", justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 8, letterSpacing: 2, color: T.amber }}>CURRENT FEE</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: T.amber }}>₹{fee(selected.since, selected.rate)}</span>
            </div>
          </>}
          {(user.role === "admin" || user.role === "operator") && (
            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {!selected.occupied && !selected.reserved && (
                <Btn text="CHECK IN →" color={T.green} onClick={() => onCheckIn()} small />
              )}
              {selected.occupied && (
                <Btn text="CHECK OUT →" color={T.red} onClick={() => onCheckOut()} small />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── BOOKINGS ─────────────────────────────────────────────────────────────────
function BookingsPage({ bookings }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const filtered = bookings.filter(b => {
    if (filter !== "all" && b.status !== filter) return false;
    if (search && !b.plate.includes(search.toUpperCase()) && !b.id.includes(search.toUpperCase())) return false;
    return true;
  });
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="SEARCH PLATE / ID..."
          style={{ ...inputStyle, flex: 1, maxWidth: 280 }} />
        {["all", "active", "completed"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "8px 16px", background: filter === f ? T.accentDim : T.bg2,
            border: `1px solid ${filter === f ? T.accent : T.border}`,
            color: filter === f ? T.accent : T.text2, borderRadius: 6, cursor: "pointer",
            fontSize: 9, letterSpacing: 2, fontFamily: T.font,
          }}>{f.toUpperCase()}</button>
        ))}
        <div style={{ marginLeft: "auto", fontSize: 10, color: T.text2 }}>{filtered.length} RECORDS</div>
      </div>
      <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead style={{ borderBottom: `1px solid ${T.border}` }}>
            <tr>
              {["ID", "PLATE", "FLOOR", "SLOT", "VEHICLE", "ENTRY", "EXIT", "DURATION", "FEE", "PAYMENT", "STATUS"].map(h => (
                <th key={h} style={{ padding: "12px 14px", textAlign: "left", color: T.text2, letterSpacing: 2, fontWeight: 400 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 30).map(b => (
              <tr key={b.id} style={{ borderBottom: `1px solid ${T.border}`, transition: "background 0.1s" }}
                onMouseEnter={e => e.currentTarget.style.background = T.bg2}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "10px 14px", color: T.accent }}>{b.id}</td>
                <td style={{ padding: "10px 14px", color: T.text0, letterSpacing: 1 }}>{b.plate}</td>
                <td style={{ padding: "10px 14px", color: T.text1 }}>{b.floor}</td>
                <td style={{ padding: "10px 14px", color: T.text1 }}>{b.slot}</td>
                <td style={{ padding: "10px 14px", color: T.text1 }}>{b.vehicle}</td>
                <td style={{ padding: "10px 14px", color: T.text2 }}>{fmt(b.entry)}</td>
                <td style={{ padding: "10px 14px", color: T.text2 }}>{b.exit ? fmt(b.exit) : <span style={{ color: T.green }}>ACTIVE</span>}</td>
                <td style={{ padding: "10px 14px", color: T.text1 }}>{b.duration ? `${b.duration}m` : "–"}</td>
                <td style={{ padding: "10px 14px", color: T.amber }}>{b.fee ? `₹${b.fee}` : "–"}</td>
                <td style={{ padding: "10px 14px", color: T.text2 }}>{b.payment || "–"}</td>
                <td style={{ padding: "10px 14px" }}>
                  <span style={{
                    padding: "3px 8px", borderRadius: 4, fontSize: 8, letterSpacing: 1,
                    background: b.status === "active" ? T.greenDim : T.bg3,
                    color: b.status === "active" ? T.green : T.text2,
                    border: `1px solid ${b.status === "active" ? T.green + "44" : T.border}`,
                  }}>{b.status.toUpperCase()}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── VEHICLES ─────────────────────────────────────────────────────────────────
function VehiclesPage({ vehicles }) {
  const [search, setSearch] = useState("");
  const filtered = vehicles.filter(v => !search || v.plate.includes(search.toUpperCase()) || v.owner.toLowerCase().includes(search.toLowerCase()));
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="SEARCH PLATE / OWNER..."
          style={{ ...inputStyle, flex: 1, maxWidth: 320 }} />
        <div style={{ marginLeft: "auto", fontSize: 10, color: T.text2, display: "flex", alignItems: "center" }}>{filtered.length} VEHICLES</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
        {filtered.map(v => (
          <div key={v.id} style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2, color: T.text0 }}>{v.plate}</div>
                <div style={{ fontSize: 9, color: T.text2, marginTop: 2 }}>{v.owner}</div>
              </div>
              {v.tag && <span style={{
                padding: "2px 8px", borderRadius: 4, fontSize: 8, letterSpacing: 1,
                background: v.tag === "VIP" ? T.purpleDim : T.amberDim,
                color: v.tag === "VIP" ? T.purple : T.amber,
                border: `1px solid ${v.tag === "VIP" ? T.purple + "44" : T.amber + "44"}`,
              }}>{v.tag}</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
              {[
                { label: "TYPE", value: v.type },
                { label: "VISITS", value: v.visits, color: T.accent },
                { label: "TOTAL FEE", value: `₹${v.totalFee.toLocaleString("en-IN")}`, color: T.amber },
              ].map(m => (
                <div key={m.label}>
                  <div style={{ fontSize: 7, letterSpacing: 2, color: T.text2 }}>{m.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: m.color || T.text1, marginTop: 2 }}>{m.value}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 8, color: T.text2, marginTop: 10, borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
              LAST SEEN · {elapsed(v.lastSeen)} ago
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── REPORTS ─────────────────────────────────────────────────────────────────
function ReportsPage({ revenue }) {
  const last7 = revenue.slice(-7);
  const last30 = revenue;
  const totalRev = last30.reduce((a, d) => a + d.revenue, 0);
  const totalBook = last30.reduce((a, d) => a + d.bookings, 0);
  const maxRev = Math.max(...last30.map(d => d.revenue), 1);
  const payments = [
    { method: "UPI", pct: 48, color: T.accent },
    { method: "Card", pct: 28, color: T.purple },
    { method: "Cash", pct: 14, color: T.amber },
    { method: "FASTag", pct: 10, color: T.green },
  ];
  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Summary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "30-DAY REVENUE", value: `₹${totalRev.toLocaleString("en-IN")}`, color: T.amber },
          { label: "TOTAL BOOKINGS", value: totalBook.toLocaleString("en-IN"), color: T.accent },
          { label: "AVG DAILY REV", value: `₹${Math.round(totalRev / 30).toLocaleString("en-IN")}`, color: T.green },
          { label: "AVG DURATION", value: "87 min", color: T.purple },
        ].map(k => (
          <div key={k.label} style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ fontSize: 8, letterSpacing: 3, color: T.text2 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: k.color, marginTop: 8 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Revenue chart - 30 days */}
      <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 10, padding: "20px 24px" }}>
        <div style={{ fontSize: 10, letterSpacing: 3, color: T.text2, marginBottom: 20 }}>30-DAY REVENUE (₹)</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 100 }}>
          {last30.map((d, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}
              title={`${d.date}: ₹${d.revenue.toLocaleString("en-IN")}`}>
              <div style={{
                width: "100%", borderRadius: "2px 2px 0 0",
                height: `${(d.revenue / maxRev) * 90}px`,
                background: i === last30.length - 1
                  ? `linear-gradient(180deg, ${T.amber}, ${T.amber}88)`
                  : `linear-gradient(180deg, ${T.accent}cc, ${T.accent}44)`,
              }} />
              {(i % 5 === 0 || i === last30.length - 1) && <div style={{ fontSize: 7, color: T.text2 }}>{d.date}</div>}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Payment methods */}
        <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 10, padding: "20px 24px" }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: T.text2, marginBottom: 16 }}>PAYMENT METHODS</div>
          {payments.map(p => (
            <div key={p.method} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: T.text1 }}>{p.method}</span>
                <span style={{ fontSize: 10, color: p.color, fontWeight: 700 }}>{p.pct}%</span>
              </div>
              <div style={{ height: 6, background: T.bg3, borderRadius: 3 }}>
                <div style={{ height: "100%", width: `${p.pct}%`, background: p.color, borderRadius: 3, boxShadow: `0 0 6px ${p.color}88` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Weekly breakdown */}
        <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 10, padding: "20px 24px" }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: T.text2, marginBottom: 16 }}>LAST 7 DAYS</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead><tr style={{ borderBottom: `1px solid ${T.border}` }}>
              {["DATE", "REVENUE", "BOOKINGS", "VEHICLES"].map(h => (
                <th key={h} style={{ padding: "6px 0", textAlign: "left", color: T.text2, letterSpacing: 1, fontWeight: 400 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {last7.map((d, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: "8px 0", color: T.text2 }}>{d.date}</td>
                  <td style={{ padding: "8px 0", color: T.amber }}>₹{d.revenue.toLocaleString("en-IN")}</td>
                  <td style={{ padding: "8px 0", color: T.accent }}>{d.bookings}</td>
                  <td style={{ padding: "8px 0", color: T.text1 }}>{d.vehicles}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function SettingsPage({ user }) {
  const [rates, setRates] = useState(Object.fromEntries(FLOORS.map(f => [f.id, f.rate])));
  const [saved, setSaved] = useState(false);
  return (
    <div style={{ padding: 24, maxWidth: 700 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Parking rates */}
        <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 10, padding: "20px 24px" }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: T.text2, marginBottom: 16 }}>PARKING RATES (₹/hr)</div>
          {FLOORS.map(f => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 10, color: T.text1, letterSpacing: 1 }}>{f.label}</span>
              <input type="number" value={rates[f.id]} onChange={e => setRates(p => ({ ...p, [f.id]: +e.target.value }))}
                style={{ ...inputStyle, width: 80, textAlign: "center" }} />
            </div>
          ))}
          <Btn text={saved ? "SAVED ✓" : "SAVE RATES"} color={saved ? T.green : T.accent}
            onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }} />
        </div>

        {/* System info */}
        <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 10, padding: "20px 24px" }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: T.text2, marginBottom: 16 }}>SYSTEM INFO</div>
          {[
            { label: "VERSION", value: "PARKNET v2.0.1" },
            { label: "DATABASE", value: "SQLite 3.42" },
            { label: "API", value: "FastAPI 0.111" },
            { label: "UPTIME", value: "99.98%" },
            { label: "TOTAL FLOORS", value: FLOORS.length },
            { label: "TOTAL SLOTS", value: FLOORS.length * ROWS * COLS },
            { label: "LOGGED IN AS", value: user.name },
            { label: "ROLE", value: user.role.toUpperCase() },
          ].map(r => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 9, letterSpacing: 2, color: T.text2 }}>{r.label}</span>
              <span style={{ fontSize: 10, color: T.text1 }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── AI CHAT ──────────────────────────────────────────────────────────────────
function AiChat({ chat, input, setInput, onSend, loading }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [chat, loading]);

  const suggestions = [
    "Which floor has the most availability?",
    "Estimate today's peak hour revenue",
    "Suggest pricing strategy for weekends",
    "How to reduce parking fraud?",
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: 420 }}>
      <div ref={ref} style={{ flex: 1, overflowY: "auto", marginBottom: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {chat.length === 0 && (
          <div>
            <div style={{ fontSize: 11, color: T.text2, letterSpacing: 1, marginBottom: 14, textAlign: "center" }}>
              AI ASSISTANT · Ask anything about your parking system
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {suggestions.map(s => (
                <button key={s} onClick={() => setInput(s)} style={{
                  padding: "6px 12px", background: T.purpleDim, border: `1px solid ${T.purple}44`,
                  color: T.purple, borderRadius: 6, cursor: "pointer", fontSize: 9, letterSpacing: 1, fontFamily: T.font,
                }}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "80%", padding: "10px 14px", borderRadius: 8, fontSize: 11, lineHeight: 1.6,
              background: m.role === "user" ? T.accentDim : T.bg3,
              border: `1px solid ${m.role === "user" ? T.accent + "44" : T.border}`,
              color: m.role === "user" ? T.accent : T.text1,
            }}>{m.content}</div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 6, padding: "10px 14px" }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: "50%", background: T.purple,
                animation: `pulse 1s ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onSend()}
          placeholder="Ask about availability, revenue, recommendations..."
          style={{ ...inputStyle, flex: 1 }} />
        <button onClick={onSend} disabled={loading} style={{
          padding: "0 20px", background: T.purpleDim, border: `1px solid ${T.purple}`,
          color: T.purple, borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: T.font,
        }}>→</button>
      </div>
    </div>
  );
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: T.bg2, border: `1px solid ${T.border2}`, borderRadius: 12,
        padding: "24px 28px", width: wide ? 560 : 400, maxWidth: "95vw",
        animation: "fadeIn 0.2s ease", boxShadow: `0 0 40px rgba(0,0,0,0.6)`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 12, letterSpacing: 3, color: T.text0, fontWeight: 700 }}>{title}</span>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: T.text2, cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── REUSABLE COMPONENTS ──────────────────────────────────────────────────────
function InfoRow({ label, value, accent, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
      <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: 0.3, color: T.text2, textTransform: "uppercase" }}>{label}</span>
      <span style={{
        fontSize: 13, fontWeight: accent ? 700 : 500,
        color: color || (accent ? T.text0 : T.text1),
        fontFamily: accent ? T.fontMono : T.font,
        letterSpacing: accent ? 1 : 0,
      }}>
        {value}
      </span>
    </div>
  );
}

function Label({ text }) {
  return <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: T.text2, textTransform: "uppercase" }}>{text}</span>;
}

function Btn({ text, color, onClick, small }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        width: "100%", padding: small ? "9px 16px" : "13px 18px",
        background: hover ? color + "30" : color + "18",
        border: `1px solid ${hover ? color : color + "88"}`,
        color, borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700,
        letterSpacing: 0.5, fontFamily: T.font, transition: "all 0.15s",
        boxShadow: hover ? `0 4px 20px ${color}22` : "none",
      }}>{text}</button>
  );
}

const inputStyle = {
  background: T.bg3, border: `1px solid ${T.border2}`, color: T.text0,
  borderRadius: 10, padding: "11px 14px", fontSize: 14, fontFamily: T.font,
  outline: "none", width: "100%", transition: "border-color 0.15s",
  letterSpacing: 0,
};
