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
  const [marginLimitHours, setMarginLimitHours] = useState('');
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

  useEffect(() => {
    const seconds = settingsQ.data?.pace_margin_limit_seconds;
    if (seconds == null) {
      setMarginLimitHours('');
      return;
    }
    // Store as hours in the input; allow fractional display when needed.
    const hours = Number(seconds) / 3600;
    setMarginLimitHours(String(hours));
  }, [settingsQ.data?.pace_margin_limit_seconds]);

  const handleSave = async () => {
    setSaveError(null);
    setSavedFlash(false);
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setSaveError('Enter a percentage between 0 and 100.');
      return;
    }

    let paceMarginLimitSeconds: number | null = null;
    const trimmedLimit = marginLimitHours.trim();
    if (trimmedLimit !== '') {
      const hours = Number(trimmedLimit);
      if (!Number.isFinite(hours) || hours < 0) {
        setSaveError('Margin limit must be empty (off) or a non-negative number of hours.');
        return;
      }
      paceMarginLimitSeconds = Math.round(hours * 3600);
    }

    try {
      await upsert.mutateAsync({
        paceSplitPercentage: parsed,
        paceMarginLimitSeconds,
      });
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
          <h1 className="text-3xl font-semibold tracking-tight text-fg">Pace defaults</h1>
          <p className="max-w-lg text-sm text-muted">
            Defaults applied when you create a new project. Each project can override
            these under Project Detail → Pace settings. Progress can move a share of
            buffer-only time into pace margin by pulling the target deadline earlier.
          </p>
        </div>
        <Link to="/projects" className="btn-ghost">
          Back to projects
        </Link>
      </div>

      <section className="max-w-md space-y-6">
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

        <label className="block space-y-2">
          <span className="text-sm font-medium text-fg">Pace margin limit</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={1}
              className="input w-28"
              value={marginLimitHours}
              placeholder="Off"
              disabled={settingsQ.isLoading || upsert.isPending}
              onChange={(e) => {
                setSavedFlash(false);
                setMarginLimitHours(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave();
              }}
            />
            <span className="text-sm text-muted">hours</span>
          </div>
        </label>

        <p className="text-sm text-muted">
          Leave empty to leave margin unlimited. When set, progress that would push
          margin past this limit keeps margin at the limit, preserves the intended
          post-split pace, and absorbs the leftover into a higher buffer modifier.
          Does not move your true deadline.
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
