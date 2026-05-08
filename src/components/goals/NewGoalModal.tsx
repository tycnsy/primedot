import { useEffect, useMemo, useState } from 'react';
import type { NewLongGoalInput, Tag } from '../../features/goals';
import ModalShell from './ModalShell';

type GoalDraftType = 'trend' | 'accumulation' | 'milestone';

interface MilestoneDraft {
  id: string;
  name: string;
  dueDate: string;
}

interface NewGoalModalProps {
  open: boolean;
  tags: Tag[];
  onClose: () => void;
  onCreate: (goal: NewLongGoalInput) => void;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function uid(): string {
  return `${Date.now()}_${Math.round(Math.random() * 1_000_000)}`;
}

export default function NewGoalModal({ open, tags, onClose, onCreate }: NewGoalModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [goalType, setGoalType] = useState<GoalDraftType>('trend');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState(todayIsoDate());
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const [trendStartValue, setTrendStartValue] = useState('0');
  const [trendTargetValue, setTrendTargetValue] = useState('10');
  const [trendUnit, setTrendUnit] = useState('kg');

  const [accumTargetTotal, setAccumTargetTotal] = useState('100');
  const [accumUnit, setAccumUnit] = useState('$');

  const [milestones, setMilestones] = useState<MilestoneDraft[]>([
    { id: uid(), name: '', dueDate: '' },
  ]);

  useEffect(() => {
    if (!open) return;
    setStep(1);
  }, [open]);

  const canCreate = useMemo(() => {
    if (!name.trim() || !targetDate) return false;
    if (goalType === 'trend') {
      const start = Number(trendStartValue);
      const target = Number(trendTargetValue);
      return Number.isFinite(start) && Number.isFinite(target) && trendUnit.trim().length > 0;
    }
    if (goalType === 'accumulation') {
      const total = Number(accumTargetTotal);
      return Number.isFinite(total) && total > 0 && accumUnit.trim().length > 0;
    }
    return milestones.some((item) => item.name.trim().length > 0);
  }, [
    accumTargetTotal,
    accumUnit,
    goalType,
    milestones,
    name,
    targetDate,
    trendStartValue,
    trendTargetValue,
    trendUnit,
  ]);

  const createGoal = () => {
    if (!canCreate) return;
    const startDate = todayIsoDate();
    if (goalType === 'trend') {
      const startValue = Number(trendStartValue);
      const targetValue = Number(trendTargetValue);
      const direction: 'up' | 'down' = targetValue >= startValue ? 'up' : 'down';
      onCreate({
        type: 'trend',
        name: name.trim(),
        description: description.trim() || undefined,
        startDate,
        targetDate,
        tags: selectedTagIds,
        relatedGoalIds: [],
        startValue,
        targetValue,
        direction,
        unit: trendUnit.trim(),
        logs: [],
      });
    } else if (goalType === 'accumulation') {
      onCreate({
        type: 'accumulation',
        name: name.trim(),
        description: description.trim() || undefined,
        startDate,
        targetDate,
        tags: selectedTagIds,
        relatedGoalIds: [],
        targetTotal: Number(accumTargetTotal),
        unit: accumUnit.trim(),
        logs: [],
      });
    } else {
      onCreate({
        type: 'milestone',
        name: name.trim(),
        description: description.trim() || undefined,
        startDate,
        targetDate,
        tags: selectedTagIds,
        relatedGoalIds: [],
        milestones: milestones
          .filter((item) => item.name.trim().length > 0)
          .map((item) => ({
            id: uid(),
            name: item.name.trim(),
            dueDate: item.dueDate || null,
            done: false,
            doneAt: null,
          })),
        logs: [],
      });
    }
    onClose();
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="New goal"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          {step === 2 ? (
            <button type="button" onClick={() => setStep(1)} className="btn-ghost">
              {'<-'} Back
            </button>
          ) : null}
          {step === 1 ? (
            <button type="button" onClick={() => setStep(2)} className="btn-primary">
              Continue
            </button>
          ) : (
            <button type="button" onClick={createGoal} className="btn-primary" disabled={!canCreate}>
              Create goal
            </button>
          )}
        </>
      }
    >
      {step === 1 ? (
        <div className="space-y-2">
          <p className="text-sm text-muted">Pick a long-term goal type.</p>
          {(
            [
              {
                type: 'trend',
                label: 'Trend',
                desc: 'Measurement moving toward a target (weight, pace, %).',
              },
              {
                type: 'accumulation',
                label: 'Accumulation',
                desc: 'Build a total toward a target amount.',
              },
              {
                type: 'milestone',
                label: 'Milestone',
                desc: 'Complete an ordered set of project milestones.',
              },
            ] as const
          ).map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => setGoalType(item.type)}
              className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                goalType === item.type
                  ? 'border-accent/70 bg-accent/5 ring-2 ring-accent/30'
                  : 'border-border hover:border-border/90'
              }`}
            >
              <p className="text-sm font-semibold text-fg">{item.label}</p>
              <p className="mt-1 text-xs text-muted">{item.desc}</p>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="label" htmlFor="goal-name">
              Name
            </label>
            <input
              id="goal-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="input"
              placeholder="Goal name"
            />
          </div>

          <div className="space-y-1">
            <label className="label" htmlFor="goal-description">
              Description
            </label>
            <textarea
              id="goal-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="input min-h-[80px] resize-y py-2"
              placeholder="Optional context..."
            />
          </div>

          {goalType === 'trend' ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <InputField
                label="Start value"
                type="number"
                value={trendStartValue}
                onChange={setTrendStartValue}
              />
              <InputField
                label="Target value"
                type="number"
                value={trendTargetValue}
                onChange={setTrendTargetValue}
              />
              <InputField label="Unit" value={trendUnit} onChange={setTrendUnit} />
            </div>
          ) : null}

          {goalType === 'accumulation' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <InputField
                label="Target total"
                type="number"
                value={accumTargetTotal}
                onChange={setAccumTargetTotal}
              />
              <InputField label="Unit" value={accumUnit} onChange={setAccumUnit} />
            </div>
          ) : null}

          {goalType === 'milestone' ? (
            <div className="space-y-2">
              <p className="label">Milestones</p>
              {milestones.map((milestone, idx) => (
                <div key={milestone.id} className="grid gap-2 sm:grid-cols-[32px_1fr_150px_auto]">
                  <span className="inline-flex items-center justify-center text-sm text-muted">
                    {idx + 1}
                  </span>
                  <input
                    value={milestone.name}
                    onChange={(event) =>
                      setMilestones((prev) =>
                        prev.map((item) =>
                          item.id === milestone.id ? { ...item, name: event.target.value } : item,
                        ),
                      )
                    }
                    className="input"
                    placeholder="Milestone name"
                  />
                  <input
                    type="date"
                    value={milestone.dueDate}
                    onChange={(event) =>
                      setMilestones((prev) =>
                        prev.map((item) =>
                          item.id === milestone.id ? { ...item, dueDate: event.target.value } : item,
                        ),
                      )
                    }
                    className="input"
                  />
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() =>
                      setMilestones((prev) =>
                        prev.length > 1 ? prev.filter((item) => item.id !== milestone.id) : prev,
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn-ghost"
                onClick={() =>
                  setMilestones((prev) => [...prev, { id: uid(), name: '', dueDate: '' }])
                }
              >
                + Add milestone
              </button>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <InputField label="Target date" type="date" value={targetDate} onChange={setTargetDate} />
            <div className="space-y-1">
              <p className="label">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => {
                  const selected = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() =>
                        setSelectedTagIds((prev) =>
                          selected ? prev.filter((id) => id !== tag.id) : [...prev, tag.id],
                        )
                      }
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                        selected
                          ? 'border-border bg-surface2 text-fg'
                          : 'border-border/70 text-muted hover:text-fg'
                      }`}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: tag.color }}
                        aria-hidden
                      />
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="label">{label}</label>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="input" />
    </div>
  );
}
