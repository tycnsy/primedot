import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import ModalShell from '../goals/ModalShell';
import { BUDGET_TABS } from '../../features/budget/budgetTabs';
import { useBudgetPreferences } from '../../features/budget/preferences';

interface ManageBudgetTabsModalProps {
  open: boolean;
  onClose: () => void;
}

function OpenLinkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 4h6v6" />
      <path d="M10 14 20 4" />
      <path d="M20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5" />
    </svg>
  );
}

function EyeOpenIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

function EyeClosedIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 6.3A11.8 11.8 0 0 1 12 6c6.5 0 10 6 10 6a18.8 18.8 0 0 1-4 4.7" />
      <path d="M6.7 6.8C3.8 8.5 2 12 2 12s3.5 6 10 6c1.3 0 2.5-.2 3.7-.6" />
      <path d="M9.8 9.8a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

function TabRow({
  tab,
  isHidden,
  onToggleHidden,
  onNavigate,
}: {
  tab: (typeof BUDGET_TABS)[number];
  isHidden: boolean;
  onToggleHidden: () => void;
  onNavigate: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-surface2/60">
      {isHidden ? (
        <Link
          to={tab.to}
          onClick={onNavigate}
          className="btn-ghost !px-1.5 !py-1 text-muted"
          aria-label={`Open ${tab.label}`}
          title={`Open ${tab.label}`}
        >
          <OpenLinkIcon />
        </Link>
      ) : (
        <span className="w-[26px]" aria-hidden />
      )}
      <span className="truncate text-sm text-fg">{tab.label}</span>
      <button
        type="button"
        aria-label={isHidden ? `Show ${tab.label}` : `Hide ${tab.label}`}
        title={isHidden ? 'Show page' : 'Hide page'}
        className="btn-ghost ml-auto !px-1.5 !py-1"
        onClick={onToggleHidden}
      >
        {isHidden ? <EyeClosedIcon /> : <EyeOpenIcon />}
      </button>
    </div>
  );
}

export default function ManageBudgetTabsModal({ open, onClose }: ManageBudgetTabsModalProps) {
  const { hiddenBudgetTabIds, toggleBudgetTabHidden } = useBudgetPreferences();

  const hiddenSet = useMemo(() => new Set(hiddenBudgetTabIds), [hiddenBudgetTabIds]);

  const visibleTabs = useMemo(
    () => BUDGET_TABS.filter((tab) => !hiddenSet.has(tab.id)),
    [hiddenSet],
  );

  const hiddenTabs = useMemo(
    () => BUDGET_TABS.filter((tab) => hiddenSet.has(tab.id)),
    [hiddenSet],
  );

  return (
    <ModalShell open={open} title="Manage pages" onClose={onClose} maxWidthClassName="max-w-[420px]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Visible</h3>
          {visibleTabs.length === 0 ? (
            <p className="rounded-md bg-surface2 px-2.5 py-2 text-xs text-muted">No visible pages.</p>
          ) : (
            visibleTabs.map((tab) => (
              <TabRow
                key={tab.id}
                tab={tab}
                isHidden={false}
                onToggleHidden={() => toggleBudgetTabHidden(tab.id)}
                onNavigate={onClose}
              />
            ))
          )}
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Hidden</h3>
          {hiddenTabs.length === 0 ? (
            <p className="rounded-md bg-surface2 px-2.5 py-2 text-xs text-muted">No hidden pages.</p>
          ) : (
            hiddenTabs.map((tab) => (
              <TabRow
                key={tab.id}
                tab={tab}
                isHidden
                onToggleHidden={() => toggleBudgetTabHidden(tab.id)}
                onNavigate={onClose}
              />
            ))
          )}
        </div>
      </div>
    </ModalShell>
  );
}
