import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WBCanvas, newSeed, newId } from './whiteboard-canvas';
import {
  Toolbar as WBToolbar,
  PropsPanel as WBPropsPanel,
  BoardSwitcher as WBBoardSwitcher,
  HistoryControls as WBHistoryControls,
  BrandChip as WBBrandChip,
  Hint as WBHint,
} from './whiteboard-toolbar';
import {
  TweaksPanel,
  useTweaks,
  TweakSection,
  TweakRadio,
  TweakColor,
  TweakToggle,
  TweakSlider,
} from './tweaks-panel';
import { useBoardElements, useBoardPalettes, useBoardViewport } from './useBoardPersistence';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { parseYouTubeUrl, uploadBoardImage } from './whiteboardMedia';

// ============= Tweaks =============
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "accent": "#5B7CFA",
  "sketchiness": 1,
  "showGrid": true,
  "showLibrary": true
}/*EDITMODE-END*/;
const DEFAULT_STROKE_LIGHT_BG = '#1e1e1e';
const DEFAULT_STROKE_DARK_BG = '#ffffff';

function normalizeHexColor(color) {
  return typeof color === 'string' ? color.trim().toLowerCase() : '';
}

function getDefaultStrokeForBackground(color) {
  const match = normalizeHexColor(color).match(/^#?([0-9a-f]{6})$/i);
  if (!match) return DEFAULT_STROKE_LIGHT_BG;
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128 ? DEFAULT_STROKE_DARK_BG : DEFAULT_STROKE_LIGHT_BG;
}

function getCanvasBgForTheme(theme, resolvedTheme) {
  if (theme === 'grey' || theme === 'dark') return '#1e1e1e';
  if (theme === 'warm') return '#f1efe7';
  if (theme === 'system') return resolvedTheme === 'dark' ? '#1e1e1e' : '#ffffff';
  return '#ffffff';
}

function isReversibleMonoStroke(color) {
  const normalized = normalizeHexColor(color);
  return normalized === '#ffffff' || normalized === '#1e1e1e';
}

function applyTweaks(t) {
  const root = document.documentElement;
  root.dataset.theme = t.theme;
  const hex = t.accent || '#5B7CFA';
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (m) {
    const r = parseInt(m[1],16), g = parseInt(m[2],16), b = parseInt(m[3],16);
    root.style.setProperty('--accent', `${r} ${g} ${b}`);
  }
}

// ============= Sample / starter elements =============
function makeStarterElements() {
  const seed = () => Math.floor(Math.random() * 2 ** 31);
  return [
    { id: 'st1', type: 'rectangle', x: 280, y: 120, w: 240, h: 130,
      stroke: '#1e1e1e', fill: '#ffe5b8', fillStyle: 'hachure', strokeWidth: 2, roughness: 1, edge: 'round', seed: seed() },
    { id: 'st2', type: 'text', x: 308, y: 150, w: 200, h: 60,
      text: 'Living room\nlayout sketch', fontSize: 24, stroke: '#1e1e1e', seed: seed() },
    { id: 'st3', type: 'ellipse', x: 580, y: 130, w: 130, h: 130,
      stroke: '#1971c2', fill: '#d0e7ff', fillStyle: 'hachure', strokeWidth: 2, roughness: 1, edge: 'sharp', seed: seed() },
    { id: 'st4', type: 'text', x: 605, y: 170, w: 100, h: 50,
      text: 'sofa', fontSize: 26, stroke: '#1971c2', seed: seed() },
    { id: 'st5', type: 'arrow', x: 525, y: 195, w: 50, h: 0,
      stroke: '#1e1e1e', strokeWidth: 1.6, roughness: 1, fill: 'transparent', seed: seed() },
    { id: 'st6', type: 'diamond', x: 280, y: 320, w: 180, h: 110,
      stroke: '#2f9e44', fill: '#d3f0d9', fillStyle: 'cross-hatch', strokeWidth: 2, roughness: 1.5, edge: 'sharp', seed: seed() },
    { id: 'st7', type: 'text', x: 318, y: 348, w: 140, h: 40,
      text: 'rug area', fontSize: 22, stroke: '#2f9e44', seed: seed() },
    { id: 'st8', type: 'rectangle', x: 540, y: 320, w: 180, h: 110,
      stroke: '#e03131', fill: 'transparent', strokeWidth: 2, roughness: 2, edge: 'sharp', seed: seed() },
    { id: 'st9', type: 'text', x: 568, y: 348, w: 140, h: 40,
      text: 'bookshelf?', fontSize: 22, stroke: '#e03131', seed: seed() },
    { id: 'st10', type: 'arrow', x: 460, y: 375, w: 80, h: 0,
      stroke: '#1e1e1e', strokeWidth: 1.6, roughness: 1, fill: 'transparent', seed: seed() },
    { id: 'st11', type: 'freedraw', x: 760, y: 140, w: 0, h: 0,
      points: [[0,0],[10,-15],[24,-22],[40,-18],[55,-5],[60,15],[55,38],[40,52],[20,55],[5,46],[-3,28],[0,8]],
      stroke: '#9c36b5', fill: 'transparent', strokeWidth: 2, roughness: 0, seed: seed() },
    { id: 'st12', type: 'text', x: 770, y: 230, w: 80, h: 30,
      text: 'tv?', fontSize: 22, stroke: '#9c36b5', seed: seed() },
    { id: 'st13', type: 'text', x: 200, y: 60, w: 200, h: 40,
      text: '✦ House plan', fontSize: 32, stroke: '#1e1e1e', seed: seed() },
    { id: 'st14', type: 'line', x: 200, y: 105, w: 580, h: 0,
      stroke: '#1e1e1e', strokeWidth: 1, roughness: 0.5, fill: 'transparent', seed: seed() },
  ];
}

function YouTubeModal({ value, onChange, onConfirm, onClose }) {
  return (
    <div className="wb-bgpicker-overlay">
      <div className="wb-bgpicker-card">
        <div className="wb-bgpicker-title">Embed YouTube video</div>
        <div className="wb-bgpicker-sub">Paste a YouTube URL to add it to the board.</div>
        <div className="wb-bgpicker-row" style={{ marginTop: 14 }}>
          <input
            className="wb-color-picker-hex"
            type="text"
            value={value}
            placeholder="https://www.youtube.com/watch?v=..."
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onConfirm();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
          />
        </div>
        <div className="wb-bgpicker-row">
          <div className="wb-bgpicker-actions" style={{ marginLeft: 'auto' }}>
            <button className="wb-bgpicker-cancel" onClick={onClose}>Cancel</button>
            <button className="wb-bgpicker-confirm" onClick={onConfirm}>Embed</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function isEditableTarget(target) {
  const tag = target?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable;
}

function fileExtFromName(name) {
  if (!name) return undefined;
  const parts = name.split('.');
  if (parts.length < 2) return undefined;
  return parts[parts.length - 1];
}

// ============= App =============
export function Whiteboard({ boardId, onCanonicalSlugResolved }) {
  const { user } = useAuth();
  const { theme, resolvedTheme } = useTheme();
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  useEffect(() => { applyTweaks(tweaks); }, [tweaks]);

  const [tool, setTool] = useState('select');
  const {
    elements,
    setElements,
    ready: elementsReady,
    boardRowId,
    canonicalSlug,
  } = useBoardElements(boardId, makeStarterElements);
  const [selectedIds, setSelectedIds] = useState([]);
  const { initialView, saveView } = useBoardViewport(boardId, boardRowId);
  const [view, setView] = useState(initialView);
  const canvasRef = useRef(null);
  const imageInputRef = useRef(null);
  const [isEditingText, setIsEditingText] = useState(false);
  const [youtubeModalOpen, setYoutubeModalOpen] = useState(false);
  const [youtubeInput, setYoutubeInput] = useState('');
  const [mediaBusy, setMediaBusy] = useState(false);

  const [style, setStyle] = useState({
    stroke: DEFAULT_STROKE_LIGHT_BG,
    fill: 'transparent',
    fillStyle: 'hachure',
    strokeWidth: 2,
    roughness: 1,
    textAlign: 'center',
    edge: 'sharp',
  });

  const {
    strokePalette,
    setStrokePalette,
    fillPalette,
    setFillPalette,
  } = useBoardPalettes(boardId, boardRowId);
  const canvasBg = getCanvasBgForTheme(theme, resolvedTheme);

  useEffect(() => {
    if (!canonicalSlug || !onCanonicalSlugResolved) return;
    onCanonicalSlugResolved(canonicalSlug);
  }, [canonicalSlug, onCanonicalSlugResolved]);
  const addStrokeColor = (c) => setStrokePalette(p => p.includes(c) ? p : [...p, c]);
  const addFillColor = (c) => setFillPalette(p => p.includes(c) ? p : [...p, c]);
  const removeStrokeColor = (c) => setStrokePalette(p => p.filter(x => x !== c));
  const removeFillColor = (c) => setFillPalette(p => p.filter(x => x !== c));

  useEffect(() => {
    setView(initialView);
  }, [initialView]);
  useEffect(() => {
    saveView(view);
  }, [saveView, view]);
  useEffect(() => {
    const targetStroke = getDefaultStrokeForBackground(canvasBg);
    if (!elementsReady) return;
    let changedCount = 0;
    setElements((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.map((el) => {
        let changed = false;
        let nextStroke = el.stroke;
        if (isReversibleMonoStroke(el.stroke)) {
          nextStroke = targetStroke;
          changed = nextStroke !== el.stroke;
        }

        let nextRuns = el.textRuns;
        if (Array.isArray(el.textRuns) && el.textRuns.length) {
          let runsChanged = false;
          const mapped = el.textRuns.map((run) => {
            if (!isReversibleMonoStroke(run?.color)) return run;
            const nextColor = targetStroke;
            if (nextColor === run.color) return run;
            runsChanged = true;
            return { ...run, color: nextColor };
          });
          if (runsChanged) {
            nextRuns = mapped;
            changed = true;
          }
        }

        let nextLines = el.lines;
        if (Array.isArray(el.lines) && el.lines.length) {
          let linesChanged = false;
          const mappedLines = el.lines.map((line) => {
            if (!Array.isArray(line?.runs) || line.runs.length === 0) return line;
            let lineRunsChanged = false;
            const mappedRuns = line.runs.map((run) => {
              if (!isReversibleMonoStroke(run?.color)) return run;
              const nextColor = targetStroke;
              if (nextColor === run.color) return run;
              lineRunsChanged = true;
              return { ...run, color: nextColor };
            });
            if (!lineRunsChanged) return line;
            linesChanged = true;
            return { ...line, runs: mappedRuns };
          });
          if (linesChanged) {
            nextLines = mappedLines;
            changed = true;
          }
        }

        if (!changed) return el;
        changedCount += 1;
        return {
          ...el,
          stroke: nextStroke,
          ...(nextRuns !== el.textRuns ? { textRuns: nextRuns } : {}),
          ...(nextLines !== el.lines ? { lines: nextLines } : {}),
        };
      });
      const result = changedCount > 0 ? next : prev;
      return result;
    });
  }, [boardId, canvasBg, elementsReady, setElements]);
  useEffect(() => {
    const color = canvasBg;
    // convert hex -> r g b for the css variable
    const m = color.match(/^#([0-9a-f]{6})$/i);
    if (m) {
      const r = parseInt(m[1].slice(0,2),16), g = parseInt(m[1].slice(2,4),16), b = parseInt(m[1].slice(4,6),16);
      document.documentElement.style.setProperty('--wb-canvas', `${r} ${g} ${b}`);
    }
  }, [canvasBg]);

  // Sync sketchiness tweak -> style default
  useEffect(() => {
    setStyle(s => ({ ...s, roughness: tweaks.sketchiness }));
  }, [tweaks.sketchiness]);

  // Show grid
  useEffect(() => {
    const stage = document.querySelector('.wb-stage');
    if (stage) stage.style.setProperty('--wb-grid-display', tweaks.showGrid ? 'block' : 'none');
  }, [tweaks.showGrid]);

  // History — seeded once the persisted elements have loaded so undo doesn't
  // revert past the initial state.
  const historyRef = useRef({ stack: [], index: -1 });
  const historySeededRef = useRef(false);
  const [historyTick, setHistoryTick] = useState(0);
  const pushHistory = useCallback(() => {
    setTimeout(() => {
      const h = historyRef.current;
      const snap = JSON.stringify(elementsRef.current);
      if (h.stack[h.index] === snap) return;
      h.stack = h.stack.slice(0, h.index + 1);
      h.stack.push(snap);
      if (h.stack.length > 100) h.stack.shift();
      h.index = h.stack.length - 1;
      setHistoryTick(t => t + 1);
    }, 0);
  }, []);
  const elementsRef = useRef(elements);
  useEffect(() => { elementsRef.current = elements; }, [elements]);
  useEffect(() => {
    if (!elementsReady) return;
    let changed = false;
    const next = elements.map((el) => {
      if (el.type !== 'text') return el;
      if (Array.isArray(el.textRuns) && el.textRuns.length) return el;
      if (!el.text) return el;
      changed = true;
      return {
        ...el,
        textRuns: [{ text: el.text, color: el.stroke || '#1e1e1e' }],
      };
    });
    if (changed) setElements(next);
  }, [elements, elementsReady, setElements]);

  useEffect(() => {
    if (!elementsReady || historySeededRef.current) return;
    historyRef.current = { stack: [JSON.stringify(elements)], index: 0 };
    historySeededRef.current = true;
    setHistoryTick(t => t + 1);
  }, [elementsReady, elements]);

  const getViewportCenter = useCallback(() => ({
    x: (window.innerWidth / 2 - view.x) / view.scale,
    y: (window.innerHeight / 2 - view.y) / view.scale,
  }), [view.scale, view.x, view.y]);

  const getInsertPoint = useCallback(() => {
    return canvasRef.current?.getCursorWorld?.() || getViewportCenter();
  }, [getViewportCenter]);

  const undo = () => {
    const h = historyRef.current;
    if (h.index <= 0) return;
    h.index -= 1;
    setElements(JSON.parse(h.stack[h.index]));
    setSelectedIds([]);
    setHistoryTick(t => t + 1);
  };
  const redo = () => {
    const h = historyRef.current;
    if (h.index >= h.stack.length - 1) return;
    h.index += 1;
    setElements(JSON.parse(h.stack[h.index]));
    setSelectedIds([]);
    setHistoryTick(t => t + 1);
  };

  const insertImageFromFile = useCallback(async (file) => {
    if (!file) return;
    if (!user || !boardRowId) {
      window.alert('Sign in and open a saved board before uploading images.');
      return;
    }
    setMediaBusy(true);
    try {
      const uploaded = await uploadBoardImage(file, fileExtFromName(file.name), {
        userId: user.id,
        boardRowId,
      });
      const maxSide = 480;
      const longest = Math.max(uploaded.w, uploaded.h, 1);
      const scale = Math.min(1, maxSide / longest);
      const width = Math.max(40, Math.round(uploaded.w * scale));
      const height = Math.max(40, Math.round(uploaded.h * scale));
      const point = getInsertPoint();
      const next = {
        id: newId(),
        type: 'image',
        x: point.x - width / 2,
        y: point.y - height / 2,
        w: width,
        h: height,
        src: uploaded.url,
        storagePath: uploaded.path,
        mime: uploaded.mime,
        naturalW: uploaded.w,
        naturalH: uploaded.h,
        seed: newSeed(),
      };
      setElements((prev) => [...prev, next]);
      setSelectedIds([next.id]);
      setTool('select');
      pushHistory();
      // Intentional for now: deleting an image element does not delete its storage object.
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Failed to import image.');
    } finally {
      setMediaBusy(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  }, [boardRowId, getInsertPoint, pushHistory, setElements, user]);

  const insertYouTubeFromUrl = useCallback((url) => {
    const parsed = parseYouTubeUrl(url);
    if (!parsed) {
      window.alert('Please paste a valid YouTube URL.');
      return false;
    }
    const point = getInsertPoint();
    const width = 480;
    const height = 270;
    const next = {
      id: newId(),
      type: 'embed',
      provider: 'youtube',
      x: point.x - width / 2,
      y: point.y - height / 2,
      w: width,
      h: height,
      videoId: parsed.videoId,
      startSeconds: parsed.start,
      seed: newSeed(),
    };
    setElements((prev) => [...prev, next]);
    setSelectedIds([next.id]);
    setTool('select');
    pushHistory();
    return true;
  }, [getInsertPoint, pushHistory, setElements]);

  const handleToolbarAction = useCallback((actionId) => {
    if (actionId === 'image') {
      imageInputRef.current?.click();
      return;
    }
    if (actionId === 'youtube') {
      setYoutubeInput('');
      setYoutubeModalOpen(true);
    }
  }, []);

  const submitYoutubeModal = useCallback(() => {
    if (insertYouTubeFromUrl(youtubeInput)) {
      setYoutubeModalOpen(false);
      setYoutubeInput('');
    }
  }, [insertYouTubeFromUrl, youtubeInput]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const target = e.target;
      if (youtubeModalOpen) return;
      if (isEditableTarget(target)) return;
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === 'z' && !e.shiftKey) { undo(); e.preventDefault(); return; }
      if ((e.metaKey || e.ctrlKey) && (k === 'z' && e.shiftKey || k === 'y')) { redo(); e.preventDefault(); return; }
      const map = {
        v: 'select', h: 'hand', r: 'rectangle', d: 'diamond', o: 'ellipse',
        a: 'arrow', l: 'line', b: 'freedraw', t: 'text', e: 'eraser',
      };
      if (map[k] && !e.metaKey && !e.ctrlKey) { setTool(map[k]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [youtubeModalOpen]);

  useEffect(() => {
    const onPaste = async (e) => {
      const target = e.target;
      if (youtubeModalOpen || isEditableTarget(target)) return;
      if (mediaBusy) return;
      const items = Array.from(e.clipboardData?.items || []);
      if (!items.length) return;

      const imageFiles = [];
      for (const item of items) {
        if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }

      if (imageFiles.length) {
        e.preventDefault();
        for (const file of imageFiles) {
          // eslint-disable-next-line no-await-in-loop
          await insertImageFromFile(file);
        }
        return;
      }

      const textItem = items.find((item) => item.kind === 'string' && item.type === 'text/plain');
      if (!textItem) return;
      const pastedText = await new Promise((resolve) => {
        textItem.getAsString((value) => resolve(value || ''));
      });
      if (!parseYouTubeUrl(String(pastedText).trim())) return;
      e.preventDefault();
      insertYouTubeFromUrl(String(pastedText).trim());
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [insertImageFromFile, insertYouTubeFromUrl, mediaBusy, youtubeModalOpen]);

  const canUndo = historyRef.current.index > 0;
  const canRedo = historyRef.current.index < historyRef.current.stack.length - 1;
  void historyTick;

  const applyStyleChange = useCallback((key, value) => {
    setStyle((s) => ({ ...s, [key]: value }));

    if (key === 'stroke' && canvasRef.current?.applyEditingTextColor?.(value)) return;

    if (!selectedIds.length) return;

    const selectedSet = new Set(selectedIds);
    const fillableTypes = new Set(['rectangle', 'ellipse', 'diamond']);
    const edgeTypes = new Set(['rectangle', 'diamond']);
    const drawableTypes = new Set(['rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'freedraw']);
    let changed = false;

    const next = elements.map((el) => {
      if (!selectedSet.has(el.id)) return el;

      if (key === 'stroke') {
        if (el.stroke === value) return el;
        changed = true;
        if (el.type === 'text') {
          const textRuns = Array.isArray(el.textRuns) && el.textRuns.length
            ? [{ text: (el.textRuns || []).map((r) => r.text || '').join(''), color: value }]
            : [{ text: el.text || '', color: value }];
          return { ...el, stroke: value, textRuns };
        }
        return { ...el, stroke: value };
      }
      if (key === 'fill') {
        if (!fillableTypes.has(el.type) || el.fill === value) return el;
        changed = true;
        return { ...el, fill: value };
      }
      if (key === 'fillStyle') {
        if (!fillableTypes.has(el.type) || el.fillStyle === value) return el;
        changed = true;
        return { ...el, fillStyle: value };
      }
      if (key === 'strokeWidth') {
        if (!drawableTypes.has(el.type) || el.strokeWidth === value) return el;
        changed = true;
        return { ...el, strokeWidth: value };
      }
      if (key === 'roughness') {
        if (!drawableTypes.has(el.type) || el.roughness === value) return el;
        changed = true;
        return { ...el, roughness: value };
      }
      if (key === 'edge') {
        if (!edgeTypes.has(el.type) || el.edge === value) return el;
        changed = true;
        return { ...el, edge: value };
      }
      if (key === 'textAlign') {
        if (el.type !== 'text' || el.textAlign === value) return el;
        changed = true;
        return { ...el, textAlign: value };
      }
      return el;
    });

    if (changed) {
      setElements(next);
      pushHistory();
    }
  }, [elements, pushHistory, selectedIds, setElements]);

  return (
    <div className="wb-shell">
      <div className="wb-stage">
        <WBCanvas
          ref={canvasRef}
          tool={tool} setTool={setTool}
          style={style}
          elements={elements} setElements={setElements}
          selectedIds={selectedIds} setSelectedIds={setSelectedIds}
          view={view} setView={setView}
          pushHistory={pushHistory}
          onEditingTextStateChange={setIsEditingText}
        />

        <WBBrandChip/>
        <WBToolbar tool={tool} setTool={setTool} onAction={handleToolbarAction}/>
        <WBPropsPanel
          style={style}
          onStyleChange={applyStyleChange}
          hasSelection={selectedIds.length > 0 || isEditingText}
          strokePalette={strokePalette}
          fillPalette={fillPalette}
          onAddStrokeColor={addStrokeColor}
          onAddFillColor={addFillColor}
          onRemoveStrokeColor={removeStrokeColor}
          onRemoveFillColor={removeFillColor}
        />
        <WBHistoryControls canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo}/>
        {tweaks.showLibrary ? <WBBoardSwitcher currentBoardId={boardId}/> : null}
        <WBHint/>
        {youtubeModalOpen ? (
          <YouTubeModal
            value={youtubeInput}
            onChange={setYoutubeInput}
            onClose={() => setYoutubeModalOpen(false)}
            onConfirm={submitYoutubeModal}
          />
        ) : null}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (!files.length || mediaBusy) return;
            void (async () => {
              for (const file of files) {
                await insertImageFromFile(file);
              }
            })();
          }}
        />
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection title="Appearance">
          <TweakRadio label="Theme" value={tweaks.theme}
            onChange={(v) => setTweak('theme', v)}
            options={[{ value:'light', label:'Light' }, { value:'dark', label:'Dark' }]}/>
          <TweakColor label="Accent" value={tweaks.accent}
            onChange={(v) => setTweak('accent', v)}
            options={['#5B7CFA','#0A5BFF','#7B5EE6','#21A06A','#E45D2E','#1F1F1F']}/>
        </TweakSection>
        <TweakSection title="Drawing">
          <TweakSlider label="Sketchiness" value={tweaks.sketchiness}
            min={0} max={2} step={1}
            onChange={(v) => setTweak('sketchiness', v)}/>
        </TweakSection>
        <TweakSection title="Canvas">
          <TweakToggle label="Dot grid" value={tweaks.showGrid}
            onChange={(v) => setTweak('showGrid', v)}/>
          <TweakToggle label="Board switcher" value={tweaks.showLibrary}
            onChange={(v) => setTweak('showLibrary', v)}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

