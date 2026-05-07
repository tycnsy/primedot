import { useState, type FormEvent } from 'react';
import type { Project, ProjectInput } from '../lib/types';
import { formatHMS, parseHMS } from '../lib/time';

interface Props {
  initial?: Project | null;
  tagOptions?: string[];
  onSubmit: (input: ProjectInput) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
}

export default function ProjectForm({
  initial,
  tagOptions = [],
  onSubmit,
  onCancel,
  submitLabel = 'Save',
}: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [videoLengthStr, setVideoLengthStr] = useState(
    initial ? formatHMS(initial.video_length) : '00:10:00',
  );
  const [dueDate, setDueDate] = useState<string>(initial?.due_date ?? '');
  const [bufferModifier, setBufferModifier] = useState<string>(
    initial ? String(initial.buffer_modifier) : '1',
  );
  const [tag, setTag] = useState(initial?.tag ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        due_date: dueDate || null,
        buffer_modifier: buffer,
        tag: tag.trim() || null,
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
            step="0.1"
            min="0.1"
            value={bufferModifier}
            onChange={(e) => setBufferModifier(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="label" htmlFor="proj-due">
            Due date
          </label>
          <input
            id="proj-due"
            className="input"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
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
