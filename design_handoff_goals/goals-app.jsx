/* global React, ReactDOM */
const { useState, useEffect, useMemo, useCallback } = React;
const D = window.GoalsData;
const { Icon, Modal, TagChip, GoalTypeBadge } = window.GoalsControls;
const { Sidebar, PageHeader, TodayScreen, IndexScreen, LongGoalDetail, DailyGoalDetail } = window.GoalsScreens;
const { TweaksPanel, useTweaks, TweakSection, TweakRadio, TweakSelect, TweakColor, TweakToggle, TweakSlider } = window;

// Store: delegate to the canonical hook in goals-data.jsx
const useStore = () => window.GoalsData.useGoalsStore();

// =================================================================
// New Goal Modal
// =================================================================
function NewGoalModal({ open, onClose, store, navigate }) {
  const [step, setStep] = useState(1);
  const [type, setType] = useState('trend');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState('');
  const [startValue, setStartValue] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [targetTotal, setTargetTotal] = useState('');
  const [targetDate, setTargetDate] = useState(new Date(Date.now()+90*86400000).toISOString().slice(0,10));
  const [milestones, setMilestones] = useState([{ id:'m1', name:'', dueDate:'' }]);
  const [tagIds, setTagIds] = useState([]);

  useEffect(() => {
    if (!open) {
      setStep(1); setType('trend'); setName(''); setDescription(''); setUnit('');
      setStartValue(''); setTargetValue(''); setTargetTotal('');
      setMilestones([{ id:'m1', name:'', dueDate:'' }]); setTagIds([]);
    }
  }, [open]);

  if (!open) return null;

  const typeOptions = [
    { id:'trend', label:'Trend', sub:'A measurement that should move toward a target. Latest value matters.', ex:'Lose 5 kg · Run 5K under 22:00' },
    { id:'accumulation', label:'Accumulation', sub:'A total that grows over time toward a target.', ex:'Save $2,000 · Read 12 books' },
    { id:'milestone', label:'Milestone', sub:'A sequence of discrete steps to complete.', ex:'Ship beta · Plan trip' },
  ];

  const canCreate = name.trim().length > 0 && (
    type === 'trend' ? (startValue !== '' && targetValue !== '') :
    type === 'accumulation' ? (targetTotal !== '') :
    milestones.filter(m => m.name.trim()).length > 0
  );

  const create = () => {
    const base = { type, name: name.trim(), description: description.trim(), unit, targetDate, tags: tagIds };
    if (type === 'trend') {
      base.startValue = parseFloat(startValue);
      base.targetValue = parseFloat(targetValue);
    } else if (type === 'accumulation') {
      base.targetTotal = parseFloat(targetTotal);
    } else if (type === 'milestone') {
      base.milestones = milestones.filter(m => m.name.trim()).map((m,i) => ({
        id: 'ms_'+Math.random().toString(36).slice(2,7),
        name: m.name.trim(),
        dueDate: m.dueDate || null,
        done: false,
        doneAt: null,
      }));
    }
    const id = store.addLongGoal(base);
    onClose();
    navigate({ screen:'detail-long', goalId: id });
  };

  return (
    <Modal open={open} onClose={onClose}
      title={
        <span style={{ display:'inline-flex', alignItems:'center', gap:10 }}>
          New goal
          <span className="pill">{step === 1 ? 'Step 1 of 2 · type' : 'Step 2 of 2 · details'}</span>
        </span>
      }
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          {step === 2 ? <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button> : null}
          {step === 1 ? (
            <button className="btn btn-primary" onClick={() => setStep(2)}>Continue</button>
          ) : (
            <button className="btn btn-primary" onClick={create} disabled={!canCreate}>Create goal</button>
          )}
        </>
      }
    >
      {step === 1 ? (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <p style={{ margin:'0 0 4px', fontSize:13, color:'rgb(var(--muted))' }}>
            What kind of goal is this? Pick the shape that fits — you can always edit later.
          </p>
          {typeOptions.map(opt => (
            <button key={opt.id} className="type-card" data-active={type === opt.id}
              onClick={() => setType(opt.id)}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <GoalTypeBadge type={opt.id}/>
                  <strong style={{ fontSize:14 }}>{opt.label}</strong>
                </div>
                <span style={{ width:18, height:18, borderRadius:999, border:'1.5px solid rgb(var(--border))', background: type===opt.id ? 'rgb(var(--accent))' : 'transparent', boxShadow: type===opt.id ? 'inset 0 0 0 3px rgb(var(--surface))' : 'none' }}/>
              </div>
              <div style={{ fontSize:12.5, color:'rgb(var(--muted))', marginTop:6 }}>{opt.sub}</div>
              <div style={{ fontSize:11, color:'rgb(var(--muted))', marginTop:4, fontStyle:'italic' }}>e.g. {opt.ex}</div>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label className="label" htmlFor="ng-name">Goal name</label>
            <input id="ng-name" className="input" autoFocus
              value={name} onChange={(e)=>setName(e.target.value)}
              placeholder={type === 'trend' ? 'e.g. Lose 5 kg' : type === 'accumulation' ? 'e.g. Save $2,000' : 'e.g. Ship product beta'}
              style={{ marginTop:6, fontSize:16 }}/>
          </div>
          <div>
            <label className="label" htmlFor="ng-desc">Description (optional)</label>
            <textarea id="ng-desc" className="textarea" rows={2}
              value={description} onChange={(e)=>setDescription(e.target.value)}
              placeholder="Why does this matter?"
              style={{ marginTop:6, resize:'vertical' }}/>
          </div>

          {type === 'trend' ? (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
              <div>
                <label className="label">Start value</label>
                <input className="input" type="number" step="any" value={startValue} onChange={e=>setStartValue(e.target.value)} style={{ marginTop:6 }}/>
              </div>
              <div>
                <label className="label">Target value</label>
                <input className="input" type="number" step="any" value={targetValue} onChange={e=>setTargetValue(e.target.value)} style={{ marginTop:6 }}/>
              </div>
              <div>
                <label className="label">Unit</label>
                <input className="input" value={unit} onChange={e=>setUnit(e.target.value)} placeholder="kg, $, %, …" style={{ marginTop:6 }}/>
              </div>
            </div>
          ) : type === 'accumulation' ? (
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:10 }}>
              <div>
                <label className="label">Target total</label>
                <input className="input" type="number" step="any" value={targetTotal} onChange={e=>setTargetTotal(e.target.value)} style={{ marginTop:6 }}/>
              </div>
              <div>
                <label className="label">Unit</label>
                <input className="input" value={unit} onChange={e=>setUnit(e.target.value)} placeholder="$, books, km, …" style={{ marginTop:6 }}/>
              </div>
            </div>
          ) : (
            <div>
              <div className="label" style={{ marginBottom: 6 }}>Milestones (in order)</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {milestones.map((m, i) => (
                  <div key={m.id} style={{ display:'grid', gridTemplateColumns:'24px 1fr 150px auto', gap:8, alignItems:'center' }}>
                    <span style={{ fontSize:11, color:'rgb(var(--muted))', textAlign:'center' }}>{i+1}.</span>
                    <input className="input" value={m.name} placeholder={`Milestone ${i+1}`}
                      onChange={e => setMilestones(ms => ms.map(x => x.id===m.id ? {...x, name:e.target.value} : x))}/>
                    <input className="input" type="date" value={m.dueDate}
                      onChange={e => setMilestones(ms => ms.map(x => x.id===m.id ? {...x, dueDate:e.target.value} : x))}/>
                    <button className="icon-btn" onClick={() => setMilestones(ms => ms.filter(x => x.id !== m.id))}>×</button>
                  </div>
                ))}
                <button className="btn btn-ghost" style={{ alignSelf:'flex-start' }}
                  onClick={() => setMilestones(ms => [...ms, { id:'m'+Math.random().toString(36).slice(2,5), name:'', dueDate:'' }])}>
                  <Icon.plus/> Add milestone
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="label" htmlFor="ng-target-date">Target date</label>
            <input id="ng-target-date" className="input" type="date" value={targetDate} onChange={e=>setTargetDate(e.target.value)} style={{ marginTop:6 }}/>
          </div>

          <div>
            <label className="label">Tags</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:6 }}>
              {store.tags.map(t => (
                <button key={t.id} className="chip-filter" data-active={tagIds.includes(t.id)}
                  onClick={() => setTagIds(ids => ids.includes(t.id) ? ids.filter(i => i!==t.id) : [...ids, t.id])}>
                  <span className="tag-dot" style={{ background:t.color }}/> {t.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// =================================================================
// Tweaks
// =================================================================
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "accent": "#5B7CFA",
  "density": "comfortable",
  "showPaceLine": true,
  "indexLayout": "grid"
}/*EDITMODE-END*/;

function applyTweaks(t) {
  const root = document.documentElement;
  root.dataset.theme = t.theme;
  root.dataset.density = t.density;
  // accent
  const hex = t.accent || '#5B7CFA';
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (m) {
    const r = parseInt(m[1],16), g = parseInt(m[2],16), b = parseInt(m[3],16);
    root.style.setProperty('--accent', `${r} ${g} ${b}`);
  }
}

// =================================================================
// App
// =================================================================
function App() {
  const store = useStore();
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = useState({ screen: 'index' });
  const [newGoalOpen, setNewGoalOpen] = useState(false);

  useEffect(() => { applyTweaks(tweaks); }, [tweaks]);

  // intercept route messages that ask to open new-goal
  const navigate = useCallback((r) => {
    if (r.openNew) { setNewGoalOpen(true); setRoute({ screen: r.screen || 'index' }); return; }
    setRoute(r);
  }, []);

  // keyboard shortcut N for new goal
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setNewGoalOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  let body;
  if (route.screen === 'today') body = <TodayScreen store={store} navigate={navigate} density={tweaks.density}/>;
  else if (route.screen === 'detail-long') body = <LongGoalDetail goalId={route.goalId} store={store} navigate={navigate} autoOpenLog={route.openLog} showPaceLine={tweaks.showPaceLine}/>;
  else if (route.screen === 'detail-daily') body = <DailyGoalDetail goalId={route.goalId} store={store} navigate={navigate}/>;
  else body = <IndexScreen store={store} navigate={navigate} layout={tweaks.indexLayout}/>;

  return (
    <div className="app">
      <Sidebar route={route} navigate={navigate}/>
      <main className="main-pane">
        <div className="main-inner">
          {body}
        </div>
      </main>

      <NewGoalModal open={newGoalOpen} onClose={() => setNewGoalOpen(false)}
        store={store} navigate={navigate}/>

      <TweaksPanel title="Tweaks">
        <TweakSection title="Appearance">
          <TweakRadio label="Theme" value={tweaks.theme}
            onChange={(v) => setTweak('theme', v)}
            options={[{ value:'light', label:'Light' }, { value:'dark', label:'Dark' }]}/>
          <TweakColor label="Accent" value={tweaks.accent}
            onChange={(v) => setTweak('accent', v)}
            options={['#5B7CFA','#0A5BFF','#7B5EE6','#21A06A','#E45D2E','#1F1F1F']}/>
          <TweakRadio label="Density" value={tweaks.density}
            onChange={(v) => setTweak('density', v)}
            options={[{ value:'cozy', label:'Cozy' }, { value:'comfortable', label:'Comfort' }, { value:'compact', label:'Compact' }]}/>
        </TweakSection>
        <TweakSection title="Layout">
          <TweakRadio label="Index" value={tweaks.indexLayout}
            onChange={(v) => setTweak('indexLayout', v)}
            options={[{ value:'grid', label:'Grid' }, { value:'list', label:'List' }]}/>
          <TweakToggle label="Pace line on charts" value={tweaks.showPaceLine}
            onChange={(v) => setTweak('showPaceLine', v)}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
