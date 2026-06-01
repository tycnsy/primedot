import { useMemo, useState, type FormEvent } from 'react';
import type {
  Project,
  ProjectInput,
  ProjectSeries,
  ProjectTag,
} from '../lib/types';
import { formatHMS, parseHMS } from '../lib/time';

interface Props {
  initial?: Project | null;
  tagItems?: ProjectTag[];
  seriesItems?: ProjectSeries[];
  onSubmit: (input: ProjectInput) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
}

function toLocalDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `${iso}T00:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function fromLocalDateTimeInput(local: string): string {
  return new Date(local).toISOString();
}

function defaultStartLocal(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T05:00`;
}

export default function ProjectForm({
  initial,
  tagItems = [],
  seriesItems = [],
  onSubmit,
  onCancel,
  submitLabel = 'Save',
}: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [videoLengthStr, setVideoLengthStr] = useState(
    initial ? formatHMS(initial.video_length) : '00:10:00',
  );
  const [dueDateLocal, setDueDateLocal] = useState<string>(
    toLocalDateTimeInput(initial?.due_date),
  );
  const [startDateLocal, setStartDateLocal] = useState<string>(
    toLocalDateTimeInput(initial?.start_date ?? initial?.created_at) || defaultStartLocal(),
  );
  const [bufferModifier, setBufferModifier] = useState<string>(
    initial ? String(initial.buffer_modifier) : '1',
  );
  const [tag, setTag] = useState(initial?.tag ?? '');
  const [series, setSeries] = useState(initial?.series ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tagOptions = useMemo(() => {
    const names = tagItems
      .filter((item) => !item.archived_at)
      .map((item) => item.name);
    if (tag.trim() && !names.includes(tag.trim())) names.push(tag.trim());
    return names;
  }, [tagItems, tag]);

  const seriesOptions = useMemo(() => {
    const trimmedTag = tag.trim();
    const available = seriesItems.filter((item) => {
      if (item.archived_at) return false;
      if (!trimmedTag) return true;
      return item.tag === trimmedTag;
    });
    const names = available.map((item) => item.name);
    if (series.trim() && !names.includes(series.trim())) names.push(series.trim());
    return names;
  }, [seriesItems, tag, series]);

  const handleSeriesChange = (value: string) => {
    setSeries(value);
    if (tag.trim()) return;
    const match = seriesItems.find((item) => item.name === value.trim());
    if (match?.tag) setTag(match.tag);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const videoLength = parseHMS(videoLengthStr);
    if (videoLength == null) {
      setError('Video length must be in hh:mm:ss format.');
      return;
    }
    const buffer = Number.parseFloat(bufferModifier);
    if (!Number.isFinite(buffer) || buffer <= 0) {
      setError('Buffer modifier must be a positive number.');
      return;
    }
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }

    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        video_length: videoLength,
        due_date: dueDateLocal ? fromLocalDateTimeInput(dueDateLocal) : null,
        sync_true_deadline_with_due_date:
          initial?.sync_true_deadline_with_due_date ?? true,
        start_date: fromLocalDateTimeInput(startDateLocal),
        buffer_modifier: buffer,
        tag: tag.trim() || null,
        series: series.trim() || null,
        notes: initial?.notes ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <label className="label" htmlFor="proj-name">
            Name
          </label>
          <input
            id="proj-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My YouTube essay"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="label" htmlFor="proj-vl">
            Video length (hh:mm:ss)
          </label>
          <input
            id="proj-vl"
            className="input font-sans"
            value={videoLengthStr}
            onChange={(e) => setVideoLengthStr(e.target.value)}
            placeholder="00:20:00"
          />
        </div>
        <div className="space-y-1">
          <label className="label" htmlFor="proj-buf">
            Buffer modifier
          </label>
          <input
            id="proj-buf"
            className="input"
            type="number"
            step="0.01"
            min="0.1"
            value={bufferModifier}
            onChange={(e) => setBufferModifier(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="label" htmlFor="proj-start">
            Start date & time
          </label>
          <input
            id="proj-start"
            className="input"
            type="datetime-local"
            value={startDateLocal}
            onChange={(e) => setStartDateLocal(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <label className="label" htmlFor="proj-due">
            Due date & time
          </label>
          <input
            id="proj-due"
            className="input"
            type="datetime-local"
            value={dueDateLocal}
            onChange={(e) => setDueDateLocal(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="label" htmlFor="proj-tag">
            Tag
          </label>
          <input
            id="proj-tag"
            className="input"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="optional"
            list="project-tag-options"
          />
          <datalist id="project-tag-options">
            {tagOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1">
          <label className="label" htmlFor="proj-series">
            Series
          </label>
          <input
            id="proj-series"
            className="input"
            value={series}
            onChange={(e) => handleSeriesChange(e.target.value)}
            placeholder="optional"
            list="project-series-options"
          />
          <datalist id="project-series-options">
            {seriesOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>
      </div>

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <button type="button" onClick={onCancel} className="btn-ghost">
            Cancel
          </button>
        ) : null}
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
