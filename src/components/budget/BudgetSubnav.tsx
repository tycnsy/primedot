import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { BUDGET_TABS } from '../../features/budget/budgetTabs';
import { useBudgetPreferences } from '../../features/budget/preferences';
import ManageBudgetTabsModal from './ManageBudgetTabsModal';

function EditIcon() {
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
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L8 20l-5 1 1-5Z" />
    </svg>
  );
}

export default function BudgetSubnav() {
  const { hiddenBudgetTabIds } = useBudgetPreferences();
  const [modalOpen, setModalOpen] = useState(false);

  const hiddenSet = useMemo(() => new Set(hiddenBudgetTabIds), [hiddenBudgetTabIds]);

  const visibleTabs = useMemo(
    () => BUDGET_TABS.filter((tab) => !hiddenSet.has(tab.id)),
    [hiddenSet],
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1 rounded-lg border border-border bg-surface2/70 p-1">
          {visibleTabs.map((tab) => (
            <NavLink
              key={tab.id}
              to={tab.to}
              end={'end' in tab ? tab.end : undefined}
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
        <button
          type="button"
          className="btn-ghost shrink-0 !px-2 !py-1.5"
          onClick={() => setModalOpen(true)}
          aria-label="Manage pages"
          title="Manage pages"
        >
          <EditIcon />
        </button>
      </div>

      <ManageBudgetTabsModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
