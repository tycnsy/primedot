import React, { useState, useEffect, useRef, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import rough from 'roughjs';

// =================================================================
// Element model
// =================================================================
// element: { id, type, x, y, w, h, points?, text?, fontSize?,
//            stroke, fill, fillStyle, strokeWidth, roughness, edge,
//            seed }

const STROKE_PALETTE = ['#ffffff', '#1e1e1e', '#e03131', '#1971c2', '#2f9e44', '#e8590c', '#9c36b5'];
const FILL_PALETTE   = ['transparent', '#ffd9d9', '#d0e7ff', '#d3f0d9', '#ffe5b8', '#ead8ff'];

const newSeed = () => Math.floor(Math.random() * 2 ** 31);
const newId = () => 'el_' + Math.random().toString(36).slice(2, 9);

// Measurement helper for text wrapping. Uses an offscreen div so we can
// support manualWidth (drag-to-wrap) and accurate height computation.
let _wbMeasureDiv = null;
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeColor(color, fallback = '#1e1e1e') {
  if (!color || typeof color !== 'string') return fallback;
  return color;
}

function normalizeTextRuns(runs, fallback = '#1e1e1e') {
  if (!Array.isArray(runs)) return [];
  const out = [];
  for (const run of runs) {
    const text = typeof run?.text === 'string' ? run.text : '';
    if (!text) continue;
    const color = normalizeColor(run?.color, fallback);
    const prev = out[out.length - 1];
    if (prev && prev.color === color) prev.text += text;
    else out.push({ text, color });
  }
  return out;
}

function ensureRunsFromElement(el, fallback = '#1e1e1e') {
  const fromRuns = normalizeTextRuns(el.textRuns, el.stroke || fallback);
  if (fromRuns.length) return fromRuns;
  if (typeof el.text === 'string' && el.text.length) {
    return [{ text: el.text, color: normalizeColor(el.stroke, fallback) }];
  }
  return [];
}

function textFromRuns(runs) {
  return runs.map((r) => r.text).join('');
}

function runsToEditableHtml(runs) {
  if (!runs.length) return '';
  return runs.map((run) => {
    const color = normalizeColor(run.color);
    const htmlText = escapeHtml(run.text).replace(/\n/g, '<br/>');
    return `<span style="color:${color}">${htmlText}</span>`;
  }).join('');
}

function rgbToHex(value, fallback = '#1e1e1e') {
  if (!value || typeof value !== 'string') return fallback;
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return fallback;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0'));
  return `#${r}${g}${b}`;
}

function runsFromEditor(root, fallbackColor = '#1e1e1e') {
  if (!root) return [];
  const out = [];

  const append = (text, color) => {
    if (!text) return;
    const safeColor = normalizeColor(color, fallbackColor);
    const prev = out[out.length - 1];
    if (prev && prev.color === safeColor) prev.text += text;
    else out.push({ text, color: safeColor });
  };

  const walk = (node, inheritedColor) => {
    if (node.nodeType === Node.TEXT_NODE) {
      append(node.textContent || '', inheritedColor);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName;
    const computed = window.getComputedStyle(node);
    const color = rgbToHex(computed.color, inheritedColor);

    if (tag === 'BR') {
      append('\n', color);
      return;
    }

    const isBlock = tag === 'DIV' || tag === 'P';
    const childNodes = Array.from(node.childNodes);
    for (const child of childNodes) walk(child, color);
    if (isBlock && out.length) {
      const last = out[out.length - 1];
      if (!last.text.endsWith('\n')) append('\n', color);
    }
  };

  for (const child of Array.from(root.childNodes)) walk(child, fallbackColor);
  const normalized = normalizeTextRuns(out, fallbackColor);
  if (normalized.length) {
    normalized[normalized.length - 1].text = normalized[normalized.length - 1].text.replace(/\n+$/, '');
  }
  return normalizeTextRuns(normalized, fallbackColor);
}

function measureTextRuns(runs, fontSize, manualWidth) {
  if (!_wbMeasureDiv) {
    _wbMeasureDiv = document.createElement('div');
    _wbMeasureDiv.style.cssText = 'position:absolute;visibility:hidden;left:-99999px;top:-99999px;font-family:"Excalifont","Caveat","Comic Sans MS",cursive;font-weight:400;line-height:1.15;white-space:pre-wrap;word-break:break-word;padding:0;margin:0;border:0;box-sizing:content-box;';
    document.body.appendChild(_wbMeasureDiv);
  }
  _wbMeasureDiv.style.fontSize = fontSize + 'px';
  _wbMeasureDiv.style.width = manualWidth ? manualWidth + 'px' : 'auto';
  _wbMeasureDiv.innerHTML = runs.length ? runsToEditableHtml(runs) : ' ';
  return { w: manualWidth || _wbMeasureDiv.offsetWidth, h: _wbMeasureDiv.offsetHeight };
}

// Map an alignment + measured width back to a left-edge x, given the anchor
// point the text should grow around (click point for new, original-anchor for edits).
function xFromAnchor(anchorX, w, align) {
  if (align === 'left') return anchorX;
  if (align === 'right') return anchorX - w;
  return anchorX - w / 2;
}
function anchorOf(el) {
  const a = el.textAlign || 'center';
  if (a === 'left') return el.x;
  if (a === 'right') return el.x + el.w;
  return el.x + el.w / 2;
}

// rough.js options for an element
function roughOptions(el) {
  const opts = {
    seed: el.seed || 1,
    stroke: el.stroke,
    strokeWidth: el.strokeWidth ?? 1.6,
    roughness: el.roughness ?? 1,
  };
  if (el.fill && el.fill !== 'transparent') {
    opts.fill = el.fill;
    opts.fillStyle = el.fillStyle || 'hachure';
    opts.hachureGap = (el.strokeWidth ?? 1.6) * 5;
    opts.fillWeight = (el.strokeWidth ?? 1.6) * .8;
  } else {
    opts.fill = undefined;
  }
  if (el.edge === 'round' && (el.type === 'rectangle' || el.type === 'diamond')) {
    // we'll handle rounded rects via path
  }
  return opts;
}

// =================================================================
// Element math
// =================================================================
function bboxOf(el) {
  if (el.type === 'freedraw' && el.points && el.points.length) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of el.points) {
      const ax = el.x + px, ay = el.y + py;
      if (ax < minX) minX = ax; if (ay < minY) minY = ay;
      if (ax > maxX) maxX = ax; if (ay > maxY) maxY = ay;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  if (el.type === 'line' || el.type === 'arrow') {
    const x1 = el.x, y1 = el.y, x2 = el.x + el.w, y2 = el.y + el.h;
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(el.w), h: Math.abs(el.h) };
  }
  return {
    x: el.w < 0 ? el.x + el.w : el.x,
    y: el.h < 0 ? el.y + el.h : el.y,
    w: Math.abs(el.w),
    h: Math.abs(el.h),
  };
}

function hitTest(el, px, py) {
  const bb = bboxOf(el);
  const pad = 8;
  if (el.type === 'line' || el.type === 'arrow') {
    const x1 = el.x, y1 = el.y, x2 = el.x + el.w, y2 = el.y + el.h;
    return distToSegment(px, py, x1, y1, x2, y2) < pad;
  }
  if (el.type === 'freedraw' && el.points) {
    for (let i = 1; i < el.points.length; i++) {
      const [a, b] = el.points[i - 1], [c, d] = el.points[i];
      if (distToSegment(px, py, el.x + a, el.y + b, el.x + c, el.y + d) < 6) return true;
    }
    return false;
  }
  if (el.type === 'text') {
    return px >= bb.x - 2 && px <= bb.x + bb.w + 2 && py >= bb.y - 2 && py <= bb.y + bb.h + 2;
  }
  // shape: hit if inside bbox (with some grace) or near edge for unfilled
  const inside = px >= bb.x && px <= bb.x + bb.w && py >= bb.y && py <= bb.y + bb.h;
  if (el.fill && el.fill !== 'transparent') return inside;
  // for unfilled, only on the edge
  const onEdge =
    Math.abs(px - bb.x) < pad || Math.abs(px - (bb.x + bb.w)) < pad ||
    Math.abs(py - bb.y) < pad || Math.abs(py - (bb.y + bb.h)) < pad;
  if (el.type === 'ellipse') {
    // ellipse hit
    const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
    const rx = bb.w / 2, ry = bb.h / 2;
    if (rx <= 0 || ry <= 0) return false;
    const v = ((px - cx) ** 2) / (rx * rx) + ((py - cy) ** 2) / (ry * ry);
    return el.fill && el.fill !== 'transparent' ? v <= 1 : Math.abs(v - 1) < .25;
  }
  return inside && onEdge;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function cloneElements(elementsToClone) {
  if (typeof structuredClone === 'function') return structuredClone(elementsToClone);
  return JSON.parse(JSON.stringify(elementsToClone));
}

function bboxUnion(list) {
  if (!list.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of list) {
    const bb = bboxOf(el);
    if (bb.x < minX) minX = bb.x;
    if (bb.y < minY) minY = bb.y;
    if (bb.x + bb.w > maxX) maxX = bb.x + bb.w;
    if (bb.y + bb.h > maxY) maxY = bb.y + bb.h;
  }
  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// =================================================================
// Canvas
// =================================================================
function Canvas({
  tool, setTool, style,
  elements, setElements,
  selectedIds, setSelectedIds,
  view, setView,
  pushHistory,
  onEditingTextStateChange,
}, ref) {
  const svgRef = useRef(null);
  const layerRef = useRef(null);
  const rcRef = useRef(null);
  const editingTextRef = useRef(null);
  const clipboardRef = useRef([]);
  const cursorWorldRef = useRef(null);

  // Drag state
  const dragRef = useRef(null);
  const [drafting, setDrafting] = useState(null); // current element being drawn
  const [editingText, setEditingText] = useState(null); // { id, x, y, ... }
  const textEditorRef = useRef(null);
  const [marquee, setMarquee] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [panning, setPanning] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);

  useImperativeHandle(ref, () => ({
    addElement(el) {
      setElements(prev => [...prev, el]);
      pushHistory();
    },
    clearAll() {
      setElements([]);
      setSelectedIds([]);
      pushHistory();
    },
    applyEditingTextColor(color) {
      if (!editingTextRef.current || !textEditorRef.current) return false;
      textEditorRef.current.focus();
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('foreColor', false, color);
      const runs = runsFromEditor(textEditorRef.current, color);
      const text = textFromRuns(runs);
      setEditingText((prev) => prev ? { ...prev, stroke: color, textRuns: runs, text } : prev);
      return true;
    },
  }), [pushHistory, setElements, setSelectedIds]);

  // Setup rough generator
  useEffect(() => {
    if (svgRef.current && !rcRef.current) {
      rcRef.current = rough.svg(svgRef.current);
    }
  }, []);

  // Render elements via rough.js (imperative)
  useEffect(() => {
    if (!layerRef.current || !rcRef.current) return;
    const layer = layerRef.current;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    const rc = rcRef.current;
    const list = [...elements];
    if (drafting) list.push(drafting);
    for (const el of list) {
      const node = renderElement(rc, el);
      if (node) {
        node.dataset.elId = el.id;
        layer.appendChild(node);
      }
    }
  }, [elements, drafting]);

  // Coords transform (screen -> world)
  const toWorld = useCallback((sx, sy) => {
    return { x: (sx - view.x) / view.scale, y: (sy - view.y) / view.scale };
  }, [view]);

  // Commit text (used for blur and before re-opening editor)
  useEffect(() => { editingTextRef.current = editingText; }, [editingText]);
  useEffect(() => {
    if (onEditingTextStateChange) onEditingTextStateChange(Boolean(editingText));
  }, [editingText, onEditingTextStateChange]);
  useEffect(() => {
    if (!editingText || !textEditorRef.current) return;
    textEditorRef.current.innerHTML = runsToEditableHtml(editingText.textRuns || []);
    textEditorRef.current.focus();
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(textEditorRef.current);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }, [editingText?.id, editingText?.editingId]);

  const commitTextValue = (et) => {
    if (!et) return;
    if ((et.text || '').trim()) {
      const fontSize = et.fontSize;
      const textRuns = normalizeTextRuns(et.textRuns, et.stroke);
      const text = textFromRuns(textRuns);
      const primaryColor = textRuns[0]?.color || et.stroke || '#1e1e1e';
      const { w, h } = measureTextRuns(textRuns, fontSize, et.manualWidth);
      const align = et.textAlign || 'center';
      const x = et.anchorX != null ? xFromAnchor(et.anchorX, w, align) : et.x;
      const y = et.y;
      if (et.editingId) {
        // editing existing element
        setElements(prev => prev.map(el => el.id === et.editingId
          ? { ...el, text, textRuns, w, h, x, y, fontSize, stroke: primaryColor, textAlign: align, manualWidth: et.manualWidth, _editing: false }
          : el));
      } else {
        const el = { id: et.id, type: 'text', x, y, w, h, text, textRuns, fontSize, stroke: primaryColor, textAlign: align, manualWidth: et.manualWidth, seed: newSeed() };
        setElements(prev => [...prev, el]);
        setSelectedIds([el.id]);
        setTool('select');
      }
      pushHistory();
    }
  };

  const startEditingExistingText = (el, screenX, screenY) => {
    commitTextValue(editingTextRef.current);
    const textRuns = ensureRunsFromElement(el, el.stroke || style.stroke || '#1e1e1e');
    const text = textFromRuns(textRuns);
    setSelectedIds([]);
    setEditingText({
      id: el.id,
      editingId: el.id,
      x: el.x, y: el.y,
      anchorX: anchorOf(el),
      screenX, screenY,
      text,
      textRuns,
      fontSize: el.fontSize || 22,
      stroke: textRuns[0]?.color || el.stroke || style.stroke || '#1e1e1e',
      textAlign: el.textAlign || 'center',
      manualWidth: el.manualWidth,
    });
    // hide the original while editing
    setElements(prev => prev.map(e => e.id === el.id ? { ...e, _editing: true } : e));
  };

  const onDoubleClick = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const w = toWorld(sx, sy);
    const hit = [...elements].reverse().find(el => el.type === 'text' && hitTest(el, w.x, w.y));
    if (hit) {
      startEditingExistingText(hit, sx, sy);
      return;
    }
    // double-clicking empty space (with any tool) creates a new text element
    commitTextValue(editingTextRef.current);
    setSelectedIds([]);
    setEditingText({
      id: newId(),
      x: w.x, y: w.y,
      anchorX: w.x,
      screenX: sx, screenY: sy,
      text: '',
      textRuns: [],
      fontSize: 22,
      stroke: style.stroke,
      textAlign: style.textAlign || 'center',
    });
  };

  // Pointer / wheel handlers
  const onPointerDown = (e) => {
    if (e.button === 1 || (e.button === 0 && (spaceDown || tool === 'hand'))) {
      setPanning(true);
      dragRef.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const w = toWorld(sx, sy);
    cursorWorldRef.current = w;

    if (tool === 'text') {
      // If we're already editing a text box, clicking elsewhere should
      // simply commit + close it — not open a new one.
      if (editingTextRef.current) {
        commitText();
        e.preventDefault();
        return;
      }
      // if clicking on existing text, edit it
      const hit = [...elements].reverse().find(el => el.type === 'text' && hitTest(el, w.x, w.y));
      if (hit) {
        startEditingExistingText(hit, sx, sy);
      } else {
        const id = newId();
        setEditingText({
          id,
          x: w.x, y: w.y,
          anchorX: w.x,
          screenX: sx, screenY: sy,
          text: '',
          textRuns: [],
          fontSize: 22,
          stroke: style.stroke,
          textAlign: style.textAlign || 'center',
        });
      }
      e.preventDefault();
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);

    if (tool === 'select') {
      // check hit
      const hit = [...elements].reverse().find(el => hitTest(el, w.x, w.y));
      if (hit) {
        const ids = selectedIds.includes(hit.id)
          ? selectedIds
          : (e.shiftKey ? [...selectedIds, hit.id] : [hit.id]);
        setSelectedIds(ids);
        dragRef.current = { mode: 'move', startW: w, originals: elements.filter(el => ids.includes(el.id)).map(el => ({ id: el.id, x: el.x, y: el.y })) };
      } else {
        if (!e.shiftKey) setSelectedIds([]);
        dragRef.current = { mode: 'marquee', sx: w.x, sy: w.y };
        setMarquee({ x: w.x, y: w.y, w: 0, h: 0 });
      }
      return;
    }

    if (tool === 'eraser') {
      dragRef.current = { mode: 'erase' };
      const hit = [...elements].reverse().find(el => hitTest(el, w.x, w.y));
      if (hit) setElements(prev => prev.filter(el => el.id !== hit.id));
      return;
    }

    // creating new shape
    const seed = newSeed();
    const base = {
      id: newId(),
      type: tool,
      x: w.x, y: w.y, w: 0, h: 0,
      stroke: style.stroke,
      fill: style.fill,
      fillStyle: style.fillStyle,
      strokeWidth: style.strokeWidth,
      roughness: style.roughness,
      edge: style.edge,
      seed,
    };
    if (tool === 'freedraw') {
      base.points = [[0, 0]];
      base.fill = 'transparent';
    }
    setDrafting(base);
    dragRef.current = { mode: 'draw', startW: w };
  };

  const onPointerMove = (e) => {
    const drag = dragRef.current;
    const rect = svgRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const w = toWorld(sx, sy);
    cursorWorldRef.current = w;

    // hover for cursor
    if (!drag && tool === 'select') {
      const hit = [...elements].reverse().find(el => hitTest(el, w.x, w.y));
      setHoverId(hit ? hit.id : null);
    }

    if (!drag) return;

    if (drag.mode === 'pan') {
      setView(v => ({ ...v, x: drag.ox + (e.clientX - drag.sx), y: drag.oy + (e.clientY - drag.sy) }));
      return;
    }
    if (drag.mode === 'resize-text-width') {
      const dx = (e.clientX - drag.startX) / view.scale;
      const newW = Math.max(40, drag.origWidth + dx);
      setElements(prev => prev.map(el => {
        if (el.id !== drag.elId) return el;
        const runs = ensureRunsFromElement(el, el.stroke || '#1e1e1e');
        const m = measureTextRuns(runs, el.fontSize || 22, newW);
        return { ...el, manualWidth: newW, w: m.w, h: m.h };
      }));
      return;
    }
    if (drag.mode === 'move') {
      const dx = w.x - drag.startW.x, dy = w.y - drag.startW.y;
      setElements(prev => prev.map(el => {
        const o = drag.originals.find(o => o.id === el.id);
        return o ? { ...el, x: o.x + dx, y: o.y + dy } : el;
      }));
      return;
    }
    if (drag.mode === 'marquee') {
      setMarquee({ x: drag.sx, y: drag.sy, w: w.x - drag.sx, h: w.y - drag.sy });
      return;
    }
    if (drag.mode === 'erase') {
      const hit = [...elements].reverse().find(el => hitTest(el, w.x, w.y));
      if (hit) setElements(prev => prev.filter(el => el.id !== hit.id));
      return;
    }
    if (drag.mode === 'draw' && drafting) {
      if (drafting.type === 'freedraw') {
        setDrafting(d => ({ ...d, points: [...d.points, [w.x - d.x, w.y - d.y]] }));
      } else {
        let nw = w.x - drafting.x, nh = w.y - drafting.y;
        if (e.shiftKey && (drafting.type === 'rectangle' || drafting.type === 'ellipse' || drafting.type === 'diamond')) {
          const m = Math.max(Math.abs(nw), Math.abs(nh));
          nw = Math.sign(nw || 1) * m; nh = Math.sign(nh || 1) * m;
        }
        if (e.shiftKey && (drafting.type === 'line' || drafting.type === 'arrow')) {
          // snap to 15° increments
          const a = Math.atan2(nh, nw);
          const step = Math.PI / 12;
          const sa = Math.round(a / step) * step;
          const len = Math.hypot(nw, nh);
          nw = Math.cos(sa) * len; nh = Math.sin(sa) * len;
        }
        setDrafting(d => ({ ...d, w: nw, h: nh }));
      }
      return;
    }
  };

  const onPointerUp = (e) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setPanning(false);

    if (drag?.mode === 'pan') return;
    if (drag?.mode === 'resize-text-width') {
      pushHistory();
      return;
    }
    if (drag?.mode === 'marquee') {
      const m = marquee;
      setMarquee(null);
      if (m && (Math.abs(m.w) > 2 || Math.abs(m.h) > 2)) {
        const r = { x: Math.min(m.x, m.x + m.w), y: Math.min(m.y, m.y + m.h), w: Math.abs(m.w), h: Math.abs(m.h) };
        const ids = elements.filter(el => {
          const bb = bboxOf(el);
          // intersection: any overlap selects (not full containment)
          return bb.x + bb.w >= r.x && bb.x <= r.x + r.w
              && bb.y + bb.h >= r.y && bb.y <= r.y + r.h;
        }).map(el => el.id);
        setSelectedIds(ids);
      }
      return;
    }
    if (drag?.mode === 'move') {
      pushHistory();
      return;
    }
    if (drag?.mode === 'erase') {
      pushHistory();
      return;
    }
    if (drag?.mode === 'draw' && drafting) {
      // commit if non-trivial
      let final = drafting;
      if (final.type === 'freedraw' && final.points.length < 2) {
        setDrafting(null);
        return;
      }
      if ((final.type === 'rectangle' || final.type === 'ellipse' || final.type === 'diamond') && Math.abs(final.w) < 4 && Math.abs(final.h) < 4) {
        setDrafting(null);
        return;
      }
      if ((final.type === 'line' || final.type === 'arrow') && Math.abs(final.w) < 4 && Math.abs(final.h) < 4) {
        setDrafting(null);
        return;
      }
      setElements(prev => [...prev, final]);
      setDrafting(null);
      pushHistory();
      // auto switch back to select after creating, except freedraw
      if (final.type !== 'freedraw') {
        setTool('select');
        setSelectedIds([final.id]);
      }
    }
  };

  const onWheel = (e) => {
    e.preventDefault();
    const rect = svgRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    if (e.ctrlKey || e.metaKey) {
      // zoom
      const delta = -e.deltaY * 0.0025;
      setView(v => {
        const nextScale = Math.min(8, Math.max(0.1, v.scale * (1 + delta)));
        const k = nextScale / v.scale;
        return { x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k, scale: nextScale };
      });
    } else {
      // pan
      setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    }
  };

  // Commit text
  const commitText = () => {
    const et = editingTextRef.current;
    commitTextValue(et);
    // if editing existing, restore _editing flag off
    if (et && et.editingId) {
      setElements(prev => prev.map(e => {
        if (e.id !== et.editingId) return e;
        const { _editing, ...rest } = e;
        // if text was cleared, remove the element
        if (!et.text.trim()) return null;
        return rest;
      }).filter(Boolean));
      if (!et.text.trim()) pushHistory();
    }
    setEditingText(null);
  };

  // Keyboard
  useEffect(() => {
    const onKey = (e) => {
      const target = e.target;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      const hasCommand = e.metaKey || e.ctrlKey;
      if (hasCommand && e.key.toLowerCase() === 'c') {
        if (!selectedIds.length) return;
        const selected = elements.filter((el) => selectedIds.includes(el.id));
        if (!selected.length) return;
        clipboardRef.current = cloneElements(selected);
        e.preventDefault();
        return;
      }
      if (hasCommand && e.key.toLowerCase() === 'v') {
        const copied = clipboardRef.current;
        if (!copied.length) return;
        const sourceBounds = bboxUnion(copied);
        if (!sourceBounds) return;
        const sourceCenter = {
          x: sourceBounds.x + sourceBounds.w / 2,
          y: sourceBounds.y + sourceBounds.h / 2,
        };
        const cursor = cursorWorldRef.current;
        const fallbackCursor = cursor || {
          x: (window.innerWidth / 2 - view.x) / view.scale,
          y: (window.innerHeight / 2 - view.y) / view.scale,
        };
        const dx = fallbackCursor.x - sourceCenter.x;
        const dy = fallbackCursor.y - sourceCenter.y;
        const pasted = cloneElements(copied).map((el) => {
          const { _editing, ...rest } = el;
          return {
            ...rest,
            id: newId(),
            seed: newSeed(),
            x: el.x + dx,
            y: el.y + dy,
          };
        });
        const pastedIds = pasted.map((el) => el.id);
        setElements((prev) => [...prev, ...pasted]);
        setSelectedIds(pastedIds);
        pushHistory();
        e.preventDefault();
        return;
      }
      if (e.code === 'Space' && !spaceDown) { setSpaceDown(true); e.preventDefault(); }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length) {
          setElements(prev => prev.filter(el => !selectedIds.includes(el.id)));
          setSelectedIds([]);
          pushHistory();
          e.preventDefault();
        }
      }
      if (e.key === 'Escape') {
        setSelectedIds([]);
        setTool('select');
      }
    };
    const onUp = (e) => { if (e.code === 'Space') setSpaceDown(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onUp); };
  }, [selectedIds, elements, spaceDown, view, pushHistory, setElements, setSelectedIds, setTool]);

  // Selection bbox (union)
  const selectionBBox = useMemo(() => {
    if (!selectedIds.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of selectedIds) {
      const el = elements.find(e => e.id === id);
      if (!el) continue;
      const bb = bboxOf(el);
      if (bb.x < minX) minX = bb.x;
      if (bb.y < minY) minY = bb.y;
      if (bb.x + bb.w > maxX) maxX = bb.x + bb.w;
      if (bb.y + bb.h > maxY) maxY = bb.y + bb.h;
    }
    if (!isFinite(minX)) return null;
    return { x: minX - 6, y: minY - 6, w: maxX - minX + 12, h: maxY - minY + 12 };
  }, [selectedIds, elements]);

  // Grid pattern (in screen space, but offset by view)
  const gridSize = 20;
  const gridOffsetX = ((view.x % (gridSize * view.scale)) + (gridSize * view.scale)) % (gridSize * view.scale);
  const gridOffsetY = ((view.y % (gridSize * view.scale)) + (gridSize * view.scale)) % (gridSize * view.scale);

  const dataTool = panning || spaceDown ? 'hand' : tool;

  return (
    <>
      <svg
        ref={svgRef}
        className="wb-canvas"
        data-tool={dataTool}
        data-panning={panning || spaceDown}
        data-hover-element={!!hoverId}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id="wb-grid" width={gridSize * view.scale} height={gridSize * view.scale} patternUnits="userSpaceOnUse"
            x={gridOffsetX} y={gridOffsetY}>
            <circle cx="0.5" cy="0.5" r=".75" fill="rgb(var(--wb-grid))"/>
          </pattern>
          <marker id="wb-arrow-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/>
          </marker>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="url(#wb-grid)"/>

        <g transform={`translate(${view.x}, ${view.y}) scale(${view.scale})`}>
          {/* selection ghosts */}
          {selectedIds.map(id => {
            const el = elements.find(e => e.id === id);
            if (!el) return null;
            const bb = bboxOf(el);
            return (
              <rect key={id}
                x={bb.x - 3} y={bb.y - 3}
                width={bb.w + 6} height={bb.h + 6}
                fill="rgb(var(--wb-selection) / .05)"
                stroke="rgb(var(--wb-selection) / .8)"
                strokeWidth={1.2 / view.scale}
                strokeDasharray={`${5 / view.scale} ${4 / view.scale}`}
              />
            );
          })}

          {/* right-edge width handle for a single selected text element */}
          {selectedIds.length === 1 && (() => {
            const el = elements.find(e => e.id === selectedIds[0]);
            if (!el || el.type !== 'text') return null;
            const bb = bboxOf(el);
            const hx = bb.x + bb.w + 3;
            const hy = bb.y + bb.h / 2;
            const r = 5 / view.scale;
            return (
              <circle
                cx={hx} cy={hy} r={r}
                fill="rgb(var(--wb-selection))"
                stroke="white"
                strokeWidth={1.5 / view.scale}
                style={{ cursor: 'ew-resize' }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  dragRef.current = {
                    mode: 'resize-text-width',
                    elId: el.id,
                    startX: e.clientX,
                    origWidth: el.w,
                  };
                }}
              />
            );
          })()}

          {/* rough.js renders here */}
          <g ref={layerRef}/>

          {/* selection union bbox + handles */}
          {selectionBBox && selectedIds.length > 1 ? (
            <g>
              <rect x={selectionBBox.x} y={selectionBBox.y}
                width={selectionBBox.w} height={selectionBBox.h}
                fill="none"
                stroke="rgb(var(--wb-selection))"
                strokeWidth={1.2 / view.scale}
                strokeDasharray={`${6 / view.scale} ${4 / view.scale}`}/>
            </g>
          ) : null}

          {/* marquee */}
          {marquee ? (
            <rect
              x={Math.min(marquee.x, marquee.x + marquee.w)}
              y={Math.min(marquee.y, marquee.y + marquee.h)}
              width={Math.abs(marquee.w)}
              height={Math.abs(marquee.h)}
              className="wb-selection-rect"
              strokeWidth={1 / view.scale}
              strokeDasharray={`${4 / view.scale} ${3 / view.scale}`}
            />
          ) : null}
        </g>
      </svg>

      {editingText ? (() => {
        const fs = editingText.fontSize;
        const m = measureTextRuns(editingText.textRuns || [], fs, editingText.manualWidth);
        const w = Math.max(m.w, fs * 0.6) * view.scale;
        const h = Math.max(m.h, fs * 1.15) * view.scale;
        const align = editingText.textAlign || 'center';
        const xWorld = editingText.anchorX != null
          ? xFromAnchor(editingText.anchorX, Math.max(m.w, fs * 0.6), align)
          : editingText.x;
        const yWorld = editingText.y;
        return (
          <div
            ref={textEditorRef}
            className="wb-text-input"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            onInput={(e) => {
              const runs = runsFromEditor(e.currentTarget, editingText.stroke || style.stroke);
              const text = textFromRuns(runs);
              setEditingText((prev) => prev ? { ...prev, textRuns: runs, text } : prev);
            }}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setEditingText(null); }
              if (e.key === 'Enter' && e.metaKey) { e.preventDefault(); commitText(); }
            }}
            style={{
              left: xWorld * view.scale + view.x,
              top: yWorld * view.scale + view.y,
              fontSize: fs * view.scale,
              color: editingText.stroke,
              textAlign: align,
              width: w,
              height: h,
              whiteSpace: editingText.manualWidth ? 'pre-wrap' : 'pre',
              overflow: 'hidden',
              wordBreak: 'break-word',
            }}
          />
        );
      })() : null}
    </>
  );
}

// =================================================================
// renderElement(rc, el) -> SVGGElement
// =================================================================
function renderElement(rc, el) {
  const opts = roughOptions(el);
  if (el.type === 'rectangle') {
    const bb = bboxOf(el);
    if (el.edge === 'round') {
      const r = Math.min(20, Math.min(bb.w, bb.h) / 4);
      return rc.path(roundRectPath(bb.x, bb.y, bb.w, bb.h, r), opts);
    }
    return rc.rectangle(bb.x, bb.y, bb.w, bb.h, opts);
  }
  if (el.type === 'ellipse') {
    const bb = bboxOf(el);
    return rc.ellipse(bb.x + bb.w / 2, bb.y + bb.h / 2, bb.w, bb.h, opts);
  }
  if (el.type === 'diamond') {
    const bb = bboxOf(el);
    const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
    const points = [
      [cx, bb.y],
      [bb.x + bb.w, cy],
      [cx, bb.y + bb.h],
      [bb.x, cy],
    ];
    return rc.polygon(points, opts);
  }
  if (el.type === 'line') {
    return rc.line(el.x, el.y, el.x + el.w, el.y + el.h, opts);
  }
  if (el.type === 'arrow') {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.appendChild(rc.line(el.x, el.y, el.x + el.w, el.y + el.h, opts));
    // arrowhead
    const ang = Math.atan2(el.h, el.w);
    const len = 14 + (el.strokeWidth ?? 1.6) * 1.5;
    const ah = 0.45;
    const x2 = el.x + el.w, y2 = el.y + el.h;
    const ax1 = x2 - Math.cos(ang - ah) * len;
    const ay1 = y2 - Math.sin(ang - ah) * len;
    const ax2 = x2 - Math.cos(ang + ah) * len;
    const ay2 = y2 - Math.sin(ang + ah) * len;
    g.appendChild(rc.line(x2, y2, ax1, ay1, opts));
    g.appendChild(rc.line(x2, y2, ax2, ay2, opts));
    return g;
  }
  if (el.type === 'freedraw' && el.points && el.points.length >= 2) {
    const pts = el.points.map(([px, py]) => [el.x + px, el.y + py]);
    return rc.curve(pts, { ...opts, roughness: 0, fill: undefined });
  }
  if (el.type === 'text') {
    if (el._editing) return null;
    const fs = el.fontSize || 22;
    const align = el.textAlign || 'center';
    const runs = ensureRunsFromElement(el, el.stroke || '#1e1e1e');
    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', el.x);
    fo.setAttribute('y', el.y);
    fo.setAttribute('width', (el.w || 0) + 4);
    fo.setAttribute('height', (el.h || 0) + 4);
    fo.style.overflow = 'visible';
    const div = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    div.style.cssText = `font-family:'Excalifont','Caveat','Comic Sans MS',cursive;font-weight:400;font-size:${fs}px;line-height:1.15;white-space:pre-wrap;word-break:break-word;text-align:${align};width:${el.manualWidth ? el.manualWidth + 'px' : 'max-content'};user-select:none;pointer-events:none;`;
    div.innerHTML = runsToEditableHtml(runs);
    fo.appendChild(div);
    return fo;
  }
  return null;
}

function roundRectPath(x, y, w, h, r) {
  const sx = w < 0 ? x + w : x;
  const sy = h < 0 ? y + h : y;
  const aw = Math.abs(w), ah = Math.abs(h);
  const rr = Math.min(r, aw / 2, ah / 2);
  return `M ${sx + rr} ${sy} L ${sx + aw - rr} ${sy} Q ${sx + aw} ${sy} ${sx + aw} ${sy + rr} L ${sx + aw} ${sy + ah - rr} Q ${sx + aw} ${sy + ah} ${sx + aw - rr} ${sy + ah} L ${sx + rr} ${sy + ah} Q ${sx} ${sy + ah} ${sx} ${sy + ah - rr} L ${sx} ${sy + rr} Q ${sx} ${sy} ${sx + rr} ${sy} Z`;
}

export const WBCanvas = forwardRef(Canvas);
export { newSeed, newId, bboxOf, hitTest, STROKE_PALETTE, FILL_PALETTE };
