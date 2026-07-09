import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  usePaceSplitSettings,
  useUpsertPaceSplitSettings,
} from '../hooks/usePaceSplitSettings';

export default function SettingsPace() {
  const settingsQ = usePaceSplitSettings();
  const upsert = useUpsertPaceSplitSettings();
  const [value, setValue] = useState('0');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    const pct = settingsQ.data?.pace_split_percentage;
    if (pct == null) {
      setValue('0');
      return;
    }
    setValue(String(Number(pct)));
  }, [settingsQ.data?.pace_split_percentage]);

  const handleSave = async () => {
    setSaveError(null);
    setSavedFlash(false);
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setSaveError('Enter a percentage between 0 and 100.');
      return;
    }
    try {
      await upsert.mutateAsync({ paceSplitPercentage: parsed });
      setSavedFlash(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save.');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <span className="label">Settings</span>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">Pace</h1>
          <p className="max-w-lg text-sm text-muted">
            When you make progress on a task, a share of the buffer-only time can be
            moved into your pace margin by pulling the target deadline earlier.
          </p>
        </div>
        <Link to="/projects" className="btn-ghost">
          Back to projects
        </Link>
      </div>

      <section className="max-w-md space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-fg">Pace split percentage</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              className="input w-28"
              value={value}
              disabled={settingsQ.isLoading || upsert.isPending}
              onChange={(e) => {
                setSavedFlash(false);
                setValue(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave();
              }}
            />
            <span className="text-sm text-muted">%</span>
          </div>
        </label>

        <p className="text-sm text-muted">
          At 0% (default), progress never moves your target deadline. At higher
          values, that percentage of the buffer difference is allocated into margin
          (target moves earlier). Progress decreases reverse the adjustment.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-primary"
            disabled={settingsQ.isLoading || upsert.isPending}
            onClick={() => void handleSave()}
          >
            {upsert.isPending ? 'Saving…' : 'Save'}
          </button>
          {savedFlash ? (
            <span className="text-sm text-success">Saved</span>
          ) : null}
        </div>

        {settingsQ.error ? (
          <p className="text-sm text-danger">
            {settingsQ.error instanceof Error
              ? settingsQ.error.message
              : 'Failed to load settings.'}
          </p>
        ) : null}
        {saveError ? <p className="text-sm text-danger">{saveError}</p> : null}
      </section>
    </div>
  );
}
