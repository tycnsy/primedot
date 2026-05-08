/* global React */
const { useState, useMemo, useEffect } = React;
const { Icon, CheckSquare, Counter, RingProgress, TagChip, GoalTypeBadge, WeekStrip, Modal } = window.GoalsControls;
const { TrendChart, Donut, Sparkline, MiniBars } = window.GoalsCharts;
const { Sidebar, PageHeader, TodayScreen } = window.GoalsScreens;
const D = window.GoalsData;

// =================================================================
// Index — All Goals (long-term grid + today's checklist preview)
// =================================================================
function IndexScreen({ store, navigate, layout = 'grid' }) {
  const [tab, setTab] = useState('all'); // all | trend | accumulation | milestone | daily
  const [activeTagId, setActiveTagId] = useState(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = store.longGoals;
    if (tab !== 'all' && tab !== 'daily') list = list.filter(g => g.type === tab);
    if (activeTagId) list = list.filter(g => (g.tags||[]).includes(activeTagId));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(g => g.name.toLowerCase().includes(q));
    }
    return list;
  }, [store.longGoals, tab, activeTagId, search]);

  const dailyVisible = tab === 'all' || tab === 'daily';

  return (
    <div className="fade-in" style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <PageHeader
        eyebrow="PERSONAL"
        title="Goals"
        subtitle={`${store.longGoals.length} long-term · ${store.dailyGoals.length} recurring · ${D.fmtWeekdayDate(D.todayISO())}`}
        right={
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button className="btn btn-ghost" onClick={() => navigate({ screen:'today' })}>
              Today view
            </button>
            <button className="btn btn-primary" onClick={() => navigate({ screen:'index', openNew:true })}>
              <Icon.plus /> New goal
            </button>
          </div>
        }
      />

      {/* tabs + filters */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:12, alignItems:'center', justifyContent:'space-between' }}>
        <div className="segmented">
          {['all','trend','accumulation','milestone','daily'].map(t => (
            <button key={t} data-active={tab===t} onClick={() => setTab(t)} style={{ textTransform:'capitalize' }}>{t}</button>
          ))}
        </div>
        <div style={{ position:'relative', width: 220 }}>
          <span style={{ position:'absolute', top:'50%', left:10, transform:'translateY(-50%)', color:'rgb(var(--muted))', display:'inline-flex' }}><Icon.search /></span>
          <input className="input" placeholder="Search goals…" value={search} onChange={(e)=>setSearch(e.target.value)} style={{ paddingLeft: 30 }}/>
        </div>
      </div>

      {/* tag filter chips */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
        <button className="chip-filter" data-active={activeTagId === null} onClick={() => setActiveTagId(null)}>All tags</button>
        {store.tags.map(t => (
          <button key={t.id} className="chip-filter" data-active={activeTagId === t.id}
            onClick={() => setActiveTagId(activeTagId === t.id ? null : t.id)}>
            <span className="tag-dot" style={{ background: t.color }} /> {t.name}
          </button>
        ))}
      </div>

      {/* Today checklist mini-card (when 'all' or 'daily') */}
      {dailyVisible ? <TodayPreviewCard store={store} navigate={navigate} /> : null}

      {/* Long-term grid */}
      {tab !== 'daily' ? (
        <>
          <div className="hr-section">
            <span className="label">Long-term goals</span>
          </div>
          <div style={{
            display:'grid',
            gridTemplateColumns: layout === 'grid' ? 'repeat(auto-fill, minmax(320px, 1fr))' : '1fr',
            gap: 14,
          }}>
            {filtered.map(g => (
              <LongGoalCard key={g.id} goal={g} store={store} navigate={navigate} />
            ))}
            {filtered.length === 0 ? (
              <div className="card" style={{ gridColumn:'1/-1', textAlign:'center', color:'rgb(var(--muted))', fontSize:13 }}>
                No goals match. Try clearing filters.
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function TodayPreviewCard({ store, navigate }) {
  const today = D.todayISO();
  const dailies = store.dailyGoals;
  const isDone = (g) => {
    const e = store.todayEntries[g.id];
    if (!e) return false;
    if (g.kind === 'check') return e.done === true;
    if (g.kind === 'count') return (e.count ?? 0) >= (g.target ?? 1);
    return false;
  };
  const doneCount = dailies.filter(isDone).length;
  const pct = dailies.length ? (doneCount / dailies.length) * 100 : 0;
  const next3 = dailies.filter(g => !isDone(g)).slice(0, 3);

  return (
    <div className="card card-interactive" onClick={() => navigate({ screen:'today' })}
      style={{ display:'grid', gridTemplateColumns:'auto 1fr auto', alignItems:'center', gap:18 }}>
      <RingProgress percent={pct} size={64}/>
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:11, color:'rgb(var(--muted))', textTransform:'uppercase', letterSpacing:'.08em', fontWeight:500 }}>
          <Icon.daily /> Today
        </div>
        <div style={{ fontSize:16, fontWeight:600, marginTop:4 }}>
          {doneCount} of {dailies.length} daily goals done
        </div>
        <div style={{ fontSize:12.5, color:'rgb(var(--muted))', marginTop:4 }}>
          {next3.length > 0 ? (
            <>Up next: {next3.map(g => g.name).join(' · ')}</>
          ) : 'All daily goals checked. Nice.'}
        </div>
      </div>
      <div style={{ color:'rgb(var(--muted))' }}><Icon.arrowRight /></div>
    </div>
  );
}

// =================================================================
// LongGoalCard — preview tile per type
// =================================================================
function LongGoalCard({ goal, store, navigate }) {
  const tags = (goal.tags || []).map(id => store.tagById(id)).filter(Boolean);
  const onClick = () => navigate({ screen:'detail-long', goalId: goal.id });

  let preview = null;
  let stat = null;
  let pct = 0;
  let pacing = null;

  if (goal.type === 'trend') {
    const s = D.trendStats(goal);
    pct = s.pct;
    stat = (
      <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
        <span style={{ fontSize:22, fontWeight:600, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.02em' }}>{s.last}{goal.unit}</span>
        <span style={{ fontSize:12, color:'rgb(var(--muted))' }}>→ {goal.targetValue}{goal.unit} by {D.fmtDate(goal.targetDate)}</span>
      </div>
    );
    pacing = (
      <span className="pill" style={{ color: s.onPace ? 'rgb(var(--success))' : 'rgb(var(--warn))', background: s.onPace ? 'rgb(var(--success) / .12)' : 'rgb(var(--warn) / .12)', boxShadow:'inset 0 0 0 1px currentColor' }}>
        {s.onPace ? '↑ ahead of pace' : '↓ behind pace'} · {Math.abs(s.aheadBy).toFixed(1)}{goal.unit}
      </span>
    );
    preview = <MiniTrend goal={goal} h={66} />;
  } else if (goal.type === 'accumulation') {
    const s = D.accumulationStats(goal);
    pct = s.pct;
    stat = (
      <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
        <span style={{ fontSize:22, fontWeight:600, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.02em' }}>
          {goal.unit === '$' ? `$${s.total.toLocaleString()}` : s.total.toLocaleString()}
        </span>
        <span style={{ fontSize:12, color:'rgb(var(--muted))' }}>
          / {goal.unit === '$' ? `$${goal.targetTotal.toLocaleString()}` : goal.targetTotal.toLocaleString()}{goal.unit !== '$' ? ` ${goal.unit}` : ''}
        </span>
      </div>
    );
    pacing = (
      <span className="pill" style={{ color: s.onPace ? 'rgb(var(--success))' : 'rgb(var(--warn))', background: s.onPace ? 'rgb(var(--success) / .12)' : 'rgb(var(--warn) / .12)', boxShadow:'inset 0 0 0 1px currentColor' }}>
        {s.onPace ? '↑ ahead' : '↓ behind'} · {s.daysLeft}d left
      </span>
    );
    preview = (
      <div style={{ marginTop:6 }}>
        <div className="progress-track" style={{ height:8 }}>
          <div className="progress-fill" style={{ width: `${pct}%`}}/>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:6, fontSize:11, color:'rgb(var(--muted))' }}>
          <span>{Math.round(pct)}%</span>
          <span>{s.remaining > 0 ? `${goal.unit==='$'?'$':''}${s.remaining.toLocaleString()}${goal.unit!=='$'?` ${goal.unit}`:''} to go` : 'Complete!'}</span>
        </div>
      </div>
    );
  } else if (goal.type === 'milestone') {
    const s = D.milestoneStats(goal);
    pct = s.pct;
    stat = (
      <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
        <span style={{ fontSize:22, fontWeight:600, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.02em' }}>{s.done}/{s.total}</span>
        <span style={{ fontSize:12, color:'rgb(var(--muted))' }}>milestones</span>
      </div>
    );
    pacing = s.next ? (
      <span className="pill">Next: {s.next.name} · <span style={{ color:'rgb(var(--accent))' }}>{D.fmtRelative(s.next.dueDate)}</span></span>
    ) : <span className="pill" style={{ color:'rgb(var(--success))' }}>Complete</span>;
    preview = (
      <div style={{ marginTop:6 }}>
        <div className="progress-track" style={{ height:8 }}>
          <div className="progress-fill success" style={{ width: `${pct}%`}}/>
        </div>
        <div style={{ display:'flex', gap:5, marginTop:8 }}>
          {(goal.milestones||[]).map(m => (
            <div key={m.id} title={m.name}
              style={{ flex:1, height:5, borderRadius:3, background: m.done ? 'rgb(var(--accent))' : 'rgb(var(--surface-2))', boxShadow: m.done ? 'none':'inset 0 0 0 1px rgb(var(--border))' }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <article className="card card-interactive" onClick={onClick}
      style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
        <GoalTypeBadge type={goal.type}/>
        <div style={{ display:'flex', gap:5, alignItems:'center' }}>
          {tags.slice(0,2).map(t => <TagChip key={t.id} tag={t}/>)}
        </div>
      </div>
      <h3 style={{ margin:'4px 0 0', fontSize:16, fontWeight:600, letterSpacing:'-0.01em' }}>{goal.name}</h3>
      {stat}
      {preview}
      <div style={{ marginTop:'auto', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, paddingTop:6 }}>
        {pacing}
        <button
          className="btn btn-secondary"
          style={{ padding:'5px 10px', fontSize:11.5 }}
          onClick={(e) => { e.stopPropagation(); navigate({ screen:'detail-long', goalId: goal.id, openLog: true }); }}
        >
          <Icon.plus /> Log
        </button>
      </div>
    </article>
  );
}

function MiniTrend({ goal, h = 60 }) {
  // mini SVG line
  const w = 280;
  const padL = 4, padR = 4, padT = 4, padB = 4;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const t0 = new Date(goal.startDate).getTime();
  const t1 = new Date(goal.targetDate).getTime();
  const sorted = [...goal.logs].sort((a,b)=>new Date(a.at)-new Date(b.at));
  const allV = [goal.startValue, goal.targetValue, ...sorted.map(l=>l.value)];
  const vMin = Math.min(...allV), vMax = Math.max(...allV);
  const pad = (vMax - vMin) * 0.15 || 1;
  const yMin = vMin - pad, yMax = vMax + pad;
  const xOf = (t) => padL + ((t-t0)/(t1-t0))*innerW;
  const yOf = (v) => padT + (1 - (v-yMin)/(yMax-yMin))*innerH;
  const pts = sorted.map(l => ({ x: xOf(new Date(l.at).getTime()), y: yOf(l.value) }));
  const linePath = pts.map((p,i)=>`${i===0?'M':'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = pts.length>1 ? `${linePath} L ${pts[pts.length-1].x.toFixed(1)} ${(padT+innerH).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(padT+innerH).toFixed(1)} Z` : '';
  const px1 = xOf(t0), py1 = yOf(goal.startValue);
  const px2 = xOf(t1), py2 = yOf(goal.targetValue);
  return (
    <div style={{ marginTop:6, width:'100%' }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ display:'block' }}>
        <defs>
          <linearGradient id={`mt-${goal.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.25"/>
            <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0"/>
          </linearGradient>
        </defs>
        <line x1={px1} y1={py1} x2={px2} y2={py2} stroke="rgb(var(--muted))" strokeWidth="1" strokeDasharray="3 3" opacity=".55"/>
        {pts.length>1 ? <path d={areaPath} fill={`url(#mt-${goal.id})`}/> : null}
        {pts.length>1 ? <path d={linePath} fill="none" stroke="rgb(var(--accent))" strokeWidth="1.7" strokeLinecap="round"/> : null}
        {pts.map((p,i) => <circle key={i} cx={p.x} cy={p.y} r="2" fill="rgb(var(--accent))"/>)}
      </svg>
    </div>
  );
}

window.GoalsScreens.IndexScreen = IndexScreen;
window.GoalsScreens.LongGoalCard = LongGoalCard;
