/* global React */
const { useState, useMemo } = React;
const { Icon, CheckSquare, Counter, RingProgress, TagChip, GoalTypeBadge, WeekStrip, Modal } = window.GoalsControls;
const { TrendChart, Donut, Sparkline, MiniBars } = window.GoalsCharts;
const { Sidebar, PageHeader } = window.GoalsScreens;
const D = window.GoalsData;

// =================================================================
// Long-term goal detail screen — dispatches by type
// =================================================================
function LongGoalDetail({ goalId, store, navigate, autoOpenLog, showPaceLine = true }) {
  const goal = store.longGoals.find(g => g.id === goalId);
  const [tab, setTab] = useState('overview');
  const [logModalOpen, setLogModalOpen] = useState(!!autoOpenLog);

  if (!goal) {
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <PageHeader crumb="Goals" onCrumb={() => navigate({ screen:'index' })} title="Goal not found"/>
      </div>
    );
  }

  const tags = (goal.tags||[]).map(id => store.tagById(id)).filter(Boolean);
  const related = (goal.relatedGoalIds||[]).map(id => store.goalById(id)).filter(Boolean);

  let stats, body, headerStat;
  if (goal.type === 'trend') {
    stats = D.trendStats(goal);
    headerStat = (
      <div>
        <div style={{ fontSize:32, fontWeight:600, letterSpacing:'-0.02em', fontVariantNumeric:'tabular-nums' }}>
          {stats.last}<span style={{ fontSize:18, color:'rgb(var(--muted))', fontWeight:500 }}>{goal.unit}</span>
        </div>
        <div style={{ fontSize:12, color:'rgb(var(--muted))', marginTop:2 }}>
          start {goal.startValue}{goal.unit} → target {goal.targetValue}{goal.unit} by {D.fmtFullDate(goal.targetDate)}
        </div>
      </div>
    );
    body = <TrendBody goal={goal} stats={stats} showPaceLine={showPaceLine}/>;
  } else if (goal.type === 'accumulation') {
    stats = D.accumulationStats(goal);
    headerStat = (
      <div>
        <div style={{ fontSize:32, fontWeight:600, letterSpacing:'-0.02em', fontVariantNumeric:'tabular-nums' }}>
          {goal.unit==='$' ? `$${stats.total.toLocaleString()}` : stats.total.toLocaleString()}
          <span style={{ fontSize:18, color:'rgb(var(--muted))', fontWeight:500 }}>
            {goal.unit==='$' ? '' : ` ${goal.unit}`}
          </span>
        </div>
        <div style={{ fontSize:12, color:'rgb(var(--muted))', marginTop:2 }}>
          of {goal.unit==='$' ? `$${goal.targetTotal.toLocaleString()}` : `${goal.targetTotal.toLocaleString()} ${goal.unit}`} by {D.fmtFullDate(goal.targetDate)}
        </div>
      </div>
    );
    body = <AccumulationBody goal={goal} stats={stats}/>;
  } else if (goal.type === 'milestone') {
    stats = D.milestoneStats(goal);
    headerStat = (
      <div>
        <div style={{ fontSize:32, fontWeight:600, letterSpacing:'-0.02em', fontVariantNumeric:'tabular-nums' }}>
          {stats.done}<span style={{ fontSize:18, color:'rgb(var(--muted))', fontWeight:500 }}>/{stats.total} milestones</span>
        </div>
        <div style={{ fontSize:12, color:'rgb(var(--muted))', marginTop:2 }}>
          target {D.fmtFullDate(goal.targetDate)} · {D.fmtRelative(goal.targetDate)}
        </div>
      </div>
    );
    body = <MilestoneBody goal={goal} store={store}/>;
  }

  return (
    <div className="fade-in" style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <PageHeader
        crumb="Goals"
        onCrumb={() => navigate({ screen:'index' })}
        eyebrow={
          <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
            <GoalTypeBadge type={goal.type} />
            {tags.map(t => <TagChip key={t.id} tag={t}/>)}
          </span>
        }
        title={goal.name}
        subtitle={goal.description}
        right={
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button className="btn btn-ghost"><Icon.edit /> Edit</button>
            <button className="btn btn-ghost"><Icon.archive /> Archive</button>
            <button className="btn btn-primary" onClick={() => setLogModalOpen(true)}>
              <Icon.plus /> Log progress
            </button>
          </div>
        }
      />

      <div className="card" style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:18 }}>
        {headerStat}
        <PaceBadge goal={goal} stats={stats}/>
      </div>

      <div className="segmented">
        {['overview','log','related','settings'].map(t => (
          <button key={t} data-active={tab===t} onClick={() => setTab(t)} style={{ textTransform:'capitalize' }}>{t}</button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div style={{ display:'grid', gridTemplateColumns: '1.6fr 1fr', gap:16 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {body}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {related.length > 0 ? (
              <div className="card" style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <h3 style={{ margin:0, fontSize:13, fontWeight:600 }}>Related goals</h3>
                  <span style={{ fontSize:11, color:'rgb(var(--muted))' }}>navigation only</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {related.map(r => (
                    <div key={r.id} className="related-row"
                      onClick={() => navigate(r.type ? { screen:'detail-long', goalId: r.id } : { screen:'detail-daily', goalId: r.id })}>
                      <div style={{ width:6, height:6, borderRadius:999, background:'rgb(var(--accent))', flexShrink:0 }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:500, color:'rgb(var(--fg))' }}>{r.name}</div>
                        <div style={{ fontSize:11, color:'rgb(var(--muted))', marginTop:2 }}>
                          {r.type ? <GoalTypeBadgeMini type={r.type}/> : <span style={{ textTransform:'capitalize' }}>{r.kind} · {r.schedule}</span>}
                        </div>
                      </div>
                      <Icon.arrowRight />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <RecentLogCard goal={goal}/>
          </div>
        </div>
      ) : tab === 'log' ? (
        <FullLog goal={goal} onLog={() => setLogModalOpen(true)}/>
      ) : tab === 'related' ? (
        <RelatedTab goal={goal} store={store} navigate={navigate}/>
      ) : (
        <SettingsTab goal={goal}/>
      )}

      <LogProgressModal open={logModalOpen} onClose={() => setLogModalOpen(false)}
        goal={goal} store={store}/>
    </div>
  );
}

function GoalTypeBadgeMini({ type }) {
  return <span style={{ textTransform:'capitalize' }}>{type}</span>;
}

function PaceBadge({ goal, stats }) {
  if (goal.type === 'trend') {
    const ahead = goal.direction === 'down' ? stats.last < stats.expected : stats.last > stats.expected;
    return (
      <div style={{ textAlign:'right' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 11px',
          borderRadius:999, fontSize:12, fontWeight:500,
          background: ahead ? 'rgb(var(--success) / .12)' : 'rgb(var(--warn) / .12)',
          color: ahead ? 'rgb(var(--success))' : 'rgb(var(--warn))',
          boxShadow:'inset 0 0 0 1px currentColor'
        }}>
          {ahead ? '↑ ahead of pace' : '↓ behind pace'} · {Math.abs(stats.aheadBy).toFixed(1)}{goal.unit}
        </div>
        <div style={{ fontSize:11, color:'rgb(var(--muted))', marginTop:6 }}>
          day {stats.daysIn} of {stats.days} · {Math.round(stats.pct)}% complete
        </div>
      </div>
    );
  }
  if (goal.type === 'accumulation') {
    return (
      <div style={{ textAlign:'right' }}>
        <RingProgress percent={stats.pct} size={72}/>
        <div style={{ fontSize:11, color:'rgb(var(--muted))', marginTop:6 }}>
          {stats.daysLeft}d left · {stats.pacePerDay.toFixed(1)}{goal.unit==='$'?'$':` ${goal.unit}`}/day pace
        </div>
      </div>
    );
  }
  if (goal.type === 'milestone') {
    return (
      <div style={{ textAlign:'right' }}>
        <RingProgress percent={stats.pct} size={72}/>
        <div style={{ fontSize:11, color:'rgb(var(--muted))', marginTop:6 }}>
          {stats.next ? `next: ${D.fmtRelative(stats.next.dueDate)}` : 'all done'}
        </div>
      </div>
    );
  }
  return null;
}

// =================================================================
// Trend body
// =================================================================
function TrendBody({ goal, stats, showPaceLine }) {
  return (
    <>
      <div className="card" style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
          <h3 style={{ margin:0, fontSize:13, fontWeight:600 }}>Progress</h3>
          <div style={{ display:'flex', gap:14, fontSize:11, color:'rgb(var(--muted))', alignItems:'center' }}>
            <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
              <span style={{ width:14, height:2, background:'rgb(var(--accent))', display:'inline-block' }}/> actual
            </span>
            <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
              <span style={{ width:14, borderTop:'1.5px dashed rgb(var(--muted))', display:'inline-block' }}/> pace
            </span>
            <span>· hover dots for notes</span>
          </div>
        </div>
        <TrendChart goal={goal} height={280} showPaceLine={showPaceLine}/>
      </div>

      <div className="card">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
          <Stat label="Latest" value={`${stats.last}${goal.unit}`} accent/>
          <Stat label="Change" value={`${stats.progressDelta >= 0 ? '+' : ''}${stats.progressDelta.toFixed(1)}${goal.unit}`}/>
          <Stat label="Logs" value={String(goal.logs.length)}/>
          <Stat label="Days in" value={`${stats.daysIn}/${stats.days}`}/>
        </div>
      </div>
    </>
  );
}

// =================================================================
// Accumulation body
// =================================================================
function AccumulationBody({ goal, stats }) {
  // weekly contributions for sparkline
  const weeks = 12;
  const buckets = Array(weeks).fill(0);
  const now = Date.now();
  goal.logs.forEach(l => {
    const dAgo = Math.floor((now - new Date(l.at).getTime()) / 86400000 / 7);
    const idx = weeks - 1 - dAgo;
    if (idx >= 0 && idx < weeks) buckets[idx] += l.value;
  });

  return (
    <>
      <div className="card" style={{ display:'grid', gridTemplateColumns: 'auto 1fr', gap:24, alignItems:'center' }}>
        <Donut percent={stats.pct} size={180} stroke={16}
          label={`${Math.round(stats.pct)}%`}
          sublabel={`${stats.remaining > 0 ? `${goal.unit==='$'?'$':''}${stats.remaining.toLocaleString()}${goal.unit!=='$'?` ${goal.unit}`:''} to go` : 'Complete'}`}
        />
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <div className="label" style={{ marginBottom:6 }}>Weekly contributions (last 12w)</div>
            <MiniBars values={buckets} w={320} h={56}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
            <Stat label="To go" value={`${goal.unit==='$'?'$':''}${stats.remaining.toLocaleString()}${goal.unit!=='$'?` ${goal.unit}`:''}`} accent/>
            <Stat label="Days left" value={String(stats.daysLeft)}/>
            <Stat label="Pace" value={`${stats.pacePerDay.toFixed(1)}/day`}/>
          </div>
        </div>
      </div>
    </>
  );
}

// =================================================================
// Milestone body
// =================================================================
function MilestoneBody({ goal, store }) {
  return (
    <div className="card" style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
        <h3 style={{ margin:0, fontSize:13, fontWeight:600 }}>Milestones</h3>
        <span style={{ fontSize:11, color:'rgb(var(--muted))' }}>tap to toggle · drag to reorder</span>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {(goal.milestones||[]).map((m, i) => (
          <div key={m.id} className={`milestone-row ${m.done ? 'done' : ''}`}>
            <span className="milestone-num">{m.done ? <Icon.check/> : (i+1)}</span>
            <CheckSquare on={m.done} onClick={() => store.toggleMilestone(goal.id, m.id)} label={`Toggle ${m.name}`}/>
            <div style={{ minWidth:0 }}>
              <div className="ms-name" style={{ fontSize:13.5, fontWeight:500 }}>{m.name}</div>
              <div style={{ fontSize:11, color:'rgb(var(--muted))', marginTop:2 }}>
                {m.dueDate ? `Due ${D.fmtFullDate(m.dueDate)} · ${D.fmtRelative(m.dueDate)}` : 'No due date'}
                {m.done && m.doneAt ? ` · completed ${D.fmtRelative(m.doneAt)}` : ''}
              </div>
            </div>
            <button className="icon-btn" aria-label="More"><Icon.more/></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// =================================================================
// Recent log card
// =================================================================
function RecentLogCard({ goal }) {
  const recent = [...(goal.logs||[])].sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,5);
  return (
    <div className="card" style={{ display:'flex', flexDirection:'column', gap:8 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
        <h3 style={{ margin:0, fontSize:13, fontWeight:600 }}>Recent log</h3>
        <span style={{ fontSize:11, color:'rgb(var(--muted))' }}>{(goal.logs||[]).length} entries</span>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {recent.map(l => (
          <div key={l.id} style={{ display:'grid', gridTemplateColumns:'auto 1fr auto', gap:10, alignItems:'flex-start', padding:'6px 8px', borderRadius:8, background:'rgb(var(--surface-2) / .5)' }}>
            <span style={{ fontSize:11, color:'rgb(var(--muted))', textTransform:'uppercase', letterSpacing:'.05em', fontVariantNumeric:'tabular-nums' }}>
              {D.fmtDate(l.at)}
            </span>
            <div style={{ minWidth:0 }}>
              {l.value != null ? (
                <span style={{ fontSize:13, fontWeight:500, fontVariantNumeric:'tabular-nums' }}>
                  {l.value}{goal.unit && goal.unit!=='$' ? ` ${goal.unit}` : (goal.unit==='$' ? '' : '')}
                </span>
              ) : (
                <span style={{ fontSize:13, fontWeight:500, color:'rgb(var(--accent))' }}>note</span>
              )}
              {l.note ? <div style={{ fontSize:12, color:'rgb(var(--muted))', marginTop:2 }}>{l.note}</div> : null}
            </div>
          </div>
        ))}
        {recent.length === 0 ? <div style={{ fontSize:12, color:'rgb(var(--muted))' }}>No entries yet.</div> : null}
      </div>
    </div>
  );
}

function FullLog({ goal, onLog }) {
  const sorted = [...(goal.logs||[])].sort((a,b)=>new Date(b.at)-new Date(a.at));
  return (
    <div className="card" style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
        <h3 style={{ margin:0, fontSize:13, fontWeight:600 }}>Log history · {sorted.length} entries</h3>
        <button className="btn btn-secondary" onClick={onLog}><Icon.plus/> New entry</button>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        {sorted.map(l => (
          <div key={l.id} style={{ display:'grid', gridTemplateColumns:'140px 90px 1fr auto', gap:12, alignItems:'flex-start', padding:'8px 10px', borderRadius:8, background:'rgb(var(--surface-2) / .35)' }}>
            <span style={{ fontSize:12, color:'rgb(var(--muted))', fontVariantNumeric:'tabular-nums' }}>
              {D.fmtDate(l.at, { month:'short', day:'numeric', year:'numeric' })}
              <span style={{ marginLeft:6, opacity:.7 }}>{D.fmtTimeAgo(l.at)}</span>
            </span>
            <span style={{ fontSize:13, fontWeight:500, fontVariantNumeric:'tabular-nums' }}>
              {l.value != null ? `${l.value}${goal.unit&&goal.unit!=='$'?` ${goal.unit}`:''}` : '—'}
            </span>
            <span style={{ fontSize:12.5, color:'rgb(var(--muted))', whiteSpace:'pre-wrap' }}>{l.note || ''}</span>
            <button className="icon-btn"><Icon.more/></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RelatedTab({ goal, store, navigate }) {
  const related = (goal.relatedGoalIds||[]).map(id => store.goalById(id)).filter(Boolean);
  return (
    <div className="card" style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <p style={{ margin:0, fontSize:13, color:'rgb(var(--muted))' }}>
        Shortcuts to other goals — for navigation and context only. No data is shared.
      </p>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {related.map(r => (
          <div key={r.id} className="related-row"
            onClick={() => navigate(r.type ? { screen:'detail-long', goalId: r.id } : { screen:'detail-daily', goalId: r.id })}>
            <span style={{ width:6, height:6, borderRadius:999, background:'rgb(var(--accent))', flexShrink:0 }}/>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:500 }}>{r.name}</div>
              <div style={{ fontSize:11, color:'rgb(var(--muted))', marginTop:2 }}>{r.type || `${r.kind} · ${r.schedule}`}</div>
            </div>
            <Icon.arrowRight/>
          </div>
        ))}
        <button className="btn btn-secondary" style={{ alignSelf:'flex-start' }}><Icon.plus/> Link another goal</button>
      </div>
    </div>
  );
}

function SettingsTab({ goal }) {
  return (
    <div className="card">
      <p style={{ margin:0, color:'rgb(var(--muted))', fontSize:13 }}>Goal settings (rename, change target, archive)…</p>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="stat-block">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${accent ? 'accent' : ''}`}>{value}</div>
    </div>
  );
}

// =================================================================
// Log Progress Modal
// =================================================================
function LogProgressModal({ open, onClose, goal, store }) {
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(D.todayISO());

  if (!open || !goal) return null;
  const isMilestone = goal.type === 'milestone';

  const submit = () => {
    const log = { note: note.trim() || undefined };
    if (!isMilestone) {
      const num = parseFloat(value);
      if (Number.isNaN(num)) return;
      log.value = num;
    }
    log.at = new Date(date + 'T' + new Date().toTimeString().slice(0,5)).toISOString();
    store.addLog(goal.id, log);
    setValue(''); setNote('');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={`Log progress · ${goal.name}`}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit}>Save entry</button>
        </>
      }
    >
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        {!isMilestone ? (
          <div>
            <label className="label" htmlFor="lp-value">
              {goal.type === 'trend' ? `Current value (${goal.unit||''})` : `Amount to add (${goal.unit||''})`}
            </label>
            <input id="lp-value" className="input" type="number" step="any" autoFocus
              value={value} onChange={(e)=>setValue(e.target.value)}
              placeholder={goal.type === 'trend' ? `e.g. ${goal.startValue}` : `e.g. 1`}
              style={{ marginTop:6, fontSize: 18, padding:'12px 14px', fontVariantNumeric:'tabular-nums' }}/>
            {goal.type === 'trend' ? (
              <div style={{ fontSize:11, color:'rgb(var(--muted))', marginTop:6 }}>
                Latest: {D.trendStats(goal).last}{goal.unit} · target {goal.targetValue}{goal.unit}
              </div>
            ) : (
              <div style={{ fontSize:11, color:'rgb(var(--muted))', marginTop:6 }}>
                Total so far: {D.accumulationStats(goal).total} {goal.unit}
              </div>
            )}
          </div>
        ) : null}

        <div>
          <label className="label" htmlFor="lp-date">Date</label>
          <input id="lp-date" className="input" type="date" value={date} onChange={(e)=>setDate(e.target.value)} style={{ marginTop:6 }}/>
        </div>

        <div>
          <label className="label" htmlFor="lp-note">Note (optional)</label>
          <textarea id="lp-note" className="textarea" rows={3}
            value={note} onChange={(e)=>setNote(e.target.value)}
            placeholder={goal.type==='trend' ? 'How are you feeling? What changed?' : 'Add context for this entry…'}
            style={{ marginTop:6, resize:'vertical', minHeight: 70 }}/>
          {goal.type === 'trend' ? (
            <div style={{ fontSize:11, color:'rgb(var(--muted))', marginTop:6, display:'flex', alignItems:'center', gap:5 }}>
              <Icon.note/> Notes show up as dots on the chart — hover to read them later.
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

// =================================================================
// Daily goal detail (lightweight)
// =================================================================
function DailyGoalDetail({ goalId, store, navigate }) {
  const goal = store.dailyGoals.find(g => g.id === goalId);
  if (!goal) return <div>Not found</div>;
  const tag0 = goal.tags?.[0] ? store.tagById(goal.tags[0]) : null;
  const linked = goal.linkedTo ? store.goalById(goal.linkedTo) : null;
  const week = store.weekHist[goal.id] || [];
  const streak = store.streaks[goal.id] || 0;

  return (
    <div className="fade-in" style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <PageHeader
        crumb="Goals"
        onCrumb={() => navigate({ screen:'index' })}
        eyebrow={
          <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
            <GoalTypeBadge type={goal.schedule === 'weekly' ? 'weekly' : 'daily'}/>
            {tag0 ? <TagChip tag={tag0}/> : null}
          </span>
        }
        title={goal.name}
        subtitle={`${goal.kind === 'count' ? `Count · target ${goal.target} ${goal.unit||''}` : 'Check'} · ${goal.schedule}${goal.timeOfDay && goal.timeOfDay !== 'anytime' ? ` · ${goal.timeOfDay}` : ''}`}
        right={
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ display:'inline-flex', alignItems:'center', gap:4, color:'rgb(var(--accent))', fontWeight:500, fontSize:13 }}>
              <Icon.flame/> {streak} day streak
            </span>
            <button className="btn btn-ghost"><Icon.edit/> Edit</button>
            <button className="btn btn-primary"><Icon.check/> Mark done</button>
          </div>
        }
      />

      <div className="card" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:18 }}>
        <div>
          <div className="label">Last 7 days</div>
          <div style={{ marginTop:8 }}><WeekStrip data={week} todayIdx={6} size={18}/></div>
        </div>
        {linked ? (
          <div className="related-row" style={{ minWidth: 240 }}
            onClick={() => navigate({ screen:'detail-long', goalId: linked.id })}>
            <Icon.link/>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:11, color:'rgb(var(--muted))' }}>Logs to long-term goal</div>
              <div style={{ fontSize:13, fontWeight:500 }}>{linked.name}</div>
            </div>
            <Icon.arrowRight/>
          </div>
        ) : null}
      </div>

      {goal.notes ? (
        <div className="card">
          <div className="label" style={{ marginBottom: 6 }}>Notes</div>
          <p style={{ margin:0, fontSize:13, color:'rgb(var(--muted))' }}>{goal.notes}</p>
        </div>
      ) : null}
    </div>
  );
}

window.GoalsScreens.LongGoalDetail = LongGoalDetail;
window.GoalsScreens.DailyGoalDetail = DailyGoalDetail;
window.GoalsScreens.LogProgressModal = LogProgressModal;
