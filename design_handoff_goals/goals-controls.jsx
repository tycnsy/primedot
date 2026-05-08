/* global React */
const { useState, useEffect, useRef } = React;

// =================================================================
// Icons
// =================================================================
const Icon = {
  goal: () => (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="8" cy="8" r="6.2"/><circle cx="8" cy="8" r="3.6"/><circle cx="8" cy="8" r="1" fill="currentColor"/>
    </svg>
  ),
  trend: () => (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12 L6 8 L9 10 L14 4"/><path d="M14 4 L11 4 M14 4 L14 7"/>
    </svg>
  ),
  accumulation: () => (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="9" width="3" height="5" rx="0.5"/><rect x="6.5" y="6" width="3" height="8" rx="0.5"/><rect x="11" y="3" width="3" height="11" rx="0.5"/>
    </svg>
  ),
  milestone: () => (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 3v10.5"/><path d="M3 3 H12 L10 5.5 L12 8 H3"/>
    </svg>
  ),
  daily: () => (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5 H13.5"/><path d="M5.5 2 V5"/><path d="M10.5 2 V5"/>
    </svg>
  ),
  plus: () => (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M8 3 V13 M3 8 H13"/>
    </svg>
  ),
  arrowLeft: () => (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 3 L4 8 L9 13 M4 8 H13"/>
    </svg>
  ),
  arrowRight: () => (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 3 L12 8 L7 13 M3 8 H12"/>
    </svg>
  ),
  flame: () => (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden>
      <path d="M8 1.5c.5 2.5-1 3-1 5 0 1.5 1 2.5 1 2.5s-1.5-.5-2.2-2c-.5 1-.8 1.5-.8 2.5 0 2.5 1.7 4.5 4 4.5s4-1.8 4-4.2c0-3.2-2-4.2-3-7-.5 1.5-1.2 1.7-2 1.5z" opacity=".95"/>
    </svg>
  ),
  caret: () => (
    <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6 L8 10 L12 6"/>
    </svg>
  ),
  more: () => (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden>
      <circle cx="3.5" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="12.5" cy="8" r="1.2"/>
    </svg>
  ),
  link: () => (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6.5 9.5 L9.5 6.5"/>
      <path d="M9 4 L10.5 2.5 a2 2 0 0 1 3 3 L12 7"/>
      <path d="M7 9 L5.5 10.5 a2 2 0 0 1 -3 -3 L4 6"/>
    </svg>
  ),
  edit: () => (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 11.5V13h1.5L12 5.5 10.5 4z"/><path d="M9.5 5l1.5 1.5"/>
    </svg>
  ),
  archive: () => (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="3" width="12" height="3" rx="0.6"/><path d="M3 6v7h10V6"/><path d="M6.5 9h3"/>
    </svg>
  ),
  search: () => (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2 L13 13"/>
    </svg>
  ),
  check: () => (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8.5 L6.5 12 L13 5"/>
    </svg>
  ),
  x: () => (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M4 4 L12 12 M12 4 L4 12"/>
    </svg>
  ),
  note: () => (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.5 2.5h6L13 6v7.5H3.5z"/><path d="M9 2.5V6h4"/><path d="M5.5 8.5h5M5.5 11h3.5"/>
    </svg>
  ),
};

// =================================================================
// CheckSquare
// =================================================================
function CheckSquare({ on, onClick, label }) {
  return (
    <button
      type="button"
      className="check-square"
      data-on={on}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={label}
      aria-pressed={on}
    >
      {on ? <Icon.check /> : null}
    </button>
  );
}

// =================================================================
// Counter
// =================================================================
function Counter({ value, target, unit, onChange }) {
  return (
    <div className="counter" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => onChange(Math.max(0, value-1))} aria-label="Decrease">−</button>
      <span className="val">{value}/{target ?? '∞'}{unit ? ` ${unit}` : ''}</span>
      <button type="button" onClick={() => onChange(value+1)} aria-label="Increase">+</button>
    </div>
  );
}

// =================================================================
// RingProgress
// =================================================================
function RingProgress({ percent, size=56, strokeColor }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      role="img"
      aria-label={`${Math.round(clamped)}% complete`}
      className="ring-progress"
      style={{
        width: size, height: size,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `conic-gradient(${strokeColor || 'rgb(var(--accent))'} ${clamped}%, rgb(var(--surface-2)) ${clamped}% 100%)`,
        position: 'relative',
      }}
    >
      <div style={{
        width: size - 10, height: size-10,
        borderRadius: '50%',
        background: 'rgb(var(--bg))',
        boxShadow: 'inset 0 0 0 1px rgb(var(--border) / .7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 600,
        color: 'rgb(var(--fg))',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {Math.round(clamped)}%
      </div>
    </div>
  );
}

// =================================================================
// Tag chip + tag list display
// =================================================================
function TagChip({ tag, onRemove }) {
  if (!tag) return null;
  return (
    <span className="tag-chip">
      <span className="dot" style={{ background: tag.color }} />
      {tag.name}
      {onRemove ? (
        <button type="button" onClick={onRemove} aria-label={`Remove ${tag.name}`}
          style={{ marginLeft: 2, background: 'transparent', border: 0, cursor: 'pointer', color: 'rgb(var(--muted))', padding: 0, display:'inline-flex' }}>
          <Icon.x />
        </button>
      ) : null}
    </span>
  );
}

// =================================================================
// Goal type badge
// =================================================================
function GoalTypeBadge({ type }) {
  const meta = {
    trend:        { label: 'Trend',        Icon: Icon.trend },
    accumulation: { label: 'Accumulation', Icon: Icon.accumulation },
    milestone:    { label: 'Milestone',    Icon: Icon.milestone },
    daily:        { label: 'Daily',        Icon: Icon.daily },
    weekly:       { label: 'Weekly',       Icon: Icon.daily },
  }[type] || { label: type, Icon: () => null };
  const I = meta.Icon;
  return (
    <span className="pill" title={meta.label}>
      <I /> {meta.label}
    </span>
  );
}

// =================================================================
// Week strip
// =================================================================
function WeekStrip({ data, todayIdx = 6, size = 12 }) {
  return (
    <span className="week-strip">
      {(data || []).slice(0,7).map((s, i) => (
        <span key={i} className="week-cell"
          data-state={s} data-today={i === todayIdx}
          style={{ width: size, height: size }} />
      ))}
    </span>
  );
}

// =================================================================
// Modal shell
// =================================================================
function Modal({ open, onClose, title, children, footer, maxWidth = 560 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, padding:'18px 20px 12px' }}>
          <h2 style={{ margin:0, fontSize:17, fontWeight:600, letterSpacing:'-0.01em' }}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon.x /></button>
        </div>
        <div style={{ padding:'0 20px 16px' }}>{children}</div>
        {footer ? <div style={{ padding:'12px 20px 16px', display:'flex', gap:8, justifyContent:'flex-end', borderTop:'1px solid rgb(var(--border))', background:'rgb(var(--surface-2)/.4)' }}>{footer}</div> : null}
      </div>
    </div>
  );
}

window.GoalsControls = {
  Icon, CheckSquare, Counter, RingProgress, TagChip, GoalTypeBadge, WeekStrip, Modal,
};
