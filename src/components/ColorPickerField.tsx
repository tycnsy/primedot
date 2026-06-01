import { useEffect, useRef, useState } from 'react';
import { ROYGBIV_COLOR_PRESETS } from '../lib/colorPresets';

type PickerTab = 'presets' | 'custom';

interface ColorPickerFieldProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (color: string) => void;
}

function normalizeHex(raw: string): string {
  let v = raw.trim();
  if (!v) return v;
  if (!v.startsWith('#')) v = `#${v}`;
  return v;
}

export default function ColorPickerField({
  id,
  label = 'Color',
  value,
  onChange,
}: ColorPickerFieldProps) {
  const [tab, setTab] = useState<PickerTab>('presets');
  const [hexDraft, setHexDraft] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [isOpen]);

  const selectColor = (color: string) => {
    onChange(color);
    setHexDraft(color);
    setIsOpen(false);
  };

  return (
    <div className="space-y-2" ref={containerRef}>
      <div className="flex items-center gap-2">
        {label ? (
          <label className="label shrink-0" htmlFor={id}>
            {label}
          </label>
        ) : null}
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface2 px-2 py-1 text-sm text-fg hover:bg-surface"
          onClick={() => {
            setIsOpen((prev) => !prev);
            setHexDraft(value);
          }}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
        >
          <span
            className="h-7 w-7 shrink-0 rounded-md border border-border ring-1 ring-inset ring-border/60"
            style={{ backgroundColor: value }}
            title={value}
            aria-hidden
          />
          <span>Pick</span>
        </button>
      </div>

      {isOpen ? (
        <div className="relative">
          <div className="absolute z-20 mt-1 w-[20rem] max-w-[90vw] rounded-lg border border-border bg-surface p-3 shadow-elev2">
            <div className="segmented mb-3 w-fit">
              <button
                type="button"
                data-active={tab === 'presets'}
                onClick={() => setTab('presets')}
              >
                Presets
              </button>
              <button
                type="button"
                data-active={tab === 'custom'}
                onClick={() => {
                  setTab('custom');
                  setHexDraft(value);
                }}
              >
                Custom
              </button>
            </div>

            {tab === 'presets' ? (
              <div
                className="grid grid-flow-col grid-rows-3 gap-1.5"
                role="listbox"
                aria-label="Color presets"
              >
                {ROYGBIV_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    role="option"
                    aria-selected={value.toLowerCase() === preset.toLowerCase()}
                    className="h-8 w-8 rounded-md border border-border transition-shadow hover:ring-2 hover:ring-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent data-[active=true]:ring-2 data-[active=true]:ring-accent"
                    style={{ backgroundColor: preset }}
                    data-active={value.toLowerCase() === preset.toLowerCase()}
                    title={preset}
                    onClick={() => selectColor(preset)}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  id={id}
                  type="color"
                  className="h-10 w-14 cursor-pointer rounded-md border border-border bg-surface2 p-1"
                  value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#9CA3AF'}
                  onChange={(event) => selectColor(event.target.value)}
                />
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-sm text-muted">#</span>
                  <input
                    type="text"
                    className="input font-mono text-sm tabular-nums"
                    value={hexDraft.replace(/^#/, '')}
                    onChange={(event) => {
                      const next = normalizeHex(event.target.value);
                      setHexDraft(next);
                      if (/^#[0-9a-f]{6}$/i.test(next)) {
                        onChange(next);
                      }
                    }}
                    onBlur={() => {
                      const next = normalizeHex(hexDraft);
                      if (/^#[0-9a-f]{6}$/i.test(next)) {
                        selectColor(next.toLowerCase());
                      } else {
                        setHexDraft(value);
                      }
                    }}
                    placeholder="RRGGBB"
                    maxLength={6}
                    spellCheck={false}
                    aria-label="Hex color"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
