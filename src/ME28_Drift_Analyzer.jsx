import { useState, useCallback, useRef } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const M1 = 0x8000;
const M2 = 0x60000;

const SW_VARIANTS = {
  "87200000": { label: "87200000", engine: "5.0L", gen: "Gen1 (37/00)", addrShift: -0x027C },
  "88200000": { label: "88200000", engine: "5.5L", gen: "Gen2 (37/01)", addrShift: 0 },
  "88800000": { label: "88800000", engine: "5.0L", gen: "Gen3 (37/02)", addrShift: 0 },
  "88200001": { label: "88200001", engine: "5.5L", gen: "Gen2-B",       addrShift: 0 },
};

// Reference SW = 88x00000 (88800000 / 88200000)
const PARAMS = [
  // ── NMAX Hard-Limiter ──────────────────────────────────
  { id:"NMAXAT",    addr:0x12DC2, size:2, cat:"NMAX",  label:"NMAXAT",    unit:"rpm", drift_soll:6600, stock_range:[100,300],  desc:"Automatik-Limiter" },
  { id:"NMAXD",     addr:0x12DC4, size:2, cat:"NMAX",  label:"NMAXD",     unit:"rpm", drift_soll:6600, stock_range:[80,200],   desc:"Drive-Limiter" },
  { id:"NMAXGNL",   addr:0x12DC6, size:2, cat:"NMAX",  label:"NMAXGNL",   unit:"rpm", drift_soll:6600, stock_range:[80,200],   desc:"Gang N/L" },
  { id:"NMAXK",     addr:0x12DC8, size:2, cat:"NMAX",  label:"NMAXK",     unit:"rpm", drift_soll:6600, stock_range:[80,200],   desc:"Kick-down" },
  { id:"NMAXR",     addr:0x12DCA, size:2, cat:"NMAX",  label:"NMAXR",     unit:"rpm", drift_soll:6600, stock_range:[80,200],   desc:"Rückwärts" },
  { id:"NMAXWF",    addr:0x12DDC, size:2, cat:"NMAX",  label:"NMAXWF",    unit:"rpm", drift_soll:6500, stock_range:[60,120],   desc:"Wählhebel frei" },
  // ── Soft-Limiter ───────────────────────────────────────
  { id:"FWNMAXWF",  addr:0x16B06, size:2, cat:"SOFT",  label:"FWNMAXWF",  unit:"rpm", drift_soll:6500, stock_range:[4000,5200], desc:"Soft-Max Wählhebel frei" },
  { id:"FWNTOEL",   addr:0x16B08, size:2, cat:"SOFT",  label:"FWNTOEL",   unit:"rpm", drift_soll:6500, stock_range:[4000,5200], desc:"Öl-Temp Limiter" },
  { id:"FWTNMAXK",  addr:0x16B12, size:2, cat:"SOFT",  label:"FWTNMAXK",  unit:"ms",  drift_soll:200,  stock_range:[1000,5000], desc:"Rampenzeit Max-K" },
  { id:"FWTRAMP",   addr:0x16B14, size:2, cat:"SOFT",  label:"FWTRAMP",   unit:"ms",  drift_soll:200,  stock_range:[1000,5000], desc:"Rampenzeit" },
  { id:"FWVMAXD",   addr:0x16B16, size:2, cat:"SOFT",  label:"FWVMAXD",   unit:"",    drift_soll:0,    stock_range:[1000,5000], desc:"Speed-Max Drive" },
  { id:"FWVMAXR",   addr:0x16B18, size:2, cat:"SOFT",  label:"FWVMAXR",   unit:"",    drift_soll:0,    stock_range:[1000,5000], desc:"Speed-Max Rück" },
  { id:"FWWNMAXD",  addr:0x16B1A, size:2, cat:"SOFT",  label:"FWWNMAXD",  unit:"rpm", drift_soll:6400, stock_range:[4000,5500], desc:"W-Max Drive" },
  { id:"FWWNMAXKA", addr:0x16B1C, size:2, cat:"SOFT",  label:"FWWNMAXKA", unit:"rpm", drift_soll:6600, stock_range:[4000,5500], desc:"W-Max KA" },
  { id:"FWWNMAXKH", addr:0x16B1E, size:2, cat:"SOFT",  label:"FWWNMAXKH", unit:"rpm", drift_soll:6600, stock_range:[4000,5500], desc:"W-Max KH" },
  { id:"FWWNMAXR",  addr:0x16B20, size:2, cat:"SOFT",  label:"FWWNMAXR",  unit:"rpm", drift_soll:6200, stock_range:[4000,5500], desc:"W-Max Rück" },
  { id:"KLAMDRED",  addr:0x16B22, size:2, cat:"SOFT",  label:"KLAMDRED",  unit:"",    drift_soll:0,    stock_range:[1,9999],    desc:"Lambda-Reduktion" },
  // VMAXOG 0-7
  ...Array.from({length:8},(_,i)=>({
    id:`VMAXOG${i}`, addr:0x16B32+i*2, size:2, cat:"SOFT",
    label:`VMAXOG[${i}]`, unit:"", drift_soll:0xFFFF, stock_range:[0,5000],
    desc:"Gang-Speed-Max"
  })),
  // ── Geschwindigkeitsbegrenzer ──────────────────────────
  ...Array.from({length:6},(_,i)=>({
    id:`KSVMAX${i}`, addr:0x15134+i*2, size:2, cat:"VMAX",
    label:`KSVMAX[${i}]`, unit:"×0.1 km/h", drift_soll:0xFFFF, stock_range:[1500,2000],
    desc:"Geschwindigkeitsbegrenzer"
  })),
  // ── Schubabschaltung ───────────────────────────────────
  { id:"SWSCHUB3", addr:0x132A2, size:2, cat:"SAS", label:"SWSCHUB3", unit:"", drift_soll:0, stock_range:[1,9999], desc:"SAS Enable" },
  { id:"SWSCHUB4", addr:0x132A4, size:2, cat:"SAS", label:"SWSCHUB4", unit:"", drift_soll:0, stock_range:[1,9999], desc:"SAS Hysterese" },
  // ── Wandlerschutz ──────────────────────────────────────
  { id:"VNMAXRF",  addr:0x13BA2, size:1, cat:"ATF",  label:"VNMAXRF",  unit:"", drift_soll:0, stock_range:[1,255], desc:"Wandlerschutz RF" },
  // ── ASR ────────────────────────────────────────────────
  { id:"TMASR",    addr:0x16548, size:1, cat:"ASR",  label:"TMASR",    unit:"°C", drift_soll:255, stock_range:[25,80], desc:"ASR Temp-Threshold" },
];

// Kennfelder (multi-byte)
const MAPS = [
  { id:"KFAGR",   addr:0x105E8, size:64,  cat:"EGR",    label:"KFAGR",    desc:"Abgasrückführung [8×8]",     drift_check:"all_zero" },
  { id:"KFMDRED", addr:0x10D52, size:74,  cat:"CAN_ASR",label:"KFMDRED",  desc:"CAN-ASR Torque-Reduction",   drift_check:"all_ffff_word", word_count:37 },
  { id:"KFTORQ2", addr:0x153C8, size:24,  cat:"CAN_ASR",label:"Torque2",  desc:"Sekundäre Torque-Tabelle",   drift_check:"all_ffff_word", word_count:12 },
  { id:"KFZW",    addr:0x12864, size:256, cat:"IGN",    label:"KFZW",     desc:"Zündwinkel Hauptkennfeld [16×16]", drift_check:"timing" },
  { id:"KFZWZA",  addr:0x126E4, size:256, cat:"IGN",    label:"KFZWZA",   desc:"Zündwinkel ZA [16×16]",      drift_check:"timing" },
];

// ─── ANALYSIS ENGINE ─────────────────────────────────────────────────────────
function readU16LE(buf, addr) {
  if (addr+1 >= buf.length) return null;
  return buf[addr] | (buf[addr+1] << 8);
}
function readU8(buf, addr) {
  if (addr >= buf.length) return null;
  return buf[addr];
}

function detectSW(buf) {
  const strAt = (addr, len=12) => {
    const bytes = buf.slice(addr, addr+len);
    return String.fromCharCode(...bytes.filter(b=>b>31&&b<127));
  };
  const s = strAt(0x7FFB0, 30);
  for (const [key, info] of Object.entries(SW_VARIANTS)) {
    if (s.includes(key)) return { sw: key, ...info, raw: s.trim() };
  }
  // Try 0x1FFEF area (Mirror1)
  const s2 = strAt(0x1FFEF, 20);
  for (const [key, info] of Object.entries(SW_VARIANTS)) {
    if (s2.includes(key)) return { sw: key, ...info, raw: s2.trim() };
  }
  return { sw:"UNKNOWN", label:"?", engine:"?", gen:"?", addrShift:0, raw: s.trim() };
}

function getPartnr(buf) {
  const bytes = buf.slice(0x7FFE9, 0x7FFF5);
  return bytes.filter(b=>b>47&&b<58||b>64&&b<91||b>96&&b<123)
    .map(b=>String.fromCharCode(b)).join('');
}

function analyzeParam(buf, p, shift) {
  const addr = p.addr + shift;
  if (addr < 0 || addr+p.size > buf.length) return { valid:false, value:null };
  const value = p.size === 2 ? readU16LE(buf, addr) : readU8(buf, addr);
  const m1v   = p.size === 2 ? readU16LE(buf, addr+M1) : readU8(buf, addr+M1);
  const m2v   = p.size === 2 ? readU16LE(buf, addr+M2) : readU8(buf, addr+M2);
  const mirrorOk = value === m1v && value === m2v;
  const isDriftOk = value === p.drift_soll;
  const isStock = value >= p.stock_range[0] && value <= p.stock_range[1];
  let status = "unknown";
  if (isDriftOk) status = "ok";
  else if (isStock) status = "stock";
  else status = "bad";
  return { valid:true, value, m1:m1v, m2:m2v, mirrorOk, isDriftOk, isStock, status };
}

function analyzeMap(buf, m, shift) {
  const addr = m.addr + shift;
  if (addr < 0 || addr+m.size > buf.length) return { valid:false };

  if (m.drift_check === "all_zero") {
    const nonZero = [];
    for (let i=0;i<m.size;i++) if (buf[addr+i]!==0) nonZero.push(i);
    const status = nonZero.length===0 ? "ok" : "bad";
    return { valid:true, status, detail: `${nonZero.length}/${m.size} Bytes ≠ 0` };
  }
  if (m.drift_check === "all_ffff_word") {
    const bad = [];
    for (let i=0;i<m.word_count;i++) {
      const v = readU16LE(buf, addr+i*2);
      if (v !== 0xFFFF) bad.push(i);
    }
    const status = bad.length===0 ? "ok" : "bad";
    return { valid:true, status, detail: `${bad.length}/${m.word_count} Wörter ≠ 0xFFFF` };
  }
  if (m.drift_check === "timing") {
    // Compare vs raw values — check for near-zero (bad) or reasonable range
    const vals = [];
    for (let i=0;i<m.size;i++) vals.push(buf[addr+i]);
    const avg = vals.reduce((a,b)=>a+b,0)/vals.length;
    const zeros = vals.filter(v=>v===0).length;
    // Mirror check
    const m1Diffs = vals.filter((_,i)=>buf[addr+i] !== buf[addr+M1+i]).length;
    const m2Diffs = vals.filter((_,i)=>buf[addr+i] !== buf[addr+M2+i]).length;
    const mirrorOk = m1Diffs===0 && m2Diffs===0;
    const status = zeros > 200 ? "bad" : avg < 10 ? "bad" : "info";
    const deg = (avg * 0.75).toFixed(1);
    return { valid:true, status, detail:`Ø ${deg}° (${avg.toFixed(1)} raw)`, mirrorOk, zeros, avg };
  }
  return { valid:false };
}

function mirrorConsistency(buf) {
  let diff12=0, diff13=0;
  for (let i=0;i<0x8000;i++) {
    if (buf[0x10000+i] !== buf[0x10000+i+M1]) diff12++;
    if (0x10000+i+M2 < buf.length && buf[0x10000+i] !== buf[0x10000+i+M2]) diff13++;
  }
  return { diff12, diff13, ok: diff12<100 && diff13<100 };
}

function runAnalysis(buf) {
  const sw = detectSW(buf);
  const shift = sw.addrShift || 0;
  const partNr = getPartnr(buf);
  const mirror = mirrorConsistency(buf);

  const params = PARAMS.map(p => ({ ...p, result: analyzeParam(buf, p, shift) }));
  const maps   = MAPS.map(m  => ({ ...m,  result: analyzeMap(buf, m, shift)   }));

  // Quality score
  const driftParams = params.filter(p=>p.result.valid);
  const okCount = driftParams.filter(p=>p.result.status==="ok").length;
  const badCount = driftParams.filter(p=>p.result.status==="bad").length;
  const mirrorBad = driftParams.filter(p=>!p.result.mirrorOk).length;
  const mapOk = maps.filter(m=>m.result.status==="ok").length;
  const mapBad = maps.filter(m=>m.result.status==="bad").length;

  const total = driftParams.length + maps.filter(m=>m.result.valid).length;
  const okTotal = okCount + mapOk;
  const score = Math.round((okTotal/total)*100);

  return { sw, partNr, mirror, params, maps, score, okCount, badCount, mirrorBad, mapOk, mapBad };
}

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

const STATUS_COLOR = {
  ok:      "#00ff88",
  bad:     "#ff3c3c",
  stock:   "#f59e0b",
  unknown: "#666",
  info:    "#60a5fa",
};
const STATUS_LABEL = {
  ok:"DRIFT OK", bad:"FEHLER", stock:"STOCK", unknown:"?", info:"INFO"
};

function Badge({ status, children }) {
  return (
    <span style={{
      display:"inline-block", padding:"1px 7px", borderRadius:3,
      fontSize:10, fontFamily:"'JetBrains Mono',monospace", letterSpacing:1,
      background: STATUS_COLOR[status]+"22",
      color: STATUS_COLOR[status],
      border:`1px solid ${STATUS_COLOR[status]}44`,
    }}>{children || STATUS_LABEL[status]}</span>
  );
}

function MirrorDot({ ok }) {
  return (
    <span title={ok?"Mirror ✓":"Mirror INKONSISTENT"} style={{
      display:"inline-block", width:7, height:7, borderRadius:"50%",
      background: ok ? "#00ff88" : "#ff3c3c",
      marginLeft:5, verticalAlign:"middle",
    }}/>
  );
}

function CategoryBlock({ title, icon, color, children }) {
  return (
    <div style={{
      border:`1px solid ${color}33`,
      borderLeft:`3px solid ${color}`,
      background:`${color}08`,
      borderRadius:6, marginBottom:16, overflow:"hidden"
    }}>
      <div style={{
        padding:"8px 14px", background:`${color}15`,
        borderBottom:`1px solid ${color}22`,
        display:"flex", alignItems:"center", gap:8
      }}>
        <span style={{fontSize:14}}>{icon}</span>
        <span style={{color, fontFamily:"'JetBrains Mono',monospace", fontSize:11, letterSpacing:2, fontWeight:700}}>{title}</span>
      </div>
      <div style={{padding:"10px 14px"}}>{children}</div>
    </div>
  );
}

function ParamRow({ p }) {
  const r = p.result;
  if (!r.valid) return (
    <div style={{display:"flex",alignItems:"center",padding:"4px 0",borderBottom:"1px solid #1a1a1a",opacity:0.4}}>
      <span style={{width:130,fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"#555"}}>{p.label}</span>
      <span style={{color:"#333",fontSize:11}}>— außerhalb SW-Bereich</span>
    </div>
  );

  const valueDisplay = r.value === 0xFFFF
    ? <span style={{color:"#00ff88",fontSize:11,fontFamily:"monospace"}}>0xFFFF ∞</span>
    : <span style={{color:"#e0e0e0",fontSize:12,fontFamily:"'JetBrains Mono',monospace"}}>{r.value} <span style={{color:"#555",fontSize:10}}>{p.unit}</span></span>;

  const sollDisplay = p.drift_soll === 0xFFFF ? "0xFFFF" : `${p.drift_soll}`;

  return (
    <div style={{
      display:"grid", gridTemplateColumns:"130px 90px 80px 1fr 60px",
      alignItems:"center", padding:"5px 0",
      borderBottom:"1px solid #141414",
      opacity: r.status==="unknown" ? 0.5 : 1
    }}>
      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"#aaa"}}>{p.label}</span>
      <span>{valueDisplay}</span>
      <span style={{fontSize:10,color:"#444",fontFamily:"monospace"}}>Soll: {sollDisplay}</span>
      <span style={{fontSize:10,color:"#555"}}>{p.desc}</span>
      <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4}}>
        <Badge status={r.status}/>
        <MirrorDot ok={r.mirrorOk}/>
      </div>
    </div>
  );
}

function MapRow({ m }) {
  const r = m.result;
  if (!r.valid) return null;
  const color = STATUS_COLOR[r.status] || "#666";
  return (
    <div style={{
      display:"grid", gridTemplateColumns:"130px 1fr 80px",
      alignItems:"center", padding:"5px 0", borderBottom:"1px solid #141414"
    }}>
      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"#aaa"}}>{m.label}</span>
      <span style={{fontSize:11,color:"#555"}}>{m.desc} <span style={{color:"#333",fontSize:10}}>→ {r.detail}</span></span>
      <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4}}>
        <Badge status={r.status}/>
        {r.mirrorOk !== undefined && <MirrorDot ok={r.mirrorOk}/>}
      </div>
    </div>
  );
}

function ScoreRing({ score }) {
  const r = 36, circ = 2*Math.PI*r;
  const dash = (score/100)*circ;
  const color = score>=80?"#00ff88":score>=50?"#f59e0b":"#ff3c3c";
  return (
    <svg width={100} height={100} style={{transform:"rotate(-90deg)"}}>
      <circle cx={50} cy={50} r={r} fill="none" stroke="#1a1a1a" strokeWidth={7}/>
      <circle cx={50} cy={50} r={r} fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{transition:"stroke-dasharray 0.8s ease"}}/>
      <text x={50} y={54} textAnchor="middle" fill={color}
        style={{transform:"rotate(90deg) translateX(-100px) translateY(-50px)",fontSize:20,fontFamily:"monospace",fontWeight:700}}>
        {score}
      </text>
      <text x={50} y={64} textAnchor="middle" fill="#555"
        style={{transform:"rotate(90deg) translateX(-100px) translateY(-50px)",fontSize:8,fontFamily:"monospace"}}>
        %
      </text>
    </svg>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function ME28Analyzer() {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [fileName, setFileName] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const inputRef = useRef();

  const processFile = useCallback((file) => {
    if (!file) return;
    setLoading(true); setError(null); setAnalysis(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buf = new Uint8Array(e.target.result);
        if (buf.length !== 524288) {
          setError(`Ungültige Dateigröße: ${buf.length} Bytes (erwartet 524288 = 512KB)`);
          setLoading(false); return;
        }
        const result = runAnalysis(buf);
        setAnalysis(result);
      } catch(ex) {
        setError("Analysefehler: " + ex.message);
      }
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false);
    processFile(e.dataTransfer.files[0]);
  }, [processFile]);

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const CATS = {
    "NMAX":    { title:"NMAX HARD-LIMITER", icon:"⚡", color:"#ff6b2b" },
    "SOFT":    { title:"SOFT-LIMITER",       icon:"📊", color:"#f59e0b" },
    "VMAX":    { title:"GESCHWINDIGKEITSBEGRENZER", icon:"🚫", color:"#a78bfa" },
    "SAS":     { title:"SCHUBABSCHALTUNG",   icon:"💨", color:"#34d399" },
    "ATF":     { title:"WANDLERSCHUTZ",      icon:"🔧", color:"#60a5fa" },
    "ASR":     { title:"ASR TEMPERATUR",     icon:"🌡", color:"#f472b6" },
    "EGR":     { title:"ABGASRÜCKFÜHRUNG",   icon:"♻️", color:"#94a3b8" },
    "CAN_ASR": { title:"CAN ASR DREHMOMENTTABELLEN", icon:"📡", color:"#ff3c3c" },
    "IGN":     { title:"ZÜNDWINKEL",         icon:"🔥", color:"#fbbf24" },
  };

  const catGroups = {};
  if (analysis) {
    for (const p of analysis.params) {
      if (!catGroups[p.cat]) catGroups[p.cat] = { params:[], maps:[] };
      catGroups[p.cat].params.push(p);
    }
    for (const m of analysis.maps) {
      if (!catGroups[m.cat]) catGroups[m.cat] = { params:[], maps:[] };
      catGroups[m.cat].maps.push(m);
    }
  }

  const tabs = ["overview","params","maps","mirror"];

  return (
    <div style={{
      minHeight:"100vh", background:"#0a0a0a", color:"#c8c8c8",
      fontFamily:"'JetBrains Mono',monospace",
      backgroundImage:"radial-gradient(ellipse at 20% 20%, #0f1f0f 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, #0d0d1f 0%, transparent 60%)",
    }}>
      {/* Header */}
      <div style={{
        borderBottom:"1px solid #1e1e1e",
        background:"#080808ee",
        padding:"0 24px",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        position:"sticky", top:0, zIndex:10,
        backdropFilter:"blur(10px)"
      }}>
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 0"}}>
          <div style={{width:28,height:28,background:"#ff6b2b22",border:"1px solid #ff6b2b55",borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>⚡</div>
          <div>
            <div style={{fontSize:12,fontWeight:700,letterSpacing:3,color:"#ff6b2b"}}>ME2.8 DRIFT ANALYZER</div>
            <div style={{fontSize:9,color:"#333",letterSpacing:2}}>BOSCH ME2.8 — KFZ DIETRICH DIAGNOSTIC TOOL</div>
          </div>
        </div>
        {fileName && (
          <div style={{fontSize:10,color:"#444",display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:"#1e1e1e"}}>█</span>
            <span style={{color:"#555"}}>{fileName}</span>
          </div>
        )}
      </div>

      <div style={{maxWidth:1100,margin:"0 auto",padding:"24px 24px"}}>

        {/* Drop zone */}
        {!analysis && !loading && (
          <div
            onClick={()=>inputRef.current.click()}
            onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
            style={{
              border:`2px dashed ${dragging?"#ff6b2b":"#222"}`,
              borderRadius:12, padding:"64px 32px", textAlign:"center",
              cursor:"pointer", transition:"all 0.2s",
              background: dragging ? "#ff6b2b0a" : "#0d0d0d",
              marginBottom:24,
            }}>
            <div style={{fontSize:40,marginBottom:16}}>📂</div>
            <div style={{fontSize:14,color:"#ff6b2b",marginBottom:8,letterSpacing:2}}>FLASH DATEI LADEN</div>
            <div style={{fontSize:11,color:"#444"}}>Ziehen oder klicken · .bin / .FLS · 512KB (524288 Bytes)</div>
            <input ref={inputRef} type="file" accept=".bin,.FLS,.fls" style={{display:"none"}}
              onChange={e=>processFile(e.target.files[0])}/>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{textAlign:"center",padding:80}}>
            <div style={{fontSize:24,marginBottom:16,animation:"pulse 1s infinite"}}>⚡</div>
            <div style={{fontSize:11,color:"#ff6b2b",letterSpacing:3}}>ANALYSIERE…</div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{background:"#1a0808",border:"1px solid #ff3c3c44",borderRadius:8,padding:20,marginBottom:24}}>
            <div style={{color:"#ff3c3c",fontSize:12,marginBottom:4}}>⚠ FEHLER</div>
            <div style={{fontSize:11,color:"#888"}}>{error}</div>
            <button onClick={()=>{setError(null);setAnalysis(null);}} style={{marginTop:12,background:"#1e0808",border:"1px solid #ff3c3c44",color:"#ff3c3c",padding:"6px 14px",borderRadius:4,cursor:"pointer",fontSize:10,letterSpacing:1}}>ZURÜCKSETZEN</button>
          </div>
        )}

        {/* Analysis result */}
        {analysis && (
          <>
            {/* Summary bar */}
            <div style={{
              display:"grid", gridTemplateColumns:"auto 1fr auto",
              gap:20, marginBottom:24,
              background:"#0d0d0d", border:"1px solid #1e1e1e", borderRadius:10, padding:20,
              alignItems:"center"
            }}>
              {/* Score */}
              <div style={{textAlign:"center"}}>
                <ScoreRing score={analysis.score}/>
                <div style={{fontSize:9,color:"#444",letterSpacing:2,marginTop:4}}>DRIFT SCORE</div>
              </div>

              {/* SW Info */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                <div>
                  <div style={{fontSize:9,color:"#444",letterSpacing:2,marginBottom:6}}>SOFTWARE</div>
                  <div style={{fontSize:14,color:"#ff6b2b",fontWeight:700}}>{analysis.sw.label}</div>
                  <div style={{fontSize:10,color:"#555",marginTop:2}}>{analysis.sw.engine} · {analysis.sw.gen}</div>
                  <div style={{fontSize:9,color:"#333",marginTop:4,fontFamily:"monospace"}}>{analysis.sw.raw.slice(0,30)}</div>
                </div>
                <div>
                  <div style={{fontSize:9,color:"#444",letterSpacing:2,marginBottom:6}}>TEILENUMMER</div>
                  <div style={{fontSize:13,color:"#a0a0a0",fontFamily:"monospace"}}>{analysis.partNr || "—"}</div>
                  <div style={{fontSize:9,color:"#444",marginTop:8,letterSpacing:2}}>STATISTIK</div>
                  <div style={{fontSize:10,color:"#555",marginTop:3}}>
                    <span style={{color:"#00ff88"}}>{analysis.okCount}</span> OK ·{" "}
                    <span style={{color:"#f59e0b"}}>{analysis.params.filter(p=>p.result.status==="stock").length}</span> Stock ·{" "}
                    <span style={{color:"#ff3c3c"}}>{analysis.badCount}</span> Fehler ·{" "}
                    <span style={{color:"#ff3c3c"}}>{analysis.mirrorBad}</span> Mirror-Fehler
                  </div>
                </div>
                <div>
                  <div style={{fontSize:9,color:"#444",letterSpacing:2,marginBottom:6}}>KENNFELDER</div>
                  <div style={{fontSize:10,color:"#555"}}>
                    <span style={{color:"#00ff88"}}>{analysis.mapOk}</span>/{analysis.maps.length} OK
                  </div>
                </div>
                <div>
                  <div style={{fontSize:9,color:"#444",letterSpacing:2,marginBottom:6}}>MIRROR INTEGRITÄT</div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <MirrorDot ok={analysis.mirror.ok}/>
                    <span style={{fontSize:10,color: analysis.mirror.ok?"#00ff88":"#ff3c3c"}}>
                      {analysis.mirror.ok?"OK":`P↔M1: ${analysis.mirror.diff12} | P↔M2: ${analysis.mirror.diff13}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Reset */}
              <button onClick={()=>{setAnalysis(null);setFileName(null);setError(null);}}
                style={{background:"transparent",border:"1px solid #222",color:"#444",padding:"8px 14px",borderRadius:5,cursor:"pointer",fontSize:10,letterSpacing:1,transition:"all 0.2s",whiteSpace:"nowrap"}}
                onMouseEnter={e=>e.target.style.borderColor="#ff6b2b"}
                onMouseLeave={e=>e.target.style.borderColor="#222"}>
                ↑ NEU LADEN
              </button>
            </div>

            {/* Quick issues */}
            {(analysis.badCount > 0 || analysis.mirrorBad > 0 || !analysis.mirror.ok) && (
              <div style={{background:"#130808",border:"1px solid #ff3c3c33",borderRadius:8,padding:"12px 16px",marginBottom:20}}>
                <div style={{fontSize:9,color:"#ff3c3c",letterSpacing:2,marginBottom:8}}>⚠ KRITISCHE PROBLEME</div>
                {[...analysis.params.filter(p=>p.result.status==="bad"), ...analysis.params.filter(p=>!p.result.mirrorOk&&p.result.valid)].slice(0,8).map(p=>(
                  <div key={p.id} style={{fontSize:10,color:"#ff6b2b",marginBottom:3}}>
                    · {p.label}: {!p.result.isDriftOk ? `Ist ${p.result.value} · Soll ${p.drift_soll}` : ""} {!p.result.mirrorOk?"[MIRROR INKONSISTENT]":""}
                  </div>
                ))}
                {[...analysis.maps.filter(m=>m.result.status==="bad")].map(m=>(
                  <div key={m.id} style={{fontSize:10,color:"#ff6b2b",marginBottom:3}}>
                    · {m.label}: {m.result.detail}
                  </div>
                ))}
                {!analysis.mirror.ok && (
                  <div style={{fontSize:10,color:"#ff3c3c",marginTop:4}}>
                    · Mirror-Bereich: P↔M1={analysis.mirror.diff12} | P↔M2={analysis.mirror.diff13} Bytes verschieden — mögl. korruptes Flash!
                  </div>
                )}
              </div>
            )}

            {/* Tabs */}
            <div style={{display:"flex",gap:2,marginBottom:16,borderBottom:"1px solid #1a1a1a",paddingBottom:0}}>
              {tabs.map(t=>(
                <button key={t} onClick={()=>setActiveTab(t)}
                  style={{
                    background:"transparent", border:"none", padding:"8px 18px",
                    cursor:"pointer", fontSize:10, letterSpacing:2,
                    color: activeTab===t?"#ff6b2b":"#444",
                    borderBottom: activeTab===t?"2px solid #ff6b2b":"2px solid transparent",
                    transition:"all 0.15s",
                  }}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>

            {/* OVERVIEW */}
            {activeTab==="overview" && (
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                {Object.entries(CATS).filter(([cat])=>catGroups[cat]).map(([cat,info])=>{
                  const group = catGroups[cat];
                  const allOk = [...(group?.params||[]), ...(group?.maps||[])].every(
                    p=>p.result[p.result.status?"status":""]!=="bad"
                  );
                  const hasMap = group?.maps?.length > 0;
                  const hasParam = group?.params?.length > 0;
                  const badItems = [
                    ...(group?.params||[]).filter(p=>p.result.status==="bad"),
                    ...(group?.maps||[]).filter(m=>m.result.status==="bad"),
                  ];
                  const stockItems = (group?.params||[]).filter(p=>p.result.status==="stock");
                  const okItems = [
                    ...(group?.params||[]).filter(p=>p.result.status==="ok"),
                    ...(group?.maps||[]).filter(m=>m.result.status==="ok"),
                  ];
                  const catStatus = badItems.length>0?"bad":stockItems.length>0?"stock":"ok";
                  return (
                    <div key={cat} style={{
                      border:`1px solid ${STATUS_COLOR[catStatus]}33`,
                      borderLeft:`3px solid ${STATUS_COLOR[catStatus]}`,
                      borderRadius:7, padding:"12px 16px", background:"#0d0d0d",
                    }}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span>{info.icon}</span>
                          <span style={{fontSize:9,letterSpacing:2,color:info.color,fontWeight:700}}>{info.title}</span>
                        </div>
                        <Badge status={catStatus}/>
                      </div>
                      <div style={{fontSize:10,color:"#555"}}>
                        {okItems.length>0&&<span style={{color:"#00ff88"}}>✓ {okItems.length} OK  </span>}
                        {stockItems.length>0&&<span style={{color:"#f59e0b"}}>◆ {stockItems.length} Stock  </span>}
                        {badItems.length>0&&<span style={{color:"#ff3c3c"}}>✗ {badItems.map(p=>p.label).join(", ")}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* PARAMS */}
            {activeTab==="params" && (
              <div>
                {Object.entries(CATS).filter(([cat])=>catGroups[cat]?.params?.length).map(([cat,info])=>(
                  <CategoryBlock key={cat} title={info.title} icon={info.icon} color={info.color}>
                    {catGroups[cat].params.map(p=><ParamRow key={p.id} p={p}/>)}
                  </CategoryBlock>
                ))}
              </div>
            )}

            {/* MAPS */}
            {activeTab==="maps" && (
              <div>
                {Object.entries(CATS).filter(([cat])=>catGroups[cat]?.maps?.length).map(([cat,info])=>(
                  <CategoryBlock key={cat} title={info.title} icon={info.icon} color={info.color}>
                    {catGroups[cat].maps.map(m=><MapRow key={m.id} m={m}/>)}
                  </CategoryBlock>
                ))}
              </div>
            )}

            {/* MIRROR */}
            {activeTab==="mirror" && (
              <div>
                <CategoryBlock title="MIRROR INTEGRITÄT" icon="🔁" color={analysis.mirror.ok?"#00ff88":"#ff3c3c"}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,padding:"8px 0"}}>
                    {[
                      {label:"Primary → Mirror 1", val:analysis.mirror.diff12},
                      {label:"Primary → Mirror 2", val:analysis.mirror.diff13},
                      {label:"Gesamt-Urteil",       val:analysis.mirror.ok?"OK":"KORRUPT"},
                    ].map(({label,val})=>(
                      <div key={label} style={{background:"#111",borderRadius:6,padding:14,textAlign:"center"}}>
                        <div style={{fontSize:9,color:"#444",letterSpacing:2,marginBottom:8}}>{label}</div>
                        <div style={{fontSize:20,fontWeight:700,color: typeof val==="number"?(val<100?"#00ff88":"#ff3c3c"):(val==="OK"?"#00ff88":"#ff3c3c")}}>
                          {typeof val==="number"?`${val} B`:val}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{marginTop:12}}>
                    <div style={{fontSize:9,color:"#444",letterSpacing:2,marginBottom:8}}>PARAMETER MIRROR-STATUS</div>
                    {analysis.params.filter(p=>p.result.valid&&!p.result.mirrorOk).length===0
                      ? <div style={{fontSize:10,color:"#00ff88"}}>✓ Alle Parameter Mirror-konsistent</div>
                      : analysis.params.filter(p=>p.result.valid&&!p.result.mirrorOk).map(p=>(
                        <div key={p.id} style={{fontSize:10,color:"#ff6b2b",marginBottom:4}}>
                          ✗ {p.label}: P={p.result.value} M1={p.result.m1} M2={p.result.m2}
                        </div>
                      ))
                    }
                  </div>
                </CategoryBlock>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        ::-webkit-scrollbar { width:4px; } 
        ::-webkit-scrollbar-track { background:#0a0a0a; }
        ::-webkit-scrollbar-thumb { background:#1e1e1e; border-radius:2px; }
      `}</style>
    </div>
  );
}
