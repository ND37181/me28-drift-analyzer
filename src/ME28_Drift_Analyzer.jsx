import { useState, useCallback, useRef } from "react";

const M1 = 0x8000;
const M2 = 0x60000;

const SW_VARIANTS = {
  "87200000": { label:"87200000", engine:"5.0L", gen:"Gen1 (37/00)", addrShift:-0x027C, nmaxShift:0 },
  "88200000": { label:"88200000", engine:"5.5L", gen:"Gen2 (37/01)", addrShift:0,       nmaxShift:0 },
  "88200001": { label:"88200001", engine:"5.5L", gen:"Gen2-B",       addrShift:0,       nmaxShift:0 },
  "88800000": { label:"88800000", engine:"5.0L", gen:"Gen3 (37/02)", addrShift:0,       nmaxShift:0x20C },
};

const REGIONS = [
  { start:0x00000, end:0x07FFF, name:"Programmcode A",            risk:"code",   color:"#4a4a4a" },
  { start:0x08000, end:0x0FFFF, name:"Programmcode B",            risk:"code",   color:"#4a4a4a" },
  { start:0x10000, end:0x1049F, name:"Klopferkennung (KEF*)",     risk:"low",    color:"#94a3b8" },
  { start:0x104A0, end:0x105E7, name:"Klopf-Messfenster",         risk:"low",    color:"#94a3b8" },
  { start:0x105E8, end:0x10627, name:"EGR (KFAGR)",               risk:"drift",  color:"#34d399" },
  { start:0x10628, end:0x10CFF, name:"Klopf / Diagnose",          risk:"low",    color:"#94a3b8" },
  { start:0x10D00, end:0x10DFF, name:"CAN-ASR Torque (KFMDRED)",  risk:"drift",  color:"#ff3c3c" },
  { start:0x10E00, end:0x117D2, name:"Drehmomentkennfelder",       risk:"medium", color:"#f59e0b" },
  { start:0x117D3, end:0x126E3, name:"Lambda / Einspritzung",     risk:"medium", color:"#60a5fa" },
  { start:0x126E4, end:0x12863, name:"Zuendwinkel KFZWZA",        risk:"timing", color:"#fbbf24" },
  { start:0x12864, end:0x12DC1, name:"Zuendwinkel KFZW",          risk:"timing", color:"#fbbf24" },
  { start:0x12DC2, end:0x12DDF, name:"NMAX Hard-Limiter",         risk:"drift",  color:"#ff3c3c" },
  { start:0x12DE0, end:0x132A1, name:"Misc Kennfelder",           risk:"low",    color:"#94a3b8" },
  { start:0x132A2, end:0x132A5, name:"Schubabschaltung (SAS)",    risk:"drift",  color:"#ff3c3c" },
  { start:0x132A6, end:0x13B9F, name:"Lambda / Misc",             risk:"low",    color:"#94a3b8" },
  { start:0x13BA0, end:0x13BA3, name:"Wandlerschutz (VNMAX*)",    risk:"drift",  color:"#f472b6" },
  { start:0x13BA4, end:0x15133, name:"Misc Kennfelder",           risk:"low",    color:"#94a3b8" },
  { start:0x15134, end:0x1513F, name:"Geschw.-Begrenzer (KSVMAX)",risk:"drift",  color:"#ff3c3c" },
  { start:0x15140, end:0x15547, name:"Pedal / Fahrerwunsch",      risk:"medium", color:"#60a5fa" },
  { start:0x15548, end:0x16547, name:"Misc Kennfelder",           risk:"low",    color:"#94a3b8" },
  { start:0x16548, end:0x16548, name:"TMASR ASR-Temperatur",      risk:"drift",  color:"#f472b6" },
  { start:0x16549, end:0x16B05, name:"Diverse",                   risk:"low",    color:"#94a3b8" },
  { start:0x16B06, end:0x16B50, name:"Soft-Limiter Block",        risk:"drift",  color:"#ff3c3c" },
  { start:0x16B51, end:0x17FFF, name:"Misc Kennfelder",           risk:"low",    color:"#94a3b8" },
  { start:0x18000, end:0x1FFFF, name:"Mirror 1",                  risk:"mirror", color:"#2a2a3a" },
  { start:0x20000, end:0x6FFFF, name:"ROM / Programmcode",        risk:"code",   color:"#3a3a3a" },
  { start:0x70000, end:0x77FFF, name:"Mirror 2",                  risk:"mirror", color:"#2a2a3a" },
  { start:0x78000, end:0x7FFFF, name:"Boot / Checksummen",        risk:"info",   color:"#555" },
];

const RISK_LABEL = { drift:"DRIFT", timing:"TIMING", medium:"KENNFELD", low:"NEBEN", code:"CODE", mirror:"MIRROR", info:"INFO" };
const RISK_COLOR = { drift:"#ff3c3c", timing:"#fbbf24", medium:"#f59e0b", low:"#555", code:"#444", mirror:"#333", info:"#60a5fa" };

const PARAMS = [
  { id:"NMAXAT",    addr:0x12DC2,size:2,cat:"NMAX",label:"NMAXAT",   unit:"rpm",drift_soll:6600, stock_range:[100,300], nmaxParam:true },
  { id:"NMAXD",     addr:0x12DC4,size:2,cat:"NMAX",label:"NMAXD",nmaxParam:true,    unit:"rpm",drift_soll:6600, stock_range:[80,200] },
  { id:"NMAXGNL",   addr:0x12DC6,size:2,cat:"NMAX",label:"NMAXGNL",nmaxParam:true,  unit:"rpm",drift_soll:6600, stock_range:[80,200] },
  { id:"NMAXK",     addr:0x12DC8,size:2,cat:"NMAX",label:"NMAXK",nmaxParam:true,    unit:"rpm",drift_soll:6600, stock_range:[80,200] },
  { id:"NMAXR",     addr:0x12DCA,size:2,cat:"NMAX",label:"NMAXR",nmaxParam:true,    unit:"rpm",drift_soll:6600, stock_range:[80,200] },
  { id:"NMAXWF",    addr:0x12DDC,size:2,cat:"NMAX",label:"NMAXWF",nmaxParam:true,   unit:"rpm",drift_soll:6500, stock_range:[60,120] },
  { id:"FWNMAXWF",  addr:0x16B06,size:2,cat:"SOFT",label:"FWNMAXWF", unit:"rpm",drift_soll:6500, stock_range:[4000,5200] },
  { id:"FWNTOEL",   addr:0x16B08,size:2,cat:"SOFT",label:"FWNTOEL",  unit:"rpm",drift_soll:6500, stock_range:[4000,5200] },
  { id:"FWTNMAXK",  addr:0x16B12,size:2,cat:"SOFT",label:"FWTNMAXK", unit:"ms", drift_soll:200,  stock_range:[1000,5000] },
  { id:"FWTRAMP",   addr:0x16B14,size:2,cat:"SOFT",label:"FWTRAMP",  unit:"ms", drift_soll:200,  stock_range:[1000,5000] },
  { id:"FWVMAXD",   addr:0x16B16,size:2,cat:"SOFT",label:"FWVMAXD",  unit:"",   drift_soll:0,    stock_range:[1,9999] },
  { id:"FWVMAXR",   addr:0x16B18,size:2,cat:"SOFT",label:"FWVMAXR",  unit:"",   drift_soll:0,    stock_range:[1,9999] },
  { id:"FWWNMAXD",  addr:0x16B1A,size:2,cat:"SOFT",label:"FWWNMAXD", unit:"rpm",drift_soll:6400, stock_range:[4000,5500] },
  { id:"FWWNMAXKA", addr:0x16B1C,size:2,cat:"SOFT",label:"FWWNMAXKA",unit:"rpm",drift_soll:6600, stock_range:[4000,5500] },
  { id:"FWWNMAXKH", addr:0x16B1E,size:2,cat:"SOFT",label:"FWWNMAXKH",unit:"rpm",drift_soll:6600, stock_range:[4000,5500] },
  { id:"FWWNMAXR",  addr:0x16B20,size:2,cat:"SOFT",label:"FWWNMAXR", unit:"rpm",drift_soll:6200, stock_range:[4000,5500] },
  { id:"KLAMDRED",  addr:0x16B22,size:2,cat:"SOFT",label:"KLAMDRED", unit:"",   drift_soll:0,    stock_range:[1,9999] },
  ...Array.from({length:8},(_,i)=>({ id:"VMAXOG"+i, addr:0x16B32+i*2, size:2, cat:"SOFT", label:"VMAXOG["+i+"]", unit:"", drift_soll:0xFFFF, stock_range:[0,5000] })),
  ...Array.from({length:6},(_,i)=>({ id:"KSVMAX"+i, addr:0x15134+i*2, size:2, cat:"VMAX", label:"KSVMAX["+i+"]", unit:"km/h*10", drift_soll:0xFFFF, stock_range:[1500,2000] })),
  { id:"SWSCHUB3",  addr:0x132A2,size:2,cat:"SAS", label:"SWSCHUB3", unit:"",   drift_soll:0,    stock_range:[1,9999] },
  { id:"SWSCHUB4",  addr:0x132A4,size:2,cat:"SAS", label:"SWSCHUB4", unit:"",   drift_soll:0,    stock_range:[1,9999] },
  { id:"VNMAXRF",   addr:0x13BA2,size:1,cat:"ATF", label:"VNMAXRF",  unit:"",   drift_soll:0,    stock_range:[1,255] },
  { id:"TMASR",     addr:0x16548,size:1,cat:"ASR", label:"TMASR",    unit:"C",  drift_soll:255,  stock_range:[25,80], nmaxParam:true },
];

const MAPS = [
  { id:"KFAGR",   addr:0x105E8, size:64,  cat:"EGR",     label:"KFAGR",  desc:"AGR [8x8]",            check:"all_zero" },
  { id:"KFMDRED", addr:0x10D52, size:74,  cat:"CAN_ASR", label:"KFMDRED",desc:"CAN-ASR Torque [37W]", check:"ffff_word", wc:37 },
  { id:"KFTORQ2", addr:0x153C8, size:24,  cat:"CAN_ASR", label:"Torque2",desc:"Torque2 [12W]",         check:"ffff_word", wc:12 },
  { id:"KFZW",    addr:0x12864, size:256, cat:"IGN",      label:"KFZW",   desc:"Zuendwinkel [16x16]",  check:"timing" },
  { id:"KFZWZA",  addr:0x126E4, size:256, cat:"IGN",      label:"KFZWZA", desc:"Zuendwinkel ZA [16x16]",check:"timing" },
];

const ru16 = (b,a) => (a+1<b.length) ? b[a]|(b[a+1]<<8) : 0;
const ru8  = (b,a) => (a<b.length)   ? b[a] : 0;

function detectSW(buf) {
  const s = String.fromCharCode(...Array.from(buf.slice(0x7FFB0,0x7FFC0)).filter(b=>b>31&&b<127));
  for (const [k,v] of Object.entries(SW_VARIANTS)) if (s.includes(k)) return {...v,raw:s.trim()};
  return {label:"UNKNOWN",engine:"?",gen:"?",addrShift:0,raw:s.trim()};
}
function getPartNr(buf) {
  return String.fromCharCode(...Array.from(buf.slice(0x7FFE9,0x7FFF5)).filter(b=>(b>47&&b<58)||(b>64&&b<91)||(b>96&&b<123)));
}
function mirrorCheck(buf) {
  let d12=0, d13=0;
  for (let i=0;i<0x8000;i++) {
    if (buf[0x10000+i] !== buf[0x10000+i+M1]) d12++;
    if (0x10000+i+M2 < buf.length && buf[0x10000+i] !== buf[0x10000+i+M2]) d13++;
  }
  return {d12, d13, ok: d12<100 && d13<100};
}

function classifyAddr(addr) {
  for (const r of REGIONS) if (addr>=r.start && addr<=r.end) return r;
  return {name:"Unbekannt",risk:"low",color:"#555"};
}

function computeDiff(ref, tune) {
  const GAP=32, blocks=[];
  let cur=null;
  for (let i=0; i<Math.min(ref.length,tune.length); i++) {
    if (ref[i]!==tune[i]) {
      if (!cur) cur={start:i,end:i,changed:1};
      else { cur.end=i; cur.changed++; }
    } else if (cur && (i-cur.end)>GAP) {
      blocks.push({...cur, total:cur.end-cur.start+1});
      cur=null;
    }
  }
  if (cur) blocks.push({...cur, total:cur.end-cur.start+1});
  return blocks.map(b=>({
    ...b,
    pct: Math.round(b.changed/(b.end-b.start+1)*100),
    region: classifyAddr(b.start),
  })).sort((a,b)=>{
    const o={drift:0,timing:1,medium:2,low:3,mirror:4,code:5,info:6};
    return (o[a.region.risk]||9)-(o[b.region.risk]||9);
  });
}

function analyzeParam(buf, p, shift, ref, nmaxShift) {
  // For NMAX+TMASR params in 88800000: try shifted address first, fall back to base
  let addr = p.addr+shift;
  let usedShift = 0;
  if (p.nmaxParam && nmaxShift) {
    const shiftedAddr = p.addr + shift + nmaxShift;
    if (shiftedAddr >= 0 && shiftedAddr+p.size <= buf.length) {
      addr = shiftedAddr;
      usedShift = nmaxShift;
    }
  }
  if (addr<0 || addr+p.size>buf.length) return {valid:false};
  const value    = p.size===2 ? ru16(buf,addr) : ru8(buf,addr);
  const m1v      = p.size===2 ? ru16(buf,addr+M1) : ru8(buf,addr+M1);
  const m2v      = p.size===2 ? ru16(buf,addr+M2) : ru8(buf,addr+M2);
  const refValue = ref ? (p.size===2 ? ru16(ref,addr) : ru8(ref,addr)) : null;
  const mirrorOk = value===m1v && value===m2v;
  // 0xFFFF on a limiter param = "disabled" = drift OK
  const isDisabled = value===0xFFFF && p.drift_soll!==0xFFFF;
  // KSVMAX: any value > 5000 (= 500 km/h) is effectively deactivated
  const isHighSpeed = p.cat==="VMAX" && value > 5000;
  const isDriftOk = value===p.drift_soll || isDisabled || isHighSpeed;
  const isStock   = !isDriftOk && value>=p.stock_range[0] && value<=p.stock_range[1];
  const status    = isDriftOk?"ok" : isStock?"stock" : "bad";
  const note      = isDisabled?"0xFFFF=deaktiviert" : isHighSpeed?`${(value*0.1).toFixed(0)}km/h`:null;
  return {valid:true,value,m1:m1v,m2:m2v,mirrorOk,isDriftOk,isStock,status,refValue,note,usedShift};
}

function analyzeMap(buf, m, shift, ref) {
  const addr = m.addr+shift;
  if (addr<0 || addr+m.size>buf.length) return {valid:false};
  if (m.check==="all_zero") {
    const nz = Array.from(buf.slice(addr,addr+m.size)).filter(x=>x!==0).length;
    return {valid:true, status:nz===0?"ok":"bad", detail:`${nz}/${m.size}B != 0`};
  }
  if (m.check==="ffff_word") {
    const nb = Array.from({length:m.wc}).filter((_,i)=>ru16(buf,addr+i*2)!==0xFFFF).length;
    return {valid:true, status:nb===0?"ok":"bad", detail:`${nb}/${m.wc}W != 0xFFFF`};
  }
  if (m.check==="timing") {
    const vals = Array.from(buf.slice(addr,addr+m.size));
    const avg  = vals.reduce((a,b)=>a+b,0)/vals.length;
    const zeros = vals.filter(v=>v===0).length;
    const refVals = ref ? Array.from(ref.slice(addr,addr+m.size)) : null;
    const m1d = vals.filter((_,i)=>buf[addr+i]!==buf[addr+M1+i]).length;
    const m2d = vals.filter((_,i)=>buf[addr+i]!==buf[addr+M2+i]).length;
    return {
      valid:true, status:zeros>200?"bad":"info",
      detail:`Ø ${(avg*0.75).toFixed(1)} Grad`,
      mirrorOk:m1d===0&&m2d===0, zeros, avg, vals, refVals,
    };
  }
  return {valid:false};
}

function runAnalysis(buf, ref) {
  const sw     = detectSW(buf);
  const shift  = sw.addrShift||0;
  const partNr = getPartNr(buf);
  const mirror = mirrorCheck(buf);
  const nmaxShift = sw.nmaxShift||0;
  const params = PARAMS.map(p=>({...p,result:analyzeParam(buf,p,shift,ref,nmaxShift)}));
  const maps   = MAPS.map(m=>({...m,result:analyzeMap(buf,m,shift,ref)}));
  const diff   = ref ? computeDiff(ref,buf) : null;
  const okC    = params.filter(p=>p.result.status==="ok").length;
  const badC   = params.filter(p=>p.result.status==="bad").length;
  const mapOk  = maps.filter(m=>m.result.status==="ok").length;
  const mapBad = maps.filter(m=>m.result.status==="bad").length;
  const total  = params.filter(p=>p.result.valid).length + maps.filter(m=>m.result.valid).length;
  const score  = Math.round(((okC+mapOk)/total)*100);
  return {sw,partNr,mirror,params,maps,diff,score,okC,badC,mapOk,mapBad};
}

function buildExportJSON(an, tuneName, refName) {
  return JSON.stringify({
    tool:"ME2.8 Drift Analyzer v2", generated:new Date().toISOString(),
    files:{tune:tuneName,ref:refName||null},
    sw:{label:an.sw.label,engine:an.sw.engine,gen:an.sw.gen,partNr:an.partNr},
    score:an.score,
    mirror:{d12:an.mirror.d12,d13:an.mirror.d13,ok:an.mirror.ok},
    params:an.params.map(p=>({
      id:p.id,cat:p.cat,label:p.label,value:p.result.valid?p.result.value:null,
      refValue:p.result.valid?p.result.refValue:null,
      drift_soll:p.drift_soll,status:p.result.valid?p.result.status:null,
      mirrorOk:p.result.valid?p.result.mirrorOk:null,
    })),
    maps:an.maps.map(m=>({id:m.id,label:m.label,status:m.result.valid?m.result.status:null,detail:m.result.valid?m.result.detail:null})),
    diff:an.diff?an.diff.map(b=>({
      start:"0x"+b.start.toString(16).toUpperCase().padStart(5,"0"),
      end:"0x"+b.end.toString(16).toUpperCase().padStart(5,"0"),
      size:b.total,changed:b.changed,pct:b.pct,
      region:b.region.name,risk:b.region.risk,
    })):null,
  }, null, 2);
}

function buildExportText(an, tuneName, refName) {
  const L=["=".repeat(55),"  ME2.8 DRIFT ANALYZER - PRUEFPROTOKOLL","  KFZ Dietrich","=".repeat(55),
    "Erstellt:   "+new Date().toLocaleString("de-DE"),
    "Datei:      "+tuneName, refName?"Referenz:   "+refName:"",
    "","SOFTWARE",
    "  SW:       "+an.sw.label+" ("+an.sw.engine+" / "+an.sw.gen+")",
    "  Teilenr.: "+(an.partNr||"-"),
    "","SCORE: "+an.score+"%","",
    "MIRROR","  P<>M1: "+an.mirror.d12+"B  P<>M2: "+an.mirror.d13+"B  "+( an.mirror.ok?"OK":"KORRUPT!"),
    "","PARAMETER",
    ...an.params.filter(p=>p.result.valid).map(p=>{
      const r=p.result;
      const v=r.value===0xFFFF?"0xFFFF":String(r.value);
      const rf=r.refValue!==null?" [Ref:"+(r.refValue===0xFFFF?"0xFFFF":r.refValue)+"]":"";
      const st=r.status==="ok"?"OK":r.status==="stock"?"STOCK":"FEHLER";
      return "  ["+st+"] "+p.label.padEnd(12)+" "+v.padEnd(8)+p.unit+rf+(!r.mirrorOk?" [MIRROR!]":"");
    }),
    "","KENNFELDER",
    ...an.maps.filter(m=>m.result.valid).map(m=>"  ["+(m.result.status==="ok"?"OK":"FEHLER")+"] "+m.label.padEnd(12)+" "+m.result.detail),
    "",
    ...(an.diff?[
      "DIFF ("+an.diff.length+" Bloecke)",
      ...an.diff.filter(b=>b.region.risk!=="mirror"&&b.region.risk!=="code").map(b=>
        "  ["+b.region.risk.toUpperCase().padEnd(6)+"] 0x"+b.start.toString(16).toUpperCase().padStart(5,"0")+" "+b.total+"B  "+b.region.name
      ),"",
    ]:[]),
    "=".repeat(55),
  ];
  return L.join("\n");
}

function downloadFile(content, filename, type) {
  const b=new Blob([content],{type}),u=URL.createObjectURL(b),a=document.createElement("a");
  a.href=u;a.download=filename;a.click();URL.revokeObjectURL(u);
}

const SC={ok:"#00ff88",bad:"#ff3c3c",stock:"#f59e0b",unknown:"#444",info:"#60a5fa"};

function Badge({status,children}) {
  const c=SC[status]||"#444";
  return <span style={{display:"inline-block",padding:"1px 6px",borderRadius:3,fontSize:9,fontFamily:"monospace",letterSpacing:1,background:c+"22",color:c,border:"1px solid "+c+"44"}}>{children||(status||"?").toUpperCase()}</span>;
}
function MDot({ok}) {
  return <span title={ok?"Mirror OK":"Mirror INKONSISTENT!"} style={{display:"inline-block",width:6,height:6,borderRadius:"50%",background:ok?"#00ff88":"#ff3c3c",marginLeft:4,verticalAlign:"middle"}}/>;
}

function ScoreRing({score}) {
  const r=34,circ=2*Math.PI*r,dash=(score/100)*circ;
  const c=score>=80?"#00ff88":score>=50?"#f59e0b":"#ff3c3c";
  return (
    <svg width={86} height={86}>
      <circle cx={43} cy={43} r={r} fill="none" stroke="#1a1a1a" strokeWidth={7}/>
      <circle cx={43} cy={43} r={r} fill="none" stroke={c} strokeWidth={7}
        strokeDasharray={dash+" "+circ} strokeLinecap="round"
        strokeDashoffset={circ/4}/>
      <text x={43} y={47} textAnchor="middle" fill={c} style={{fontSize:19,fontFamily:"monospace",fontWeight:700}}>{score}</text>
      <text x={43} y={58} textAnchor="middle" fill="#444" style={{fontSize:8,fontFamily:"monospace"}}>%</text>
    </svg>
  );
}

function TimingMap({vals,refVals,label}) {
  if(!vals||!vals.length) return null;
  const lo=Math.min(...vals),hi=Math.max(...vals)||1;
  const cellBg=(v)=>{
    if(refVals) {
      const i=vals.indexOf(v); const d=v-(refVals[i]||0);
      if(d===0) return "#141414";
      return d>0?"rgba(0,255,136,"+(Math.min(Math.abs(d)/20,1)*0.85)+")":"rgba(255,60,60,"+(Math.min(Math.abs(d)/20,1)*0.85)+")";
    }
    const t=(v-lo)/(hi-lo);
    if(t<0.33) return "hsl("+(220-t*100)+",60%,"+(25+t*20)+"%)";
    if(t<0.66) return "hsl("+(100-t*200)+",70%,40%)";
    return "hsl("+(Math.max(0,30-t*30))+",85%,47%)";
  };
  return (
    <div style={{marginBottom:24}}>
      <div style={{fontSize:9,color:"#ff6b2b",letterSpacing:2,marginBottom:8}}>{label}</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(16,1fr)",gap:2,maxWidth:528}}>
        {vals.map((v,i)=>{
          const d=refVals?v-refVals[i]:null;
          const alpha=d!==null?Math.min(Math.abs(d)/20,1)*0.8:0;
          const bg=d===null?cellBg(v):d===0?"#141414":d>0?"rgba(0,200,100,"+alpha+")":"rgba(220,50,50,"+alpha+")";
          const ti="[r"+Math.floor(i/16)+" c"+(i%16)+"] "+(v*0.75).toFixed(1)+"G"+(d!==null?" D"+(d>=0?"+":"")+( d*0.75).toFixed(1):"");
          return (
            <div key={i} title={ti}
              style={{background:bg,
                height:22,borderRadius:2,display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:7,color:"rgba(255,255,255,0.65)",border:"1px solid #111",cursor:"default"}}>
              {(v*0.75).toFixed(0)}
            </div>
          );
        })}
        })}
      </div>
      <div style={{display:"flex",gap:14,marginTop:5,fontSize:8,color:"#444"}}>
        {refVals
          ? <><span style={{color:"#00ff88"}}>gruen = mehr Vorzuendung</span><span style={{color:"#ff3c3c"}}>rot = weniger</span></>
          : <><span style={{color:"hsl(220,60%,30%)"}}>dunkel = niedrig</span><span style={{color:"hsl(0,85%,47%)"}}>hell = hoch</span></>}
      </div>
    </div>
  );
}

function DropZone({label,onFile,file,color,icon}) {
  const [drag,setDrag]=useState(false);
  const inp=useRef();
  return (
    <div onClick={()=>inp.current.click()}
      onDrop={e=>{e.preventDefault();setDrag(false);onFile(e.dataTransfer.files[0]);}}
      onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
      style={{border:"2px dashed "+(drag?color:"#1e1e1e"),borderRadius:8,padding:"18px 14px",
        textAlign:"center",cursor:"pointer",background:drag?color+"0a":"#0d0d0d",flex:1,minWidth:0,transition:"all 0.15s"}}>
      <div style={{fontSize:20,marginBottom:5}}>{icon}</div>
      <div style={{fontSize:9,color,letterSpacing:2,marginBottom:4}}>{label}</div>
      {file?<div style={{fontSize:9,color:"#00ff88"}}>✓ {file.name}</div>
            :<div style={{fontSize:9,color:"#333"}}>.bin / .FLS / 512KB</div>}
      <input ref={inp} type="file" accept=".bin,.FLS,.fls" style={{display:"none"}} onChange={e=>onFile(e.target.files[0])}/>
    </div>
  );
}

function PRow({p}) {
  const r=p.result;
  if(!r.valid) return null;
  const v=r.value===0xFFFF?"0xFFFF":String(r.value);
  const rv=r.refValue!==null?(r.refValue===0xFFFF?"0xFFFF":String(r.refValue)):null;
  const delta=(r.refValue!==null&&r.value!==null&&r.value!==undefined)?r.value-r.refValue:null;
  const vc=r.status==="ok"?"#00ff88":r.status==="bad"?"#ff3c3c":"#f59e0b";
  const noteStr=r.note?" "+r.note:"";
  return (
    <div style={{display:"grid",gridTemplateColumns:"110px 75px 65px 55px 1fr 68px",alignItems:"center",
      padding:"4px 0",borderBottom:"1px solid #0e0e0e",fontSize:10}}>
      <span style={{fontFamily:"monospace",color:"#888"}}>{p.label}</span>
      <span style={{fontFamily:"monospace",color:vc}}>{v}<span style={{color:"#333",fontSize:8}}> {p.unit}</span>{r.note&&<span style={{color:"#555",fontSize:8}}> {r.note}</span>}</span>
      {rv?<span style={{color:"#333",fontSize:9}}>Ref:{rv}</span>:<span/>}
      {delta!==null&&delta!==0?<span style={{color:delta>0?"#00ff88":"#ff3c3c",fontSize:9}}>{delta>0?"+":""}{delta}</span>:<span/>}
      <span style={{color:"#2a2a2a",fontSize:9}}>Soll:{p.drift_soll===0xFFFF?"0xFFFF":p.drift_soll}</span>
      <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:3}}>
        <Badge status={r.status}/><MDot ok={r.mirrorOk}/>
      </div>
    </div>
  );
}

const CAT_DEFS = {
  NMAX:{label:"NMAX HARD-LIMITER",color:"#ff6b2b"},
  SOFT:{label:"SOFT-LIMITER",color:"#f59e0b"},
  VMAX:{label:"GESCHW.-BEGRENZER",color:"#a78bfa"},
  SAS:{label:"SCHUBABSCHALTUNG",color:"#34d399"},
  ATF:{label:"WANDLERSCHUTZ",color:"#60a5fa"},
  ASR:{label:"ASR TEMPERATUR",color:"#f472b6"},
};
const MAP_CAT_DEFS = {
  EGR:{label:"ABGASRUECKFUEHRUNG",color:"#94a3b8"},
  CAN_ASR:{label:"CAN-ASR DREHMOMENTTABELLEN",color:"#ff3c3c"},
  IGN:{label:"ZUENDWINKEL-KENNFELDER",color:"#fbbf24"},
};

export default function App() {
  const [tuneFile,setTuneFile]=useState(null);
  const [refFile,setRefFile]=useState(null);
  const [tuneBuf,setTuneBuf]=useState(null);
  const [refBuf,setRefBuf]=useState(null);
  const [analysis,setAnalysis]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(null);
  const [tab,setTab]=useState("overview");

  const load=(file,isRef)=>{
    if(!file)return;
    const rd=new FileReader();
    rd.onload=e=>{
      const buf=new Uint8Array(e.target.result);
      if(buf.length!==524288){setError(file.name+": "+buf.length+"B -- erwartet 524288");return;}
      if(isRef){setRefFile(file);setRefBuf(buf);setAnalysis(null);}
      else{setTuneFile(file);setTuneBuf(buf);setAnalysis(null);}
    };
    rd.readAsArrayBuffer(file);
  };

  const analyze=()=>{
    if(!tuneBuf)return;
    setLoading(true);setError(null);
    setTimeout(()=>{
      try{const r=runAnalysis(tuneBuf,refBuf||null);setAnalysis(r);setTab("overview");}
      catch(ex){setError("Fehler: "+ex.message);}
      setLoading(false);
    },60);
  };

  const reset=()=>{setTuneFile(null);setRefFile(null);setTuneBuf(null);setRefBuf(null);setAnalysis(null);setError(null);};

  const TABS=analysis
    ? ["overview","params","kennfelder","timing","diff","export"].filter(t=>t!=="diff"||analysis.diff)
    : [];

  return (
    <div style={{minHeight:"100vh",background:"#080808",color:"#c0c0c0",fontFamily:"'JetBrains Mono',monospace",
      backgroundImage:"radial-gradient(ellipse at 15% 15%,#0a1a0a 0%,transparent 55%),radial-gradient(ellipse at 85% 85%,#0a0a1a 0%,transparent 55%)"}}>

      {/* Header */}
      <div style={{borderBottom:"1px solid #141414",background:"#040404ee",backdropFilter:"blur(8px)",
        padding:"0 22px",position:"sticky",top:0,zIndex:20,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 0"}}>
          <div style={{width:24,height:24,background:"#ff6b2b18",border:"1px solid #ff6b2b44",borderRadius:4,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>⚡</div>
          <div>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:3,color:"#ff6b2b"}}>ME2.8 DRIFT ANALYZER</div>
            <div style={{fontSize:8,color:"#252525",letterSpacing:2}}>v2 · ZWEI-DATEI-VERGLEICH · KFZ DIETRICH</div>
          </div>
        </div>
        {analysis&&<button onClick={reset} style={{background:"transparent",border:"1px solid #1a1a1a",
          color:"#383838",padding:"4px 12px",borderRadius:4,cursor:"pointer",fontSize:9,letterSpacing:1,fontFamily:"monospace"}}>
          RESET
        </button>}
      </div>

      <div style={{maxWidth:1100,margin:"0 auto",padding:"18px 22px"}}>

        {/* File load area */}
        {!analysis&&(
          <div style={{marginBottom:18}}>
            <div style={{display:"flex",gap:10,marginBottom:10}}>
              <DropZone label="TUNE / PRUEFLING" onFile={f=>load(f,false)} file={tuneFile} color="#ff6b2b" icon="⚙"/>
              <DropZone label="REFERENZ (optional)" onFile={f=>load(f,true)} file={refFile} color="#60a5fa" icon="📋"/>
            </div>
            {tuneBuf&&(
              <button onClick={analyze} style={{width:"100%",background:"#ff6b2b",border:"none",color:"#000",
                padding:"10px",borderRadius:6,cursor:"pointer",fontSize:11,fontFamily:"monospace",letterSpacing:3,fontWeight:700}}>
                ANALYSIEREN{refBuf?" (mit Referenz-Vergleich)":""}
              </button>
            )}
          </div>
        )}

        {loading&&<div style={{textAlign:"center",padding:56}}>
          <div style={{fontSize:22,animation:"spin 0.8s linear infinite",marginBottom:10}}>⚙</div>
          <div style={{fontSize:10,color:"#ff6b2b",letterSpacing:3}}>ANALYSIERE...</div>
        </div>}

        {error&&<div style={{background:"#110606",border:"1px solid #ff3c3c33",borderRadius:7,padding:"12px 16px",marginBottom:14}}>
          <div style={{color:"#ff3c3c",fontSize:10,marginBottom:3}}>FEHLER</div>
          <div style={{fontSize:9,color:"#666"}}>{error}</div>
        </div>}

        {analysis&&(<>
          {/* Summary */}
          <div style={{display:"grid",gridTemplateColumns:"76px 1fr",gap:14,background:"#0b0b0b",
            border:"1px solid #181818",borderRadius:8,padding:14,marginBottom:14,alignItems:"center"}}>
            <div style={{textAlign:"center"}}><ScoreRing score={analysis.score}/>
              <div style={{fontSize:7,color:"#2a2a2a",letterSpacing:2}}>SCORE</div></div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
              <div>
                <div style={{fontSize:8,color:"#2a2a2a",letterSpacing:2,marginBottom:4}}>SOFTWARE</div>
                <div style={{fontSize:13,color:"#ff6b2b",fontWeight:700}}>{analysis.sw.label}</div>
                <div style={{fontSize:9,color:"#3a3a3a"}}>{analysis.sw.engine} / {analysis.sw.gen}</div>
              </div>
              <div>
                <div style={{fontSize:8,color:"#2a2a2a",letterSpacing:2,marginBottom:4}}>TEILENUMMER</div>
                <div style={{fontSize:10,color:"#666",fontFamily:"monospace"}}>{analysis.partNr||"---"}</div>
              </div>
              <div>
                <div style={{fontSize:8,color:"#2a2a2a",letterSpacing:2,marginBottom:4}}>PARAMETER</div>
                <div style={{fontSize:10,color:"#555"}}>
                  <span style={{color:"#00ff88"}}>{analysis.okC} OK</span>
                  {" "}<span style={{color:"#f59e0b"}}>{analysis.params.filter(p=>p.result.status==="stock").length} St</span>
                  {" "}<span style={{color:"#ff3c3c"}}>{analysis.badC} Err</span>
                </div>
              </div>
              <div>
                <div style={{fontSize:8,color:"#2a2a2a",letterSpacing:2,marginBottom:4}}>MIRROR</div>
                <div style={{fontSize:9,color:analysis.mirror.ok?"#00ff88":"#ff3c3c"}}>
                  {analysis.mirror.ok?"OK":"FEHLER"}
                </div>
                {!analysis.mirror.ok&&<div style={{fontSize:8,color:"#ff3c3c"}}>M1:{analysis.mirror.d12}B M2:{analysis.mirror.d13}B</div>}
              </div>
            </div>
          </div>

          {/* Alerts */}
          {(analysis.badC>0||!analysis.mirror.ok||analysis.mapBad>0)&&(
            <div style={{background:"#0e0606",border:"1px solid #ff3c3c20",borderRadius:7,
              padding:"9px 13px",marginBottom:12}}>
              <div style={{fontSize:8,color:"#ff3c3c",letterSpacing:2,marginBottom:5}}>KRITISCHE PROBLEME</div>
              {analysis.params.filter(p=>p.result.status==="bad").map(p=>(
                <div key={p.id} style={{fontSize:9,color:"#ff6b2b",marginBottom:2}}>
                  {p.label}: ist {p.result.value} / soll {p.drift_soll===0xFFFF?"0xFFFF":p.drift_soll}
                  {!p.result.mirrorOk?" [MIRROR!]":""}
                </div>
              ))}
              {analysis.maps.filter(m=>m.result.status==="bad").map(m=>(
                <div key={m.id} style={{fontSize:9,color:"#ff6b2b",marginBottom:2}}>{m.label}: {m.result.detail}</div>
              ))}
              {!analysis.mirror.ok&&<div style={{fontSize:9,color:"#ff3c3c",marginTop:2}}>Mirror: {analysis.mirror.d12}B (M1) / {analysis.mirror.d13}B (M2)</div>}
            </div>
          )}

          {/* Tabs */}
          <div style={{display:"flex",borderBottom:"1px solid #141414",marginBottom:12}}>
            {TABS.map(t=>(
              <button key={t} onClick={()=>setTab(t)} style={{background:"transparent",border:"none",
                padding:"6px 14px",cursor:"pointer",fontSize:9,letterSpacing:2,fontFamily:"monospace",
                color:tab===t?"#ff6b2b":"#2e2e2e",
                borderBottom:tab===t?"2px solid #ff6b2b":"2px solid transparent",transition:"all 0.1s"}}>
                {t==="diff"?"DIFF ("+analysis.diff.length+")":t.toUpperCase()}
              </button>
            ))}
          </div>

          {/* OVERVIEW */}
          {tab==="overview"&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
              {Object.entries(CAT_DEFS).map(([cat,{label,color}])=>{
                const ps=analysis.params.filter(p=>p.cat===cat&&p.result.valid);
                if(!ps.length)return null;
                const ok=ps.filter(p=>p.result.status==="ok").length;
                const bad=ps.filter(p=>p.result.status==="bad").length;
                const st=bad>0?"bad":ok===ps.length?"ok":"stock";
                return(
                  <div key={cat} style={{border:"1px solid "+SC[st]+"22",borderLeft:"3px solid "+SC[st],
                    borderRadius:6,padding:"9px 11px",background:"#0b0b0b"}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                      <span style={{fontSize:8,letterSpacing:2,color}}>{label}</span>
                      <Badge status={st}/>
                    </div>
                    <div style={{fontSize:9,color:"#3a3a3a"}}>
                      <span style={{color:"#00ff88"}}>{ok}</span>/{ps.length} OK
                      {bad>0&&<span style={{color:"#ff3c3c"}}> / {bad} Fehler</span>}
                    </div>
                  </div>
                );
              })}
              {Object.entries(MAP_CAT_DEFS).map(([cat,{label,color}])=>{
                const ms=analysis.maps.filter(m=>m.cat===cat&&m.result.valid);
                if(!ms.length)return null;
                const ok=ms.filter(m=>m.result.status==="ok").length;
                const bad=ms.filter(m=>m.result.status==="bad").length;
                const st=bad>0?"bad":ok===ms.length?"ok":"stock";
                return(
                  <div key={cat} style={{border:"1px solid "+SC[st]+"22",borderLeft:"3px solid "+SC[st],
                    borderRadius:6,padding:"9px 11px",background:"#0b0b0b"}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                      <span style={{fontSize:8,letterSpacing:2,color}}>{label}</span>
                      <Badge status={st}/>
                    </div>
                    <div style={{fontSize:9,color:"#3a3a3a"}}>
                      {ms.map(m=><span key={m.id} style={{marginRight:8,color:m.result.status==="ok"?"#00ff88":"#ff3c3c"}}>
                        {m.label}: {m.result.detail}
                      </span>)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* PARAMS */}
          {tab==="params"&&Object.entries(CAT_DEFS).map(([cat,{label,color}])=>{
            const ps=analysis.params.filter(p=>p.cat===cat&&p.result.valid);
            if(!ps.length)return null;
            return(
              <div key={cat} style={{border:"1px solid "+color+"22",borderLeft:"3px solid "+color,borderRadius:6,marginBottom:11}}>
                <div style={{padding:"6px 11px",background:color+"10",fontSize:8,color,letterSpacing:2,fontWeight:700}}>{label}</div>
                <div style={{padding:"6px 11px"}}>{ps.map(p=><PRow key={p.id} p={p}/>)}</div>
              </div>
            );
          })}

          {/* KENNFELDER */}
          {tab==="kennfelder"&&Object.entries(MAP_CAT_DEFS).map(([cat,{label,color}])=>{
            const ms=analysis.maps.filter(m=>m.cat===cat&&m.result.valid);
            if(!ms.length)return null;
            return(
              <div key={cat} style={{border:"1px solid "+color+"22",borderLeft:"3px solid "+color,borderRadius:6,marginBottom:11}}>
                <div style={{padding:"6px 11px",background:color+"10",fontSize:8,color,letterSpacing:2,fontWeight:700}}>{label}</div>
                <div style={{padding:"6px 11px"}}>
                  {ms.map(m=>(
                    <div key={m.id} style={{display:"grid",gridTemplateColumns:"110px 1fr 80px",alignItems:"center",
                      padding:"4px 0",borderBottom:"1px solid #0e0e0e",fontSize:10}}>
                      <span style={{fontFamily:"monospace",color:"#777"}}>{m.label}</span>
                      <span style={{color:"#2e2e2e",fontSize:9}}>{m.desc} / {m.result.detail}</span>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:3}}>
                        <Badge status={m.result.status}/>
                        {m.result.mirrorOk!==undefined&&<MDot ok={m.result.mirrorOk}/>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* TIMING */}
          {tab==="timing"&&(
            <div>
              <div style={{fontSize:9,color:"#333",marginBottom:14,lineHeight:1.8}}>
                {analysis.diff?"Farbe = Delta zur Referenz: gruen = mehr Vorzuendung, rot = weniger. Tooltip = absoluter Wert."
                  :"Absoluter Zuendwinkelwert. Dunkel = weniger Vorzuendung. 1 raw = 0.75 Grad."}
              </div>
              {analysis.maps.filter(m=>m.cat==="IGN"&&m.result.valid&&m.result.vals).map(m=>(
                <TimingMap key={m.id} label={m.label+" -- "+m.result.detail} vals={m.result.vals} refVals={m.result.refVals}/>
              ))}
            </div>
          )}

          {/* DIFF */}
          {tab==="diff"&&analysis.diff&&(
            <div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:14}}>
                {Object.entries(RISK_LABEL).map(([risk,lbl])=>{
                  const cnt=analysis.diff.filter(b=>b.region.risk===risk).length;
                  if(!cnt)return null;
                  const c=RISK_COLOR[risk];
                  return(
                    <div key={risk} style={{background:c+"0e",border:"1px solid "+c+"2a",borderRadius:5,padding:"8px 10px",textAlign:"center"}}>
                      <div style={{fontSize:20,color:c,fontWeight:700}}>{cnt}</div>
                      <div style={{fontSize:8,color:c,letterSpacing:1,marginTop:2}}>{lbl}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{fontSize:8,color:"#222",letterSpacing:2,marginBottom:7,display:"grid",
                gridTemplateColumns:"12px 120px 80px 50px 1fr",gap:8}}>
                <span/><span>ADRESSE</span><span>GESAMT/DIFF</span><span>TYP</span><span>REGION</span>
              </div>
              {analysis.diff.filter(b=>b.region.risk!=="mirror"&&b.region.risk!=="code").map((b,i)=>{
                const c=RISK_COLOR[b.region.risk]||"#555";
                return(
                  <div key={i} style={{display:"grid",gridTemplateColumns:"12px 120px 80px 50px 1fr",
                    alignItems:"center",padding:"4px 0",borderBottom:"1px solid #0e0e0e",fontSize:9,gap:8}}>
                    <div style={{width:3,height:12,background:c,borderRadius:2}}/>
                    <span style={{fontFamily:"monospace",color:"#555",fontSize:8}}>
                      0x{b.start.toString(16).toUpperCase().padStart(5,"0")}-0x{b.end.toString(16).toUpperCase().padStart(5,"0")}
                    </span>
                    <span style={{color:"#444",fontSize:8}}>{b.total}B/{b.changed}B</span>
                    <span style={{fontSize:7,padding:"1px 4px",borderRadius:3,letterSpacing:1,
                      background:c+"22",color:c,border:"1px solid "+c+"44",whiteSpace:"nowrap"}}>
                      {RISK_LABEL[b.region.risk]||"?"}
                    </span>
                    <span style={{color:"#777"}}>{b.region.name}</span>
                  </div>
                );
              })}
              {analysis.diff.filter(b=>b.region.risk==="mirror"||b.region.risk==="code").length>0&&(
                <div style={{marginTop:10,fontSize:8,color:"#222"}}>
                  + {analysis.diff.filter(b=>b.region.risk==="mirror"||b.region.risk==="code").length} Bloecke in Code/Mirror (ausgeblendet)
                </div>
              )}
            </div>
          )}

          {/* EXPORT */}
          {tab==="export"&&(
            <div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                {[
                  {t:"JSON Export",i:"{}",d:"Maschinenlesbar / alle Werte / fuer Weiterverarbeitung",
                    fn:()=>downloadFile(buildExportJSON(analysis,tuneFile?.name,refFile?.name),"ME28_"+tuneFile?.name?.replace(/\.[^.]+$/,"")+".json","application/json")},
                  {t:"Text Protokoll",i:"=",d:"Druckbares Pruefprotokoll / plain text",
                    fn:()=>downloadFile(buildExportText(analysis,tuneFile?.name,refFile?.name),"ME28_Protokoll_"+tuneFile?.name?.replace(/\.[^.]+$/,"")+".txt","text/plain")},
                ].map(({t,i,d,fn})=>(
                  <div key={t} style={{background:"#0b0b0b",border:"1px solid #181818",borderRadius:8,padding:18,textAlign:"center"}}>
                    <div style={{fontSize:26,marginBottom:8,color:"#ff6b2b"}}>{i}</div>
                    <div style={{fontSize:11,color:"#777",marginBottom:5}}>{t}</div>
                    <div style={{fontSize:8,color:"#2a2a2a",marginBottom:14}}>{d}</div>
                    <button onClick={fn} style={{background:"#ff6b2b",border:"none",color:"#000",
                      padding:"7px 18px",borderRadius:4,cursor:"pointer",fontSize:9,
                      fontFamily:"monospace",letterSpacing:2,fontWeight:700}}>
                      HERUNTERLADEN
                    </button>
                  </div>
                ))}
              </div>
              <div style={{background:"#0b0b0b",border:"1px solid #181818",borderRadius:8,padding:12}}>
                <div style={{fontSize:7,color:"#222",letterSpacing:2,marginBottom:6}}>VORSCHAU</div>
                <pre style={{fontSize:8,color:"#3a3a3a",lineHeight:1.6,overflow:"auto",maxHeight:250,
                  whiteSpace:"pre",fontFamily:"monospace",margin:0}}>
                  {buildExportText(analysis,tuneFile?.name,refFile?.name).split("\n").slice(0,25).join("\n")}
                </pre>
              </div>
            </div>
          )}
        </>)}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box}
        @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-track{background:#080808}
        ::-webkit-scrollbar-thumb{background:#1e1e1e;border-radius:2px}
      `}</style>
    </div>
  );
}
