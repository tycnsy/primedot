/* global React */
const { useState, useMemo, useEffect, useRef } = React;
const { Icon, CheckSquare, Counter, RingProgress, TagChip, GoalTypeBadge, WeekStrip, Modal } = window.GoalsControls;
const { TrendChart, Donut, Sparkline, MiniBars } = window.GoalsCharts;
const D = window.GoalsData;

// =================================================================
// Sidebar
// =================================================================
function Sidebar({ route, navigate }) {
  return (
    <aside style={{
      width: 220,
      borderRight: '1px solid rgb(var(--border) / .7)',
      background: 'rgb(var(--bg) / .85)',
      backdropFilter: 'blur(20px)',
      display: 'flex',
      flexDirection: 'column',
      padding: '14px 10px',
      flexShrink: 0,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px 14px', fontWeight:600, fontSize:15, letterSpacing:'-0.01em' }}>
        <span>prime</span>
        <span style={{ width:6, height:6, borderRadius:999, background:'rgb(var(--accent))' }} />
      </div>
      <nav style={{ display:'flex', flexDirection:'column', gap:1 }}>
        {[
          { id: 'projects', label: 'Projects' },
          { id: 'templates', label: 'Templates' },
          { id: 'timer', label: 'Timer' },
          { id: 'habits', label: 'Habits' },
          { id: 'goals', label: 'Goals', active: true },
        ].map(item => (
          <button key={item.id} className="sidebar-link"
            data-active={item.id === 'goals' && (route.screen === 'index' || route.screen === 'detail' || route.screen === 'today')}
            onClick={() => { if (item.id === 'goals') navigate({ screen:'index' }); }}>
            <span style={{ width:16, display:'inline-flex', justifyContent:'center', color:item.id==='goals'?'rgb(var(--accent))':'currentColor' }}>
              {item.id === 'goals' ? <Icon.goal /> :
               item.id === 'habits' ? <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M2 11l3-3 2.5 2.5L12 5"/></svg> :
               item.id === 'projects' ? <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg> :
               item.id === 'timer' ? <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="8" cy="9" r="5"/><path d="M8 9V6"/><path d="M6 2h4"/></svg> :
               <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2" y="2" width="12" height="3"/><rect x="2" y="6" width="12" height="8"/><path d="M5 9h6M5 11h4"/></svg>
              }
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Goals subnav when on Goals */}
      <div style={{ marginTop: 16, padding: '0 10px' }}>
        <div className="label" style={{ marginBottom: 6 }}>Goals</div>
        <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
          <button className="sidebar-link"
            data-active={route.screen === 'today'}
            onClick={() => navigate({ screen:'today' })}
            style={{ paddingLeft: 14 }}>
            Today
          </button>
          <button className="sidebar-link"
            data-active={route.screen === 'index'}
            onClick={() => navigate({ screen:'index' })}
            style={{ paddingLeft: 14 }}>
            All goals
          </button>
        </div>
      </div>

      <div style={{ marginTop:'auto', padding:'10px', display:'flex', flexDirection:'column', gap:8 }}>
        <div className="pill" style={{ alignSelf:'flex-start' }}>v1 preview</div>
      </div>
    </aside>
  );
}

// =================================================================
// Page header
// =================================================================
function PageHeader({ crumb, onCrumb, eyebrow, title, subtitle, right }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:16, marginBottom: 18 }}>
      <div style={{ minWidth:0 }}>
        {crumb ? (
          <button className="crumb" onClick={onCrumb} style={{ marginBottom: 6 }}>
            <Icon.arrowLeft /> {crumb}
          </button>
        ) : null}
        {eyebrow ? <p className="label" style={{ margin:'0 0 6px' }}>{eyebrow}</p> : null}
        <h1 style={{ margin:0, fontSize: 28, fontWeight: 600, letterSpacing:'-0.02em' }}>{title}</h1>
        {subtitle ? <p style={{ margin:'6px 0 0', fontSize: 13.5, color:'rgb(var(--muted))' }}>{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

// =================================================================
// Today screen — daily/weekly checklist
// =================================================================
function TodayScreen({ store, navigate, density }) {
  const today = D.todayISO();
  const todayDate = new Date();
  const greeting = (() => {
    const h = todayDate.getHours();
    if (h < 12) return 'morning';
    if (h < 18) return 'afternoon';
    return 'evening';
  })();

  const isDone = (g) => {
    const e = store.todayEntries[g.id];
    if (!e) return false;
    if (g.kind === 'check') return e.done === true;
    if (g.kind === 'count') return (e.count ?? 0) >= (g.target ?? 1);
    return false;
  };

  const sections = [
    { key: 'morning', label: 'Morning', range: '06–11' },
    { key: 'anytime', label: 'During the day', range: '' },
    { key: 'evening', label: 'Evening', range: '20–23' },
  ];

  const goalsBy = (slot) => store.dailyGoals.filter(g => (g.timeOfDay || 'anytime') === slot);
  const visible = store.dailyGoals;
  const doneCount = visible.filter(isDone).length;
  const total = visible.length;
  const pct = total ? (doneCount/total)*100 : 0;

  return (
    <div className="fade-in" style={{ display:'flex', flexDirection:'column', gap:22 }}>
      <PageHeader
        crumb="Goals"
        onCrumb={() => navigate({ screen:'index' })}
        eyebrow={D.fmtWeekdayDate(today).toUpperCase()}
        title={`Good ${greeting}.`}
        subtitle={`${doneCount} of ${total} daily goals checked off · keep going`}
        right={<RingProgress percent={pct} size={64}/>}
      />

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
        <div className="segmented">
          <button data-active="true">Today</button>
          <button>Week</button>
          <button>Month</button>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, fontSize:11.5, color:'rgb(var(--muted))' }}>
          <span><span className="kbd">N</span> new</span>
          <span><span className="kbd">␣</span> toggle</span>
          <span><span className="kbd">/</span> search</span>
        </div>
      </div>

      {sections.map(sec => {
        const list = goalsBy(sec.key);
        if (list.length === 0) return null;
        return (
          <section key={sec.key} className="card" style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between' }}>
              <h2 style={{ margin:0, fontSize:14.5, fontWeight:600 }}>
                {sec.label}
                {sec.range ? <span style={{ marginLeft: 8, fontSize:11, color:'rgb(var(--muted))', fontWeight:400 }}>{sec.range}</span> : null}
              </h2>
              <span style={{ fontSize:11, color:'rgb(var(--muted))' }}>{list.filter(isDone).length}/{list.length}</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
              {list.map(g => (
                <DailyGoalRow key={g.id} goal={g} store={store} navigate={navigate} done={isDone(g)} />
              ))}
            </div>
          </section>
        );
      })}

      <div style={{ display:'flex', justifyContent:'center', marginTop: 4 }}>
        <button className="btn btn-primary" onClick={() => navigate({ screen:'index', openNew:true })}>
          <Icon.plus /> Quick-add goal <span className="kbd" style={{ marginLeft:4 }}>N</span>
        </button>
      </div>
    </div>
  );
}

function DailyGoalRow({ goal, store, navigate, done }) {
  const entry = store.todayEntries[goal.id] || {};
  const linked = goal.linkedTo ? store.goalById(goal.linkedTo) : null;
  const tag0 = goal.tags?.[0] ? store.tagById(goal.tags[0]) : null;
  const streak = store.streaks[goal.id] || 0;

  return (
    <div className={`goal-row ${done ? 'done' : ''}`} onClick={() => navigate({ screen:'detail-daily', goalId: goal.id })}>
      <CheckSquare on={done}
        onClick={() => {
          if (goal.kind === 'check') store.toggleDailyCheck(goal.id);
          else if (goal.kind === 'count') store.setDailyCount(goal.id, (entry.count||0) + 1);
        }}
        label={`Mark ${goal.name}`}
      />
      <div style={{ minWidth:0 }}>
        <div className="goal-name" style={{ fontSize: 13.5, fontWeight: 500, color:'rgb(var(--fg))', display:'flex', alignItems:'center', gap:8 }}>
          {goal.name}
          {linked ? (
            <span title={`Logs to: ${linked.name}`} style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:11, color:'rgb(var(--muted))', fontWeight:400 }}>
              <Icon.link /> {linked.name}
            </span>
          ) : null}
        </div>
        <div style={{ fontSize:11, color:'rgb(var(--muted))', marginTop:2, display:'flex', gap:8, alignItems:'center' }}>
          <span style={{ textTransform:'capitalize' }}>{goal.schedule}</span>
          {goal.kind === 'count' ? <span>· {goal.target} {goal.unit}</span> : null}
          {tag0 ? <><span>·</span><span style={{ display:'inline-flex', alignItems:'center', gap:4 }}><span className="tag-dot" style={{ background: tag0.color }} />{tag0.name}</span></> : null}
        </div>
      </div>
      <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11.5, color: streak > 0 ? 'rgb(var(--accent))' : 'rgb(var(--muted))' }}>
        <Icon.flame /> {streak}
      </span>
      <div style={{ justifySelf:'end' }}>
        {goal.kind === 'check' ? null :
         goal.kind === 'count' ? (
          <Counter
            value={entry.count || 0}
            target={goal.target}
            unit={goal.unit}
            onChange={(n) => store.setDailyCount(goal.id, n)}
          />
        ) : null}
      </div>
    </div>
  );
}

window.GoalsScreens = window.GoalsScreens || {};
window.GoalsScreens.Sidebar = Sidebar;
window.GoalsScreens.PageHeader = PageHeader;
window.GoalsScreens.TodayScreen = TodayScreen;
