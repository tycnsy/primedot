import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { STROKE_PALETTE, FILL_PALETTE } from './whiteboard-canvas';

// SVG icons
const TIcon = {
  select: <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2.5l4.2 10.3 1.6-4 4-1.6L3 2.5z"/></svg>,
  hand: <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8V4.5a1 1 0 1 1 2 0V7"/><path d="M7 7V3.5a1 1 0 1 1 2 0V7"/><path d="M9 7V4.5a1 1 0 1 1 2 0V8"/><path d="M11 7v-1a1 1 0 1 1 2 0v5.5a3.5 3.5 0 0 1-7 0V9L4 7.5a1 1 0 0 1 1.4-1.4L7 7.5"/></svg>,
  rectangle: <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2.5" y="3.5" width="11" height="9" rx="1"/></svg>,
  diamond: <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d="M8 2.5L13.5 8L8 13.5L2.5 8z"/></svg>,
  ellipse: <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4"><ellipse cx="8" cy="8" rx="5.5" ry="4.5"/></svg>,
  arrow: <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 8h11"/><path d="M10 4.5L13.5 8L10 11.5"/></svg>,
  line: <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M3 13L13 3"/></svg>,
  freedraw: <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 12.5l8.6-8.6a1.5 1.5 0 0 1 2.1 2.1L4.6 14.6l-3 .4z"/><path d="M9.5 4.5l2 2"/></svg>,
  text: <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M3 4V3h10v1"/><path d="M8 3v10"/><path d="M6 13h4"/></svg>,
  eraser: <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 13l-1-1 7-7 4 4-4 4z"/><path d="M14 13H6"/><path d="M6.5 9.5l4 4"/></svg>,
  undo: <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 5.5L2.5 8L5 10.5"/><path d="M2.5 8h7a4 4 0 0 1 0 8H7"/></svg>,
  redo: <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5.5L13.5 8L11 10.5"/><path d="M13.5 8h-7a4 4 0 0 0 0 8H9"/></svg>,
  zoomIn: <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L13.5 13.5M5 7h4M7 5v4"/></svg>,
  zoomOut: <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L13.5 13.5M5 7h4"/></svg>,
  image: <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="3.5" width="11" height="9" rx="1"/><circle cx="6" cy="7" r="1"/><path d="M4 11l2.6-2 2 1.5L11 8.5l1.5 2.5"/></svg>,
  youtube: <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="4" width="11" height="8" rx="2"/><path d="M7 6.7l3 1.8-3 1.8z" fill="currentColor" stroke="none"/></svg>,
};

// ============= Toolbar =============
function Toolbar({ tool, setTool, onAction }) {
  const tools = [
    { id: 'select', icon: TIcon.select, label: 'Select', key: 'V' },
    { id: 'hand', icon: TIcon.hand, label: 'Pan', key: 'H' },
    { divider: true },
    { id: 'rectangle', icon: TIcon.rectangle, label: 'Rectangle', key: 'R' },
    { id: 'diamond', icon: TIcon.diamond, label: 'Diamond', key: 'D' },
    { id: 'ellipse', icon: TIcon.ellipse, label: 'Ellipse', key: 'O' },
    { id: 'arrow', icon: TIcon.arrow, label: 'Arrow', key: 'A' },
    { id: 'line', icon: TIcon.line, label: 'Line', key: 'L' },
    { id: 'freedraw', icon: TIcon.freedraw, label: 'Draw', key: 'B' },
    { id: 'text', icon: TIcon.text, label: 'Text', key: 'T' },
    { divider: true },
    { id: 'image', icon: TIcon.image, label: 'Image', kind: 'action' },
    { id: 'youtube', icon: TIcon.youtube, label: 'YouTube', kind: 'action' },
    { divider: true },
    { id: 'eraser', icon: TIcon.eraser, label: 'Eraser', key: 'E' },
  ];
  return (
    <div className="wb-toolbar">
      {tools.map((t, i) => t.divider ? <div key={'d'+i} className="wb-tool-divider"/> : (
        <button key={t.id} className="wb-tool" data-active={tool === t.id}
          title={t.key ? `${t.label} — ${t.key}` : t.label}
          onClick={() => (t.kind === 'action' ? onAction?.(t.id) : setTool(t.id))}>
          {t.icon}
          {t.key ? <span className="wb-tool-key">{t.key}</span> : null}
        </button>
      ))}
    </div>
  );
}

// ============= Properties Panel =============
function PropsPanel({ style, onStyleChange, hasSelection, strokePalette, fillPalette, onAddStrokeColor, onAddFillColor, onRemoveStrokeColor, onRemoveFillColor }) {
  const set = (k, v) => onStyleChange(k, v);
  return (
    <div className="wb-props">
      <Section label="Stroke">
        <Swatches palette={strokePalette || STROKE_PALETTE} value={style.stroke} onChange={(c) => set('stroke', c)} onAddColor={onAddStrokeColor} onRemoveColor={onRemoveStrokeColor}/>
      </Section>
      <Section label="Text align">
        <div className="wb-icon-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {[
            { v: 'left',   path: 'M2 4h12M2 8h8M2 12h12M2 16h6' },
            { v: 'center', path: 'M2 4h12M5 8h8M2 12h12M6 16h6' },
            { v: 'right',  path: 'M2 4h12M6 8h8M2 12h12M8 16h6' },
          ].map(o => (
            <button key={o.v} className="wb-icon-btn" data-active={(style.textAlign || 'center') === o.v}
              onClick={() => set('textAlign', o.v)}>
              <svg viewBox="0 0 16 18" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d={o.path}/></svg>
            </button>
          ))}
        </div>
      </Section>
      <Section label="Fill">
        <Swatches palette={fillPalette || FILL_PALETTE} value={style.fill} onChange={(c) => set('fill', c)} onAddColor={onAddFillColor} onRemoveColor={onRemoveFillColor} allowTransparent/>
      </Section>
      {style.fill && style.fill !== 'transparent' ? (
        <Section label="Fill style">
          <div className="wb-icon-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <FillStyleIcon name="hachure" active={style.fillStyle === 'hachure'} onClick={() => set('fillStyle', 'hachure')}/>
            <FillStyleIcon name="cross-hatch" active={style.fillStyle === 'cross-hatch'} onClick={() => set('fillStyle', 'cross-hatch')}/>
            <FillStyleIcon name="solid" active={style.fillStyle === 'solid'} onClick={() => set('fillStyle', 'solid')}/>
          </div>
        </Section>
      ) : null}
      <Section label="Stroke width">
        <div className="wb-icon-row">
          {[1, 2, 4].map(w => (
            <button key={w} className="wb-icon-btn" data-active={style.strokeWidth === w}
              onClick={() => set('strokeWidth', w)}
              style={{ gridColumn: w === 1 ? 'span 1' : w === 2 ? 'span 1' : 'span 2' }}>
              <span style={{ display:'inline-block', width: 18, height: w + 1, background:'currentColor', borderRadius: 999 }}/>
            </button>
          ))}
        </div>
      </Section>
      <Section label="Sketchiness">
        <div className="wb-icon-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {[
            { v: 0, label: 'Architect' },
            { v: 1, label: 'Artist' },
            { v: 2, label: 'Cartoonist' },
          ].map(o => (
            <button key={o.v} className="wb-icon-btn" data-active={style.roughness === o.v}
              title={o.label}
              onClick={() => set('roughness', o.v)}>
              <SketchPreview level={o.v}/>
            </button>
          ))}
        </div>
      </Section>
      <Section label="Edges">
        <div className="wb-icon-row" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <button className="wb-icon-btn" data-active={style.edge === 'sharp'}
            onClick={() => set('edge', 'sharp')}>
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="3" y="3" width="10" height="10"/></svg>
          </button>
          <button className="wb-icon-btn" data-active={style.edge === 'round'}
            onClick={() => set('edge', 'round')}>
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="3" y="3" width="10" height="10" rx="3"/></svg>
          </button>
        </div>
      </Section>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div className="wb-props-section">
      <div className="wb-props-label">{label}</div>
      {children}
    </div>
  );
}

function Swatches({ palette, value, onChange, allowTransparent, onAddColor, onRemoveColor }) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pendingColor, setPendingColor] = React.useState('#888888');
  const [editingColor, setEditingColor] = React.useState(null); // existing color being replaced

  const confirmColor = () => {
    if (editingColor) {
      onRemoveColor && onRemoveColor(editingColor);
      onAddColor && onAddColor(pendingColor);
      onChange(pendingColor);
    } else {
      onAddColor && onAddColor(pendingColor);
      onChange(pendingColor);
    }
    setPickerOpen(false);
    setEditingColor(null);
  };
  const cancelPicker = () => { setPickerOpen(false); setEditingColor(null); };

  return (
    <div className="wb-swatches">
      {palette.map(c => (
        <button key={c} className="wb-swatch"
          style={{ '--c': c }}
          data-active={value === c}
          data-transparent={c === 'transparent'}
          title={c === 'transparent' ? 'transparent — alt-click to remove · double-click to edit' : c + ' — alt-click to remove · double-click to edit'}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            if (e.altKey && onRemoveColor) {
              onRemoveColor(c);
              if (value === c) {
                const remaining = palette.filter(x => x !== c);
                onChange(remaining[0] || '#1e1e1e');
              }
              return;
            }
            onChange(c);
          }}
          onDoubleClick={() => {
            if (c === 'transparent') return;
            setPendingColor(c);
            setEditingColor(c);
            setPickerOpen(true);
          }}
        />
      ))}
      {onAddColor ? (
        <button className="wb-swatch wb-swatch-add"
          title="Add custom color"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setPendingColor('#888888');
            setEditingColor(null);
            setPickerOpen(true);
          }}>+</button>
      ) : null}
      {pickerOpen ? (
        <div className="wb-color-picker-pop">
          <input type="color" className="wb-color-picker-input"
            value={pendingColor}
            onChange={(e) => setPendingColor(e.target.value)}/>
          <div className="wb-color-picker-row">
            <input type="text" className="wb-color-picker-hex"
              value={pendingColor}
              onChange={(e) => {
                let v = e.target.value.trim();
                if (v && !v.startsWith('#')) v = '#' + v;
                setPendingColor(v);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && /^#[0-9a-f]{6}$/i.test(pendingColor)) confirmColor();
                if (e.key === 'Escape') cancelPicker();
              }}
            />
            <button className="wb-color-picker-cancel" onClick={cancelPicker}>Cancel</button>
            <button className="wb-color-picker-confirm" onClick={confirmColor}
              disabled={!/^#[0-9a-f]{6}$/i.test(pendingColor)}>
              {editingColor ? 'Save' : 'Add'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FillStyleIcon({ name, active, onClick }) {
  let inner;
  if (name === 'hachure') {
    inner = <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="2.5" y="2.5" width="11" height="11" stroke="currentColor"/><path d="M3 7L7 3M3 11L11 3M5 13L13 5M9 13L13 9"/></svg>;
  } else if (name === 'cross-hatch') {
    inner = <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1"><rect x="2.5" y="2.5" width="11" height="11"/><path d="M3 7L7 3M3 11L11 3M5 13L13 5M9 13L13 9M9 3L13 7M5 3L13 11M3 5L11 13M3 9L7 13"/></svg>;
  } else {
    inner = <svg viewBox="0 0 16 16" width="16" height="16"><rect x="2.5" y="2.5" width="11" height="11" fill="currentColor"/></svg>;
  }
  return <button className="wb-icon-btn" data-active={active} onClick={onClick}>{inner}</button>;
}

function SketchPreview({ level }) {
  const paths = {
    0: <path d="M3 4 L13 4 L13 12 L3 12 Z" fill="none" stroke="currentColor" strokeWidth="1.2"/>,
    1: <path d="M3.2 4.2 Q5 3.8 13 4.1 L12.8 11.7 Q9 12.3 3.1 11.9 Z" fill="none" stroke="currentColor" strokeWidth="1.2"/>,
    2: <path d="M3.4 4.6 Q6 3.4 12.8 4.4 Q13.4 9 12.6 11.5 Q7 12.6 3.2 11.4 Q2.7 7 3.4 4.6 Z" fill="none" stroke="currentColor" strokeWidth="1.2"/>,
  };
  return <svg viewBox="0 0 16 16" width="16" height="16">{paths[level]}</svg>;
}

function formatUpdatedAt(value) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'updated recently';
  const deltaMs = Date.now() - time;
  if (deltaMs < 60 * 1000) return 'updated just now';
  const deltaMin = Math.floor(deltaMs / (60 * 1000));
  if (deltaMin < 60) return `updated ${deltaMin}m ago`;
  const deltaHr = Math.floor(deltaMin / 60);
  if (deltaHr < 24) return `updated ${deltaHr}h ago`;
  const deltaDay = Math.floor(deltaHr / 24);
  if (deltaDay < 7) return `updated ${deltaDay}d ago`;
  return `updated ${new Date(value).toLocaleDateString()}`;
}

// ============= Board switcher (bottom center) =============
function BoardSwitcher({ currentBoardId }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      setBoards([]);
      setLoading(false);
      setError('');
      return;
    }
    let alive = true;
    setLoading(true);
    setError('');
    void supabase
      .from('whiteboards')
      .select('id, slug, name, updated_at, created_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (!alive) return;
        if (fetchError) {
          setError(fetchError.message || 'Unable to load boards.');
          setBoards([]);
          setLoading(false);
          return;
        }
        setBoards(Array.isArray(data) ? data : []);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [user]);

  const otherBoards = useMemo(
    () => boards.filter((board) => board.slug && board.slug !== currentBoardId),
    [boards, currentBoardId],
  );

  const goToBoard = (slug) => {
    if (!slug) return;
    navigate(`/whiteboards/${slug}`);
    setOpen(false);
  };

  return (
    <div className={`wb-board-switcher${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="wb-board-switcher-toggle"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="wb-board-switcher-label">Boards</span>
        <span className="wb-board-switcher-count">{otherBoards.length}</span>
        <span className="wb-board-switcher-chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        <div className="wb-board-switcher-panel">
          {loading ? <p className="wb-board-switcher-status">Loading boards...</p> : null}
          {!loading && error ? <p className="wb-board-switcher-status">{error}</p> : null}
          {!loading && !error && otherBoards.length === 0 ? (
            <p className="wb-board-switcher-status">No other boards yet.</p>
          ) : null}
          {!loading && !error && otherBoards.length > 0 ? (
            <ul className="wb-board-switcher-list">
              {otherBoards.map((board) => (
                <li key={board.id}>
                  <button
                    type="button"
                    className="wb-board-switcher-item"
                    title={board.name || board.slug}
                    onClick={() => goToBoard(board.slug)}
                  >
                    <span className="wb-board-switcher-item-name">{board.name || board.slug}</span>
                    <span className="wb-board-switcher-item-meta">{formatUpdatedAt(board.updated_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ============= Zoom controls =============
function ZoomControls({ view, setView }) {
  const set = (s) => setView(v => {
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const k = s / v.scale;
    return { x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k, scale: s };
  });
  return (
    <div className="wb-zoom">
      <button title="Zoom out" onClick={() => set(Math.max(0.1, view.scale / 1.2))}>{TIcon.zoomOut}</button>
      <span className="wb-zoom-val" onClick={() => set(1)} title="Reset zoom" style={{ cursor: 'pointer' }}>
        {Math.round(view.scale * 100)}%
      </span>
      <button title="Zoom in" onClick={() => set(Math.min(8, view.scale * 1.2))}>{TIcon.zoomIn}</button>
    </div>
  );
}

// ============= History controls =============
function HistoryControls({ canUndo, canRedo, onUndo, onRedo }) {
  return (
    <div className="wb-history">
      <button title="Undo (⌘Z)" onClick={onUndo} disabled={!canUndo}>{TIcon.undo}</button>
      <button title="Redo (⌘⇧Z)" onClick={onRedo} disabled={!canRedo}>{TIcon.redo}</button>
    </div>
  );
}

// ============= Top brand chip =============
function BrandChip() {
  return (
    <div className="wb-brand">
      <span className="wb-brand-mark">prime<span className="dot"/></span>
    </div>
  );
}

// ============= Top-right actions =============
function ActionsBar() {
  return (
    <div className="wb-actions">
      <div className="wb-avatars">
        <span className="wb-avatar" style={{ background:'#0a5bff' }}>JD</span>
        <span className="wb-avatar" style={{ background:'#21a06a' }}>MR</span>
        <span className="wb-avatar" style={{ background:'#e8590c' }}>AL</span>
      </div>
      <button className="wb-pill-btn">Share</button>
      <button className="wb-pill-btn primary">Export</button>
    </div>
  );
}

// ============= Other-user cursors =============
function GhostCursors() {
  const cursors = [
    { id: 1, x: '32%', y: '38%', name: 'Mira', color: '#7b5ee6' },
    { id: 2, x: '64%', y: '58%', name: 'Jack', color: '#21a06a' },
  ];
  return cursors.map(c => (
    <div key={c.id} className="wb-cursor" style={{ left: c.x, top: c.y, color: c.color }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill={c.color}>
        <path d="M5 3l14 6.5-7 1.7-1.7 7L5 3z"/>
      </svg>
      <span className="wb-cursor-tag" style={{ background: c.color }}>{c.name}</span>
    </div>
  ));
}

// ============= Hint =============
function Hint() {
  return (
    <div className="wb-hint">
      <span><span className="kbd">␣</span> + drag to pan</span>
      <span><span className="kbd">⌘</span>+scroll to zoom</span>
    </div>
  );
}

export {
  Toolbar,
  PropsPanel,
  BoardSwitcher,
  ZoomControls,
  HistoryControls,
  BrandChip,
  ActionsBar,
  GhostCursors,
  Hint,
  TIcon,
};
