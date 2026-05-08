/* global React */
const { useState, useRef, useEffect } = React;

// =================================================================
// Trend Line Chart with pace line + hoverable dots + note tooltips
// =================================================================
function TrendChart({ goal, height = 260, showPaceLine = true }) {
  const wrapRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(null);
  const [w, setW] = useState(640);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(es => setW(es[0].contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const padL = 44, padR = 16, padT = 18, padB = 28;
  const innerW = Math.max(40, w - padL - padR);
  const innerH = height - padT - padB;

  const t0 = new Date(goal.startDate).getTime();
  const t1 = new Date(goal.targetDate).getTime();

  const allValues = [goal.startValue, goal.targetValue, ...goal.logs.map(l => l.value)];
  const vMin = Math.min(...allValues);
  const vMax = Math.max(...allValues);
  const pad = (vMax - vMin) * 0.15 || 1;
  const yMin = vMin - pad;
  const yMax = vMax + pad;

  const xOf = (t) => padL + ((t - t0) / (t1 - t0)) * innerW;
  const yOf = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  const sortedLogs = [...goal.logs].sort((a,b)=> new Date(a.at)-new Date(b.at));
  const pts = sortedLogs.map(l => ({ x: xOf(new Date(l.at).getTime()), y: yOf(l.value), log: l }));

  const linePath = pts.map((p,i) => `${i===0?'M':'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = pts.length > 1
    ? `${linePath} L ${pts[pts.length-1].x.toFixed(1)} ${(padT+innerH).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(padT+innerH).toFixed(1)} Z`
    : '';

  // pace line: from (start, startValue) → (target, targetValue)
  const pace = {
    x1: xOf(t0), y1: yOf(goal.startValue),
    x2: xOf(t1), y2: yOf(goal.targetValue),
  };

  // today vertical line
  const tNow = Date.now();
  const todayX = (tNow >= t0 && tNow <= t1) ? xOf(tNow) : null;

  // y ticks
  const yTicks = 4;
  const ticks = Array.from({ length: yTicks+1 }, (_, i) => yMin + (i/yTicks)*(yMax-yMin));

  // x ticks (start, mid, end)
  const xTicks = [
    { t: t0, label: window.GoalsData.fmtDate(goal.startDate) },
    { t: (t0+t1)/2, label: window.GoalsData.fmtDate(new Date((t0+t1)/2).toISOString()) },
    { t: t1, label: window.GoalsData.fmtDate(goal.targetDate) },
  ];

  const hovered = hoverIdx != null ? pts[hoverIdx] : null;

  return (
    <div ref={wrapRef} style={{ position:'relative', width:'100%' }}>
      <svg width={w} height={height} style={{ display:'block', overflow:'visible' }}>
        <defs>
          <linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.20"/>
            <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0"/>
          </linearGradient>
        </defs>

        {/* y gridlines + labels */}
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={padL+innerW} y1={yOf(v)} y2={yOf(v)} stroke="rgb(var(--border))" strokeDasharray="2 4" strokeWidth="1"/>
            <text x={padL-8} y={yOf(v)+3} textAnchor="end" className="axis-text">{v.toFixed(v >= 100 ? 0 : 1)}</text>
          </g>
        ))}

        {/* x labels */}
        {xTicks.map((t,i) => (
          <text key={i} x={xOf(t.t)} y={height-8} textAnchor="middle" className="axis-text">{t.label}</text>
        ))}

        {/* pace line (start → target) */}
        {showPaceLine ? (
          <g>
            <line x1={pace.x1} y1={pace.y1} x2={pace.x2} y2={pace.y2}
              stroke="rgb(var(--muted))" strokeWidth="1.4" strokeDasharray="5 5" opacity="0.7"/>
            <circle cx={pace.x1} cy={pace.y1} r="3" fill="rgb(var(--bg))" stroke="rgb(var(--muted))" strokeWidth="1.4"/>
            <circle cx={pace.x2} cy={pace.y2} r="4" fill="rgb(var(--bg))" stroke="rgb(var(--muted))" strokeWidth="1.4"/>
            <text x={pace.x2} y={pace.y2-9} textAnchor="end" className="axis-text" style={{ fontWeight:600 }}>
              target {goal.targetValue}{goal.unit||''}
            </text>
          </g>
        ) : null}

        {/* today line */}
        {todayX != null ? (
          <g>
            <line x1={todayX} y1={padT} x2={todayX} y2={padT+innerH} stroke="rgb(var(--accent))" strokeWidth="1" strokeDasharray="2 3" opacity="0.5"/>
            <text x={todayX} y={padT-4} textAnchor="middle" className="axis-text" style={{ fontWeight:600, fill:'rgb(var(--accent))' }}>now</text>
          </g>
        ) : null}

        {/* area */}
        {pts.length > 1 ? <path d={areaPath} fill="url(#trend-area)" /> : null}

        {/* line */}
        {pts.length > 1 ? <path d={linePath} fill="none" stroke="rgb(var(--accent))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/> : null}

        {/* dots */}
        {pts.map((p,i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={hoverIdx===i ? 6 : 4}
              fill="rgb(var(--accent))"
              stroke="rgb(var(--surface))"
              strokeWidth="2"
              style={{ cursor:'pointer', transition:'r .15s' }}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
            />
            {p.log.note ? <circle cx={p.x+5.5} cy={p.y-5.5} r="2.2" fill="rgb(var(--fg))" /> : null}
          </g>
        ))}
      </svg>

      {hovered ? (
        <div className="chart-tooltip" style={{ left: hovered.x, top: hovered.y }}>
          <div className="tabular" style={{ fontWeight:600 }}>{hovered.log.value}{goal.unit||''}</div>
          <div style={{ opacity:.75 }}>{window.GoalsData.fmtDate(hovered.log.at, { month:'short', day:'numeric', year:'numeric' })}</div>
          {hovered.log.note ? <div style={{ marginTop:4, maxWidth:220, whiteSpace:'normal', opacity:.85 }}>“{hovered.log.note}”</div> : null}
        </div>
      ) : null}
    </div>
  );
}

// =================================================================
// Donut for accumulation
// =================================================================
function Donut({ percent, size = 180, stroke = 14, label, sublabel }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (percent / 100) * c;
  return (
    <div style={{ position:'relative', width:size, height:size }}>
      <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} className="donut-bg" strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} className="donut-fg" strokeWidth={stroke}
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round"/>
      </svg>
      <div style={{
        position:'absolute', inset:0,
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        textAlign:'center',
      }}>
        <div style={{ fontSize: 28, fontWeight:600, letterSpacing:'-0.02em', fontVariantNumeric:'tabular-nums' }}>{label}</div>
        {sublabel ? <div style={{ fontSize: 11.5, color:'rgb(var(--muted))', marginTop:2 }}>{sublabel}</div> : null}
      </div>
    </div>
  );
}

// =================================================================
// Sparkline (cumulative for accumulation cards)
// =================================================================
function Sparkline({ data, w=120, h=32 }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  const stepX = w / Math.max(1, data.length-1);
  const path = data.map((v,i) => `${i===0?'M':'L'}${(i*stepX).toFixed(1)} ${(h - (v/max)*h).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} style={{ display:'block' }}>
      <path d={path} fill="none" stroke="rgb(var(--accent))" strokeWidth="1.5" strokeLinecap="round"/>
      <path d={`${path} L ${w} ${h} L 0 ${h} Z`} fill="rgb(var(--accent) / .15)"/>
    </svg>
  );
}

// =================================================================
// Mini bar (for accumulation card preview)
// =================================================================
function MiniBars({ values, w=140, h=36 }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const barW = w / values.length - 2;
  return (
    <svg width={w} height={h}>
      {values.map((v,i) => {
        const bh = Math.max(2, (v/max)*h);
        return (
          <rect key={i} x={i*(barW+2)} y={h-bh} width={barW} height={bh} rx="1.5" className={v>0?'spark-bar':'spark-bar light'}/>
        );
      })}
    </svg>
  );
}

window.GoalsCharts = { TrendChart, Donut, Sparkline, MiniBars };
