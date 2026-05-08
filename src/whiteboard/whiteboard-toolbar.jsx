import React, { useState } from 'react';
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
};

// ============= Toolbar =============
function Toolbar({ tool, setTool }) {
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
    { id: 'eraser', icon: TIcon.eraser, label: 'Eraser', key: 'E' },
  ];
  return (
    <div className="wb-toolbar">
      {tools.map((t, i) => t.divider ? <div key={'d'+i} className="wb-tool-divider"/> : (
        <button key={t.id} className="wb-tool" data-active={tool === t.id}
          title={`${t.label} — ${t.key}`}
          onClick={() => setTool(t.id)}>
          {t.icon}
          <span className="wb-tool-key">{t.key}</span>
        </button>
      ))}
    </div>
  );
}

// ============= Properties Panel =============
function PropsPanel({ style, setStyle, hasSelection, strokePalette, fillPalette, onAddStrokeColor, onAddFillColor, onRemoveStrokeColor, onRemoveFillColor }) {
  const set = (k, v) => setStyle(s => ({ ...s, [k]: v }));
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

// ============= Library shelf =============
function Library({ onInsert }) {
  const items = [
    { id: 'sticky', label: 'Sticky note', icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 5h12l4 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M16 5v4h4"/></svg> },
    { id: 'flow', label: 'Flow node', icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="9" width="8" height="6" rx="1"/><rect x="13" y="9" width="8" height="6" rx="1"/><path d="M11 12h2"/></svg> },
    { id: 'vote', label: 'Dot vote', icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="17" cy="12" r="2"/></svg> },
    { id: 'frame', label: 'Frame', icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 3v18M19 3v18M3 5h18M3 19h18"/></svg> },
    { id: 'arrow-grid', label: '2x2 matrix', icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 12h16M12 4v16"/></svg> },
    { id: 'cluster', label: 'Cluster', icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="9" r="2.5"/><circle cx="16" cy="9" r="2.5"/><circle cx="12" cy="16" r="2.5"/></svg> },
  ];
  return (
    <div className="wb-library">
      <div className="wb-library-label">Library</div>
      {items.map(it => (
        <button key={it.id} className="wb-library-item" title={it.label} onClick={() => onInsert(it.id)}>
          {it.icon}
        </button>
      ))}
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
function BrandChip({ docName, setDocName }) {
  return (
    <div className="wb-brand">
      <span className="wb-brand-mark">prime<span className="dot"/></span>
      <span className="wb-brand-divider"/>
      <input
        className="wb-brand-doc"
        value={docName}
        onChange={(e) => setDocName(e.target.value)}
        spellCheck={false}
      />
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
  Library,
  ZoomControls,
  HistoryControls,
  BrandChip,
  ActionsBar,
  GhostCursors,
  Hint,
  TIcon,
};
