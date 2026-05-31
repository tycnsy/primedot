import React, { useState, useEffect, useRef, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import rough from 'roughjs';
import { getStroke } from 'perfect-freehand';

// =================================================================
// Element model
// =================================================================
// element:
// - shape/text: { id, type, x, y, w, h, points?, text?, fontSize?,
//                 stroke, fill, fillStyle, strokeWidth, roughness, edge, seed }
// - image: { id, type:'image', x, y, w, h, src, storagePath, mime, naturalW, naturalH, seed }
// - embed: { id, type:'embed', provider:'youtube', x, y, w, h, videoId, startSeconds?, seed }

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

function isBlockTag(tag) {
  return tag === 'DIV' || tag === 'P';
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

    const isBlock = isBlockTag(tag);
    const childNodes = Array.from(node.childNodes);
    for (const child of childNodes) walk(child, color);
    if (isBlock && out.length) {
      const last = out[out.length - 1];
      if (!last.text.endsWith('\n')) append('\n', color);
    }
  };

  for (const child of Array.from(root.childNodes)) {
    // Browsers often insert a block sibling on Enter in contentEditable.
    // Preserve the boundary as a real newline before normalization.
    if (child.nodeType === Node.ELEMENT_NODE && isBlockTag(child.tagName) && out.length) {
      const last = out[out.length - 1];
      if (!last.text.endsWith('\n')) append('\n', fallbackColor);
    }
    walk(child, fallbackColor);
  }
  const normalized = normalizeTextRuns(out, fallbackColor);
  if (normalized.length) {
    normalized[normalized.length - 1].text = normalized[normalized.length - 1].text.replace(/\n+$/, '');
  }
  return normalizeTextRuns(normalized, fallbackColor);
}

function insertEditorLineBreak(root) {
  if (document.queryCommandSupported?.('insertLineBreak')) {
    document.execCommand('insertLineBreak');
    return;
  }
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const br = document.createElement('br');
  range.insertNode(br);
  // If newline is inserted at the end, add a trailing break so caret can move.
  if (!br.nextSibling) {
    const tail = document.createElement('br');
    br.parentNode?.insertBefore(tail, br.nextSibling);
  }
  range.setStartAfter(br);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  root.focus();
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

// =================================================================
// Lines model (numbered/bullet/checkbox list support)
// =================================================================
const LINE_KINDS = ['normal', 'bullet', 'numbered', 'checkbox'];

function normalizeLineKind(kind) {
  return LINE_KINDS.includes(kind) ? kind : 'normal';
}

function normalizeLines(lines, fallbackColor = '#1e1e1e') {
  if (!Array.isArray(lines) || !lines.length) return [];
  return lines.map((line) => {
    const kind = normalizeLineKind(line?.kind);
    const runs = normalizeTextRuns(line?.runs, fallbackColor);
    const out = { kind, runs };
    if (kind === 'checkbox') out.checked = !!line?.checked;
    return out;
  });
}

function linesFromRuns(runs, fallbackColor = '#1e1e1e') {
  const safeRuns = normalizeTextRuns(runs, fallbackColor);
  const lines = [];
  let currentRuns = [];
  for (const run of safeRuns) {
    let text = run.text || '';
    if (!text) continue;
    let idx;
    while ((idx = text.indexOf('\n')) !== -1) {
      const head = text.slice(0, idx);
      if (head) currentRuns.push({ text: head, color: run.color });
      lines.push({ kind: 'normal', runs: normalizeTextRuns(currentRuns, fallbackColor) });
      currentRuns = [];
      text = text.slice(idx + 1);
    }
    if (text) currentRuns.push({ text, color: run.color });
  }
  lines.push({ kind: 'normal', runs: normalizeTextRuns(currentRuns, fallbackColor) });
  return lines;
}

function runsFromLines(lines, fallbackColor = '#1e1e1e') {
  const safeLines = normalizeLines(lines, fallbackColor);
  if (!safeLines.length) return [];
  const out = [];
  safeLines.forEach((line, idx) => {
    for (const run of line.runs) {
      if (run.text) out.push({ text: run.text, color: run.color });
    }
    if (idx < safeLines.length - 1) {
      const tailColor = line.runs[line.runs.length - 1]?.color
        || safeLines[idx + 1].runs[0]?.color
        || fallbackColor;
      out.push({ text: '\n', color: tailColor });
    }
  });
  return normalizeTextRuns(out, fallbackColor);
}

function textFromLines(lines) {
  if (!Array.isArray(lines)) return '';
  return lines.map((line) => (line.runs || []).map((r) => r.text || '').join('')).join('\n');
}

function ensureLinesFromElement(el, fallbackColor = '#1e1e1e') {
  const stroke = el?.stroke || fallbackColor;
  const lines = normalizeLines(el?.lines, stroke);
  if (lines.length) return lines;
  const runs = ensureRunsFromElement(el, fallbackColor);
  if (!runs.length) return [{ kind: 'normal', runs: [] }];
  return linesFromRuns(runs, stroke);
}

function computeNumberedSequence(lines) {
  const seq = new Array(lines.length).fill(null);
  let counter = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].kind === 'numbered') {
      counter += 1;
      seq[i] = counter;
    } else {
      counter = 0;
    }
  }
  return seq;
}

function renderLineContentHtml(runs) {
  if (!runs.length) return '<br/>';
  return runs.map((run) => {
    const color = normalizeColor(run.color);
    const htmlText = escapeHtml(run.text).replace(/\n/g, '<br/>');
    return `<span style="color:${color}">${htmlText}</span>`;
  }).join('');
}

function linesToEditableHtml(lines, options = {}) {
  const safeLines = lines && lines.length ? lines : [{ kind: 'normal', runs: [] }];
  const interactiveId = options.interactiveCheckboxElementId || null;
  const numberedSeq = computeNumberedSequence(safeLines);
  return safeLines.map((line, i) => {
    const kind = line.kind || 'normal';
    const checked = kind === 'checkbox' && line.checked ? '1' : '0';
    const checkboxDataAttr = interactiveId
      ? ` data-wb-checkbox="${escapeHtml(String(interactiveId))}:${i}"`
      : '';
    const contentHtml = renderLineContentHtml(line.runs || []);
    if (kind === 'normal') {
      return `<div class="wb-line" data-kind="normal" data-line-index="${i}"><span class="wb-line-content">${contentHtml}</span></div>`;
    }
    let prefixHtml = '';
    if (kind === 'bullet') {
      prefixHtml = `<span class="wb-line-prefix" contenteditable="false">\u2022</span>`;
    } else if (kind === 'numbered') {
      prefixHtml = `<span class="wb-line-prefix" contenteditable="false">${numberedSeq[i]}.</span>`;
    } else if (kind === 'checkbox') {
      prefixHtml = `<span class="wb-line-prefix wb-checkbox" contenteditable="false" data-checked="${checked}"${checkboxDataAttr}></span>`;
    }
    return `<div class="wb-line" data-kind="${kind}" data-line-index="${i}" data-checked="${checked}">${prefixHtml}<span class="wb-line-content">${contentHtml}</span></div>`;
  }).join('');
}

function linesFromEditor(root, fallbackColor = '#1e1e1e') {
  if (!root) return [{ kind: 'normal', runs: [] }];
  const blocks = [];
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE && child.classList?.contains('wb-line')) {
      const kind = normalizeLineKind(child.dataset.kind);
      const contentNode = child.querySelector(':scope > .wb-line-content') || child;
      const runs = runsFromEditor(contentNode, fallbackColor);
      const line = { kind, runs };
      if (kind === 'checkbox') line.checked = child.dataset.checked === '1';
      blocks.push(line);
    } else if (child.nodeType === Node.ELEMENT_NODE && isBlockTag(child.tagName)) {
      const runs = runsFromEditor(child, fallbackColor);
      blocks.push({ kind: 'normal', runs });
    } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName === 'BR') {
      blocks.push({ kind: 'normal', runs: [] });
    } else if (child.nodeType === Node.TEXT_NODE && (child.textContent || '').length) {
      blocks.push({ kind: 'normal', runs: [{ text: child.textContent, color: fallbackColor }] });
    }
  }
  if (!blocks.length) blocks.push({ kind: 'normal', runs: [] });
  return normalizeLines(blocks, fallbackColor);
}

function measureTextLines(lines, fontSize, manualWidth) {
  if (!_wbMeasureDiv) {
    _wbMeasureDiv = document.createElement('div');
    _wbMeasureDiv.style.cssText = 'position:absolute;visibility:hidden;left:-99999px;top:-99999px;font-family:"Excalifont","Caveat","Comic Sans MS",cursive;font-weight:400;line-height:1.15;white-space:pre-wrap;word-break:break-word;padding:0;margin:0;border:0;box-sizing:content-box;';
    document.body.appendChild(_wbMeasureDiv);
  }
  _wbMeasureDiv.style.fontSize = fontSize + 'px';
  _wbMeasureDiv.style.width = manualWidth ? manualWidth + 'px' : 'auto';
  const hasContent = (lines || []).some((line) => (line.runs || []).some((r) => r.text));
  _wbMeasureDiv.innerHTML = hasContent || (lines && lines.length > 1)
    ? linesToEditableHtml(lines)
    : ' ';
  return { w: manualWidth || _wbMeasureDiv.offsetWidth, h: _wbMeasureDiv.offsetHeight };
}

// Autoformat: detect `1. `, `- `, `[ ] ` at the start of a normal line.
function detectListAutoformat(lines, fallbackColor = '#1e1e1e') {
  if (!Array.isArray(lines) || !lines.length) return null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.kind !== 'normal' || !line.runs.length) continue;
    const firstText = line.runs[0].text || '';
    let nextKind = null;
    let prefixLen = 0;
    if (/^\d+\.\s/.test(firstText)) {
      nextKind = 'numbered';
      prefixLen = firstText.indexOf('.') + 2;
    } else if (firstText.startsWith('- ')) {
      nextKind = 'bullet';
      prefixLen = 2;
    } else if (firstText.startsWith('[ ] ')) {
      nextKind = 'checkbox';
      prefixLen = 4;
    }
    if (!nextKind) continue;
    const firstColor = line.runs[0].color;
    const remainder = firstText.slice(prefixLen);
    const nextRuns = remainder
      ? [{ text: remainder, color: firstColor }, ...line.runs.slice(1)]
      : line.runs.slice(1);
    const newLine = { kind: nextKind, runs: normalizeTextRuns(nextRuns, fallbackColor) };
    if (nextKind === 'checkbox') newLine.checked = false;
    const out = lines.slice();
    out[i] = newLine;
    return { lines: normalizeLines(out, fallbackColor), transformedIndex: i };
  }
  return null;
}

function getCaretOffsetWithin(container) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return 0;
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  if (!container.contains(range.startContainer)) return 0;
  const measure = document.createRange();
  measure.setStart(container, 0);
  measure.setEnd(range.startContainer, range.startOffset);
  return measure.toString().length;
}

function findEditingLineFromSelection(root) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  let node = sel.anchorNode;
  while (node && node !== root) {
    if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('wb-line')) {
      const idx = parseInt(node.dataset.lineIndex || '-1', 10);
      if (!Number.isFinite(idx) || idx < 0) return null;
      const content = node.querySelector(':scope > .wb-line-content') || node;
      const charOffset = getCaretOffsetWithin(content);
      return { lineIndex: idx, charOffset, lineEl: node, contentEl: content };
    }
    node = node.parentNode;
  }
  return null;
}

function splitRunsAt(runs, charOffset) {
  let remaining = charOffset;
  const before = [];
  const after = [];
  let done = false;
  for (const run of runs) {
    if (done) {
      after.push(run);
      continue;
    }
    const len = (run.text || '').length;
    if (remaining >= len) {
      before.push(run);
      remaining -= len;
    } else if (remaining > 0) {
      before.push({ text: run.text.slice(0, remaining), color: run.color });
      after.push({ text: run.text.slice(remaining), color: run.color });
      done = true;
      remaining = 0;
    } else {
      after.push(run);
      done = true;
    }
  }
  return { before, after };
}

function placeCaretInLine(root, lineIndex, position = 'end') {
  if (!root) return;
  const line = root.querySelector(`.wb-line[data-line-index="${lineIndex}"]`);
  if (!line) return;
  const content = line.querySelector(':scope > .wb-line-content') || line;
  const children = Array.from(content.childNodes);
  const isEmptyPlaceholder = children.length === 1 && children[0].nodeName === 'BR';
  const range = document.createRange();
  if (isEmptyPlaceholder) {
    range.setStart(content, 0);
    range.collapse(true);
  } else {
    range.selectNodeContents(content);
    range.collapse(position !== 'start');
  }
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
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
    // Tolerance tracks the rendered (pressure-tapered) stroke half-width.
    const tol = Math.max(6, (el.strokeWidth ?? 2) * 4.25 * 0.5);
    for (let i = 1; i < el.points.length; i++) {
      const [a, b] = el.points[i - 1], [c, d] = el.points[i];
      if (distToSegment(px, py, el.x + a, el.y + b, el.x + c, el.y + d) < tol) return true;
    }
    return false;
  }
  if (el.type === 'text') {
    return px >= bb.x - 2 && px <= bb.x + bb.w + 2 && py >= bb.y - 2 && py <= bb.y + bb.h + 2;
  }
  if (el.type === 'image' || el.type === 'embed') {
    return px >= bb.x && px <= bb.x + bb.w && py >= bb.y && py <= bb.y + bb.h;
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

function scaleFromPivot(value, pivot, scale) {
  return pivot + (value - pivot) * scale;
}

function scaleElementFromPivot(el, pivotX, pivotY, scaleX, scaleY) {
  if (el.type === 'freedraw') {
    return {
      ...el,
      x: scaleFromPivot(el.x, pivotX, scaleX),
      y: scaleFromPivot(el.y, pivotY, scaleY),
      points: Array.isArray(el.points) ? el.points.map(([px, py]) => [px * scaleX, py * scaleY]) : el.points,
      w: (el.w || 0) * scaleX,
      h: (el.h || 0) * scaleY,
    };
  }

  if (el.type === 'text') {
    const align = el.textAlign || 'center';
    const lines = ensureLinesFromElement(el, el.stroke || '#1e1e1e');
    const fontScale = Math.sqrt(scaleX * scaleY);
    const fontSize = Math.max(8, (el.fontSize || 22) * fontScale);
    const manualWidth = typeof el.manualWidth === 'number'
      ? Math.max(20, el.manualWidth * scaleX)
      : el.manualWidth;
    const measured = measureTextLines(lines, fontSize, manualWidth);
    const nextAnchor = scaleFromPivot(anchorOf(el), pivotX, scaleX);
    const x = xFromAnchor(nextAnchor, measured.w, align);
    const y = scaleFromPivot(el.y, pivotY, scaleY);
    return { ...el, x, y, w: measured.w, h: measured.h, fontSize, manualWidth };
  }

  const x1 = scaleFromPivot(el.x, pivotX, scaleX);
  const y1 = scaleFromPivot(el.y, pivotY, scaleY);
  const x2 = scaleFromPivot(el.x + el.w, pivotX, scaleX);
  const y2 = scaleFromPivot(el.y + el.h, pivotY, scaleY);
  return { ...el, x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
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
  const drawLayerRef = useRef(null);
  const embedLayerRef = useRef(null);
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
  const [activeEmbedId, setActiveEmbedId] = useState(null);

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
      const selection = window.getSelection();
      const hasSelectionRange = Boolean(selection && selection.rangeCount > 0 && !selection.isCollapsed);
      const fallbackColor = editingTextRef.current.stroke || '#1e1e1e';
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('foreColor', false, color);
      const lines = linesFromEditor(textEditorRef.current, fallbackColor);
      const runs = runsFromLines(lines, fallbackColor);
      const text = textFromLines(lines);
      setEditingText((prev) => prev
        ? { ...prev, stroke: hasSelectionRange ? prev.stroke : color, lines, textRuns: runs, text }
        : prev);
      return true;
    },
    getCursorWorld() {
      return cursorWorldRef.current;
    },
  }), [pushHistory, setElements, setSelectedIds]);

  // Setup rough generator
  useEffect(() => {
    if (svgRef.current && !rcRef.current) {
      rcRef.current = rough.svg(svgRef.current);
    }
  }, []);

  // Render non-embed elements via rough.js (imperative)
  useEffect(() => {
    if (!drawLayerRef.current || !rcRef.current) return;
    const layer = drawLayerRef.current;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    const rc = rcRef.current;
    const list = elements.filter((el) => el.type !== 'embed');
    if (drafting && drafting.type !== 'embed') list.push(drafting);
    for (const el of list) {
      const node = renderElement(rc, el);
      if (node) {
        node.dataset.elId = el.id;
        layer.appendChild(node);
      }
    }
  }, [elements, drafting]);

  // Keep embed nodes mounted and sync their properties to avoid iframe remount flicker.
  useEffect(() => {
    if (!embedLayerRef.current || !rcRef.current) return;
    const layer = embedLayerRef.current;
    const rc = rcRef.current;
    const embeds = elements.filter((el) => el.type === 'embed' && el.provider === 'youtube');
    const nextIds = new Set(embeds.map((el) => el.id));
    const existing = new Map();
    for (const child of Array.from(layer.children)) {
      const id = child?.dataset?.elId;
      if (id) existing.set(id, child);
    }
    for (const [id, node] of existing) {
      if (!nextIds.has(id)) node.remove();
    }
    for (const el of embeds) {
      const isActive = activeEmbedId === el.id;
      const bb = bboxOf(el);
      const start = Number.isFinite(el.startSeconds) ? `&start=${Math.max(0, Math.floor(el.startSeconds))}` : '';
      const embedUrl = `https://www.youtube.com/embed/${el.videoId}?rel=0${start}`;
      let node = existing.get(el.id);

      if (!node) {
        node = renderElement(rc, el, { activeEmbedId });
        if (!node) continue;
        node.dataset.elId = el.id;
        layer.appendChild(node);
      }

      if (node.tagName !== 'foreignObject') {
        const replacement = renderElement(rc, el, { activeEmbedId });
        if (replacement) {
          replacement.dataset.elId = el.id;
          node.replaceWith(replacement);
        }
        continue;
      }

      node.setAttribute('x', String(bb.x));
      node.setAttribute('y', String(bb.y));
      node.setAttribute('width', String(Math.max(bb.w, 1)));
      node.setAttribute('height', String(Math.max(bb.h, 1)));

      const wrap = node.firstChild;
      if (!(wrap instanceof HTMLElement)) continue;
      wrap.style.width = `${Math.max(bb.w, 1)}px`;
      wrap.style.height = `${Math.max(bb.h, 1)}px`;

      const staleThumb = wrap.querySelector('.wb-embed-thumb');
      if (staleThumb) staleThumb.remove();

      let iframe = wrap.querySelector('iframe');
      if (!(iframe instanceof HTMLIFrameElement)) {
        iframe = document.createElement('iframe');
        iframe.className = 'wb-embed-iframe';
        wrap.prepend(iframe);
      }
      iframe.setAttribute('title', 'YouTube video');
      iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
      iframe.setAttribute('allowfullscreen', 'true');
      if (iframe.getAttribute('src') !== embedUrl) iframe.setAttribute('src', embedUrl);
      iframe.style.pointerEvents = isActive ? 'auto' : 'none';

      const watchUrl = `https://www.youtube.com/watch?v=${el.videoId}`;
      let link = wrap.querySelector('.wb-embed-open');
      if (isActive) {
        if (!(link instanceof HTMLAnchorElement)) {
          link = document.createElement('a');
          link.className = 'wb-embed-open';
          link.textContent = 'Open in YouTube';
          wrap.append(link);
        }
        link.setAttribute('href', watchUrl);
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noreferrer');
      } else if (link) {
        link.remove();
      }
    }
  }, [elements, activeEmbedId]);

  useEffect(() => {
    if (!activeEmbedId) return;
    if (!selectedIds.includes(activeEmbedId)) setActiveEmbedId(null);
  }, [activeEmbedId, selectedIds]);

  // Coords transform (screen -> world)
  const toWorld = useCallback((sx, sy) => {
    return { x: (sx - view.x) / view.scale, y: (sy - view.y) / view.scale };
  }, [view]);

  // Commit text (used for blur and before re-opening editor)
  useEffect(() => { editingTextRef.current = editingText; }, [editingText]);
  useEffect(() => {
    if (onEditingTextStateChange) onEditingTextStateChange(Boolean(editingText));
  }, [editingText, onEditingTextStateChange]);
  const pendingCaretRef = useRef(null);
  const isReseedingEditorRef = useRef(false);
  useEffect(() => {
    if (!editingText || !textEditorRef.current) return;
    const root = textEditorRef.current;
    const lines = editingText.lines && editingText.lines.length
      ? editingText.lines
      : [{ kind: 'normal', runs: [] }];
    isReseedingEditorRef.current = true;
    try {
      root.innerHTML = linesToEditableHtml(lines, {
        interactiveCheckboxElementId: editingText.editingId || editingText.id,
      });
      root.focus();
      const pending = pendingCaretRef.current;
      pendingCaretRef.current = null;
      if (pending && pending.lineIndex != null) {
        placeCaretInLine(root, pending.lineIndex, pending.position || 'end');
      } else {
        placeCaretInLine(root, lines.length - 1, 'end');
      }
    } finally {
      isReseedingEditorRef.current = false;
    }
  }, [editingText?.id, editingText?.editingId, editingText?.editorVersion]);

  const commitTextValue = (et) => {
    if (!et) return;
    const fontSize = et.fontSize;
    const fallbackColor = et.stroke || '#1e1e1e';
    const lines = et.lines && et.lines.length
      ? normalizeLines(et.lines, fallbackColor)
      : linesFromRuns(normalizeTextRuns(et.textRuns, fallbackColor), fallbackColor);
    const textRuns = runsFromLines(lines, fallbackColor);
    const text = textFromLines(lines);
    const hasText = text.trim().length > 0;
    const hasListStructure = lines.some((line) => line.kind !== 'normal');
    if (hasText || hasListStructure) {
      const primaryColor = textRuns[0]?.color || fallbackColor;
      const { w, h } = measureTextLines(lines, fontSize, et.manualWidth);
      const align = et.textAlign || 'center';
      const x = et.anchorX != null ? xFromAnchor(et.anchorX, w, align) : et.x;
      const y = et.y;
      if (et.editingId) {
        setElements(prev => prev.map(el => el.id === et.editingId
          ? { ...el, text, textRuns, lines, w, h, x, y, fontSize, stroke: primaryColor, textAlign: align, manualWidth: et.manualWidth, _editing: false }
          : el));
      } else {
        const el = { id: et.id, type: 'text', x, y, w, h, text, textRuns, lines, fontSize, stroke: primaryColor, textAlign: align, manualWidth: et.manualWidth, seed: newSeed() };
        setElements(prev => [...prev, el]);
        setSelectedIds([el.id]);
        setTool('select');
      }
      pushHistory();
    }
  };

  const startEditingExistingText = (el, screenX, screenY) => {
    commitTextValue(editingTextRef.current);
    const fallbackColor = el.stroke || style.stroke || '#1e1e1e';
    const lines = ensureLinesFromElement(el, fallbackColor);
    const textRuns = runsFromLines(lines, fallbackColor);
    const text = textFromLines(lines);
    setSelectedIds([]);
    setEditingText({
      id: el.id,
      editingId: el.id,
      x: el.x, y: el.y,
      anchorX: anchorOf(el),
      screenX, screenY,
      text,
      textRuns,
      lines,
      editorVersion: 0,
      fontSize: el.fontSize || 22,
      stroke: textRuns[0]?.color || fallbackColor,
      textAlign: el.textAlign || 'center',
      manualWidth: el.manualWidth,
    });
    setElements(prev => prev.map(e => e.id === el.id ? { ...e, _editing: true } : e));
  };

  const onDoubleClick = (e) => {
    const targetEl = e.target instanceof Element ? e.target : null;
    if (targetEl?.closest?.('[data-wb-checkbox]')) {
      e.preventDefault();
      return;
    }
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
      lines: [{ kind: 'normal', runs: [] }],
      editorVersion: 0,
      fontSize: 22,
      stroke: style.stroke,
      textAlign: style.textAlign || 'center',
    });
  };

  const toggleLineChecked = (elementId, lineIndex) => {
    setElements((prev) => prev.map((el) => {
      if (el.id !== elementId || el.type !== 'text') return el;
      const lines = ensureLinesFromElement(el, el.stroke || '#1e1e1e');
      if (lineIndex < 0 || lineIndex >= lines.length) return el;
      const target = lines[lineIndex];
      if (target.kind !== 'checkbox') return el;
      const nextLines = lines.slice();
      nextLines[lineIndex] = { ...target, checked: !target.checked };
      const fallbackColor = el.stroke || '#1e1e1e';
      const nextRuns = runsFromLines(nextLines, fallbackColor);
      return { ...el, lines: nextLines, textRuns: nextRuns, text: textFromLines(nextLines) };
    }));
    pushHistory();
  };

  // Pointer / wheel handlers
  const onPointerDown = (e) => {
    const targetEl = e.target instanceof Element ? e.target : null;
    let checkboxTarget = null;
    const checkboxNode = targetEl?.closest?.('[data-wb-checkbox]');
    if (checkboxNode && e.button === 0) {
      const raw = checkboxNode.getAttribute('data-wb-checkbox') || '';
      const sep = raw.lastIndexOf(':');
      if (sep > 0) {
        const elementId = raw.slice(0, sep);
        const lineIndex = parseInt(raw.slice(sep + 1), 10);
        if (Number.isFinite(lineIndex)) checkboxTarget = { elementId, lineIndex, source: 'direct-attr' };
      }
    }
    if (!checkboxTarget && e.button === 0) {
      const lineEl = targetEl?.closest?.('.wb-line[data-kind="checkbox"]');
      const lineIndex = lineEl ? parseInt(lineEl.dataset.lineIndex || '-1', 10) : -1;
      if (lineEl && Number.isFinite(lineIndex) && lineIndex >= 0) {
        const contentEl = lineEl.querySelector(':scope > .wb-line-content');
        const contentRect = contentEl?.getBoundingClientRect?.();
        const clickedPrefix = contentRect ? e.clientX < contentRect.left : false;
        if (clickedPrefix) {
          const foreignObjectNode = lineEl.closest('foreignObject');
          const elementId = foreignObjectNode?.dataset?.elId || null;
          if (elementId) checkboxTarget = { elementId, lineIndex, source: 'line-prefix-fallback' };
        }
      }
    }
    if (checkboxTarget && e.button === 0) {
      e.preventDefault();
      e.stopPropagation();
      toggleLineChecked(checkboxTarget.elementId, checkboxTarget.lineIndex);
      return;
    }
    if (e.button === 1 || (e.button === 0 && (spaceDown || tool === 'hand'))) {
      setActiveEmbedId(null);
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
      setActiveEmbedId(null);
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
          lines: [{ kind: 'normal', runs: [] }],
          editorVersion: 0,
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
        const alreadyOnlySelected = selectedIds.length === 1 && selectedIds[0] === hit.id;
        if (hit.type === 'embed' && alreadyOnlySelected && !e.shiftKey) {
          setActiveEmbedId(hit.id);
          setSelectedIds([hit.id]);
          return;
        }
        const ids = selectedIds.includes(hit.id)
          ? selectedIds
          : (e.shiftKey ? [...selectedIds, hit.id] : [hit.id]);
        setActiveEmbedId(null);
        setSelectedIds(ids);
        dragRef.current = { mode: 'move', startW: w, originals: elements.filter(el => ids.includes(el.id)).map(el => ({ id: el.id, x: el.x, y: el.y })) };
      } else {
        setActiveEmbedId(null);
        if (!e.shiftKey) setSelectedIds([]);
        dragRef.current = { mode: 'marquee', sx: w.x, sy: w.y };
        setMarquee({ x: w.x, y: w.y, w: 0, h: 0 });
      }
      return;
    }

    if (tool === 'eraser') {
      setActiveEmbedId(null);
      dragRef.current = { mode: 'erase' };
      const hit = [...elements].reverse().find(el => hitTest(el, w.x, w.y));
      if (hit) setElements(prev => prev.filter(el => el.id !== hit.id));
      return;
    }

    // creating new shape
    setActiveEmbedId(null);
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
      base.pressures = [e.pressure];
      // A reported pressure of exactly 0.5 means there's no real pen/stylus
      // data, so fall back to distance-based pressure simulation.
      base.simulatePressure = e.pressure === 0.5;
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
    if (drag.mode === 'resize-scale') {
      const rawScaleX = (w.x - drag.pivotX) / drag.startDX;
      const rawScaleY = (w.y - drag.pivotY) / drag.startDY;
      let scaleX = Math.max(0.1, rawScaleX);
      let scaleY = Math.max(0.1, rawScaleY);
      // Default to uniform scaling; hold Shift for non-uniform stretch.
      if (!e.shiftKey) {
        const uniform = Math.max(scaleX, scaleY);
        scaleX = uniform;
        scaleY = uniform;
      }
      const originalsById = new Map(drag.originals.map((el) => [el.id, el]));
      setElements(prev => prev.map(el => {
        const original = originalsById.get(el.id);
        if (!original) return el;
        return scaleElementFromPivot(original, drag.pivotX, drag.pivotY, scaleX, scaleY);
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
        setDrafting(d => ({
          ...d,
          points: [...d.points, [w.x - d.x, w.y - d.y]],
          pressures: [...(d.pressures ?? []), e.pressure],
        }));
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
    if (drag?.mode === 'resize-scale') {
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
      if (final.type === 'freedraw') {
        // Mark the stroke as finished so perfect-freehand closes the end cap.
        final = { ...final, lastCommittedPoint: final.points[final.points.length - 1] };
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
    let et = editingTextRef.current;
    if (et && textEditorRef.current) {
      const fallbackColor = et.stroke || style.stroke || '#1e1e1e';
      const liveLines = linesFromEditor(textEditorRef.current, fallbackColor);
      const liveRuns = runsFromLines(liveLines, fallbackColor);
      et = { ...et, lines: liveLines, textRuns: liveRuns, text: textFromLines(liveLines) };
    }
    commitTextValue(et);
    if (et && et.editingId) {
      const etLines = Array.isArray(et.lines) ? et.lines : [];
      const isEmpty = !et.text.trim() && !etLines.some((line) => line.kind !== 'normal');
      setElements(prev => prev.map(e => {
        if (e.id !== et.editingId) return e;
        const { _editing, ...rest } = e;
        if (isEmpty) return null;
        return rest;
      }).filter(Boolean));
      if (isEmpty) pushHistory();
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
        setActiveEmbedId(null);
        setSelectedIds([]);
        setTool('select');
      }
      if (e.key === 'Enter' && selectedIds.length === 1) {
        const selected = elements.find((el) => el.id === selectedIds[0]);
        if (selected?.type === 'embed') {
          setActiveEmbedId(selected.id);
          e.preventDefault();
        }
      }
    };
    const onUp = (e) => { if (e.code === 'Space') setSpaceDown(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onUp); };
  }, [selectedIds, elements, spaceDown, view, pushHistory, setElements, setSelectedIds, setTool]);

  // Selection bbox (union)
  const selectedElements = useMemo(
    () => elements.filter((el) => selectedIds.includes(el.id)),
    [elements, selectedIds],
  );
  const selectionBBox = useMemo(
    () => bboxUnion(selectedElements),
    [selectedElements],
  );

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

          {/* rough.js renders here */}
          <g ref={drawLayerRef}/>
          <g ref={embedLayerRef}/>

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

          {/* bottom-right scale handle for selected elements */}
          {selectionBBox && selectedIds.length ? (
            <circle
              cx={selectionBBox.x + selectionBBox.w}
              cy={selectionBBox.y + selectionBBox.h}
              r={6 / view.scale}
              fill="rgb(var(--wb-selection))"
              stroke="white"
              strokeWidth={1.5 / view.scale}
              style={{ cursor: 'nwse-resize' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                const rect = svgRef.current.getBoundingClientRect();
                const sx = e.clientX - rect.left;
                const sy = e.clientY - rect.top;
                const startW = toWorld(sx, sy);
                e.currentTarget.setPointerCapture(e.pointerId);
                dragRef.current = {
                  mode: 'resize-scale',
                  originals: cloneElements(selectedElements),
                  pivotX: selectionBBox.x,
                  pivotY: selectionBBox.y,
                  startDX: Math.max(0.01, startW.x - selectionBBox.x),
                  startDY: Math.max(0.01, startW.y - selectionBBox.y),
                };
              }}
            />
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
        const editingLines = editingText.lines && editingText.lines.length
          ? editingText.lines
          : [{ kind: 'normal', runs: [] }];
        const m = measureTextLines(editingLines, fs, editingText.manualWidth);
        const w = Math.max(m.w, fs * 0.6) * view.scale;
        const h = Math.max(m.h, fs * 1.15) * view.scale;
        const align = editingText.textAlign || 'center';
        const xWorld = editingText.anchorX != null
          ? xFromAnchor(editingText.anchorX, Math.max(m.w, fs * 0.6), align)
          : editingText.x;
        const yWorld = editingText.y;
        const fallbackColor = editingText.stroke || style.stroke || '#1e1e1e';
        const syncFromDom = (root) => {
          const lines = linesFromEditor(root, fallbackColor);
          const runs = runsFromLines(lines, fallbackColor);
          const text = textFromLines(lines);
          setEditingText((prev) => prev ? { ...prev, lines, textRuns: runs, text } : prev);
          return { lines, runs, text };
        };
        const applyLinesUpdate = (nextLines, caret) => {
          const lines = normalizeLines(nextLines, fallbackColor);
          const runs = runsFromLines(lines, fallbackColor);
          const text = textFromLines(lines);
          pendingCaretRef.current = caret || null;
          setEditingText((prev) => prev
            ? { ...prev, lines, textRuns: runs, text, editorVersion: (prev.editorVersion || 0) + 1 }
            : prev);
        };
        return (
          <div
            ref={textEditorRef}
            className="wb-text-input"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            onInput={(e) => {
              const root = e.currentTarget;
              const lines = linesFromEditor(root, fallbackColor);
              const auto = detectListAutoformat(lines, fallbackColor);
              if (auto) {
                applyLinesUpdate(auto.lines, { lineIndex: auto.transformedIndex, position: 'start' });
                return;
              }
              const runs = runsFromLines(lines, fallbackColor);
              const text = textFromLines(lines);
              setEditingText((prev) => prev ? { ...prev, lines, textRuns: runs, text } : prev);
            }}
            onMouseDown={(e) => {
              const target = e.target instanceof Element ? e.target : null;
              const checkbox = target?.closest('[data-wb-checkbox]');
              const lineEl = checkbox?.closest('.wb-line[data-kind="checkbox"]')
                || target?.closest('.wb-line[data-kind="checkbox"]')
                || null;
              const contentEl = lineEl?.querySelector(':scope > .wb-line-content') || null;
              const contentRect = contentEl?.getBoundingClientRect?.() || null;
              const clickedPrefix = checkbox
                ? true
                : (lineEl && contentRect ? e.clientX < contentRect.left : false);
              if (!lineEl || !clickedPrefix) return;
              e.preventDefault();
              const idx = lineEl ? parseInt(lineEl.dataset.lineIndex || '-1', 10) : -1;
              if (!Number.isFinite(idx) || idx < 0) return;
              const currentLines = linesFromEditor(e.currentTarget, fallbackColor);
              const nextLines = currentLines.map((line, i) => i === idx && line.kind === 'checkbox'
                ? { ...line, checked: !line.checked }
                : line);
              applyLinesUpdate(nextLines, { lineIndex: idx, position: 'end' });
            }}
            onBlur={() => {
              if (isReseedingEditorRef.current) return;
              commitText();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setEditingText(null); return; }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commitText(); return; }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const root = e.currentTarget;
                const lines = linesFromEditor(root, fallbackColor);
                const caret = findEditingLineFromSelection(root);
                if (!caret) {
                  const nextLines = [...lines, { kind: 'normal', runs: [] }];
                  applyLinesUpdate(nextLines, { lineIndex: nextLines.length - 1, position: 'start' });
                  return;
                }
                const current = lines[caret.lineIndex];
                if (!current) return;
                const isListLine = current.kind !== 'normal';
                const lineText = (current.runs || []).map((r) => r.text || '').join('');
                if (isListLine && lineText.length === 0) {
                  const nextLines = lines.slice();
                  nextLines[caret.lineIndex] = { kind: 'normal', runs: [] };
                  applyLinesUpdate(nextLines, { lineIndex: caret.lineIndex, position: 'start' });
                  return;
                }
                const { before, after } = splitRunsAt(current.runs || [], caret.charOffset);
                const headLine = { ...current, runs: normalizeTextRuns(before, fallbackColor) };
                const tailLine = current.kind === 'checkbox'
                  ? { kind: 'checkbox', checked: false, runs: normalizeTextRuns(after, fallbackColor) }
                  : { kind: current.kind, runs: normalizeTextRuns(after, fallbackColor) };
                const nextLines = [
                  ...lines.slice(0, caret.lineIndex),
                  headLine,
                  tailLine,
                  ...lines.slice(caret.lineIndex + 1),
                ];
                applyLinesUpdate(nextLines, { lineIndex: caret.lineIndex + 1, position: 'start' });
                return;
              }
              if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                insertEditorLineBreak(e.currentTarget);
                syncFromDom(e.currentTarget);
                return;
              }
              if (e.key === 'Backspace') {
                const root = e.currentTarget;
                const caret = findEditingLineFromSelection(root);
                if (!caret || caret.charOffset !== 0) return;
                const sel = window.getSelection();
                if (sel && !sel.isCollapsed) return;
                const currentLines = linesFromEditor(root, fallbackColor);
                const current = currentLines[caret.lineIndex];
                if (!current || current.kind === 'normal') return;
                e.preventDefault();
                const nextLines = currentLines.slice();
                nextLines[caret.lineIndex] = { kind: 'normal', runs: current.runs };
                applyLinesUpdate(nextLines, { lineIndex: caret.lineIndex, position: 'start' });
              }
            }}
            style={{
              left: xWorld * view.scale + view.x,
              top: yWorld * view.scale + view.y,
              fontSize: fs * view.scale,
              color: editingText.stroke,
              textAlign: align,
              width: w,
              minHeight: h,
              height: 'auto',
              whiteSpace: editingText.manualWidth ? 'pre-wrap' : 'pre',
              overflow: 'visible',
              wordBreak: 'break-word',
            }}
          />
        );
      })() : null}
    </>
  );
}

// =================================================================
// Freehand (perfect-freehand) — matches Excalidraw's brush mechanics
// =================================================================
// Excalidraw's exact getStroke tuning for the freedraw tool.
const FREEDRAW_OPTIONS = {
  thinning: 0.6,
  smoothing: 0.5,
  streamline: 0.5,
  easing: (t) => Math.sin((t * Math.PI) / 2),
};

// Turn the polygon outline points returned by getStroke into SVG path data.
// Uses median points between samples to produce smooth quadratic curves, then
// closes the path so it renders as a filled shape (same approach as Excalidraw).
function getSvgPathFromStroke(points) {
  if (!points.length) return '';
  const max = points.length - 1;
  return points
    .reduce(
      (acc, point, i, arr) => {
        if (i === max) {
          acc.push(point, med(point, arr[0]), 'L', arr[0], 'Z');
        } else {
          acc.push(point, med(point, arr[i + 1]));
        }
        return acc;
      },
      ['M', points[0], 'Q'],
    )
    .join(' ');
}

function med(A, B) {
  return [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
}

function getFreeDrawSvgPath(el) {
  const pts = (el.points || []).map(([px, py]) => [el.x + px, el.y + py]);
  const simulatePressure = el.simulatePressure ?? true;
  const inputPoints = simulatePressure
    ? pts
    : pts.map((p, i) => [...p, (el.pressures?.[i] ?? 0.5) * 2]);
  const outline = getStroke(inputPoints, {
    ...FREEDRAW_OPTIONS,
    simulatePressure,
    size: (el.strokeWidth ?? 2) * 4.25,
    last: !!el.lastCommittedPoint,
  });
  return getSvgPathFromStroke(outline);
}

// =================================================================
// renderElement(rc, el) -> SVGElement
// =================================================================
function renderElement(rc, el, options = {}) {
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
  if (el.type === 'freedraw' && el.points && el.points.length >= 1) {
    const d = getFreeDrawSvgPath(el);
    if (!d) return null;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', normalizeColor(el.stroke || '#1e1e1e'));
    path.setAttribute('stroke', 'none');
    return path;
  }
  if (el.type === 'text') {
    if (el._editing) return null;
    const fs = el.fontSize || 22;
    const align = el.textAlign || 'center';
    const lines = ensureLinesFromElement(el, el.stroke || '#1e1e1e');
    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', el.x);
    fo.setAttribute('y', el.y);
    fo.setAttribute('width', (el.w || 0) + 4);
    fo.setAttribute('height', (el.h || 0) + 4);
    fo.style.overflow = 'visible';
    const div = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    div.style.cssText = `font-family:'Excalifont','Caveat','Comic Sans MS',cursive;font-weight:400;font-size:${fs}px;line-height:1.15;white-space:pre-wrap;word-break:break-word;text-align:${align};width:${el.manualWidth ? el.manualWidth + 'px' : 'max-content'};color:${normalizeColor(el.stroke || '#1e1e1e')};user-select:none;pointer-events:auto;`;
    div.innerHTML = linesToEditableHtml(lines, { interactiveCheckboxElementId: el.id });
    fo.appendChild(div);
    return fo;
  }
  if (el.type === 'image') {
    const bb = bboxOf(el);
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('x', String(bb.x));
    image.setAttribute('y', String(bb.y));
    image.setAttribute('width', String(Math.max(bb.w, 1)));
    image.setAttribute('height', String(Math.max(bb.h, 1)));
    image.setAttribute('href', el.src || '');
    image.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    return image;
  }
  if (el.type === 'embed' && el.provider === 'youtube') {
    const bb = bboxOf(el);
    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', String(bb.x));
    fo.setAttribute('y', String(bb.y));
    fo.setAttribute('width', String(Math.max(bb.w, 1)));
    fo.setAttribute('height', String(Math.max(bb.h, 1)));
    fo.style.overflow = 'visible';

    const isActive = options.activeEmbedId === el.id;
    const start = Number.isFinite(el.startSeconds) ? `&start=${Math.max(0, Math.floor(el.startSeconds))}` : '';
    const embedUrl = `https://www.youtube.com/embed/${el.videoId}?rel=0${start}`;
    const watchUrl = `https://www.youtube.com/watch?v=${el.videoId}`;

    const wrap = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    wrap.className = 'wb-embed-wrap';
    wrap.style.width = `${Math.max(bb.w, 1)}px`;
    wrap.style.height = `${Math.max(bb.h, 1)}px`;

    const iframe = document.createElementNS('http://www.w3.org/1999/xhtml', 'iframe');
    iframe.setAttribute('src', embedUrl);
    iframe.setAttribute('title', 'YouTube video');
    iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.className = 'wb-embed-iframe';
    iframe.style.pointerEvents = isActive ? 'auto' : 'none';
    wrap.appendChild(iframe);

    if (isActive) {
      const link = document.createElementNS('http://www.w3.org/1999/xhtml', 'a');
      link.className = 'wb-embed-open';
      link.setAttribute('href', watchUrl);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noreferrer');
      link.textContent = 'Open in YouTube';
      wrap.appendChild(link);
    }

    fo.appendChild(wrap);
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
