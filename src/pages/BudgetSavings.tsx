import { useMemo, useState } from 'react';
import BudgetHeader from '../components/budget/BudgetHeader';
import SavingsGoalCard from '../components/budget/SavingsGoalCard';
import AddSavingsGoalModal from '../components/budget/AddSavingsGoalModal';
import ContributeModal from '../components/budget/ContributeModal';
import {
  useAccounts,
  useBudgetPreferences,
  useSavingsGoals,
} from '../features/budget';
import type { SavingsGoal } from '../features/budget';

export default function BudgetSavings() {
  const { currency } = useBudgetPreferences();
  const { accounts } = useAccounts();
  const {
    savingsGoals,
    createSavingsGoal,
    updateSavingsGoal,
    deleteSavingsGoal,
    contribute,
  } = useSavingsGoals();

  const [modalOpen, setModalOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<SavingsGoal | null>(null);
  const [contributeGoal, setContributeGoal] = useState<SavingsGoal | null>(null);

  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const openCreate = () => {
    setEditGoal(null);
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <BudgetHeader
        title="Savings Goals"
        subtitle="Track progress toward what you're saving for."
        actions={
          <button type="button" className="btn-primary" onClick={openCreate}>
            + Goal
          </button>
        }
      />

      {savingsGoals.length === 0 ? (
        <div className="card">
          <p className="text-sm text-muted">No savings goals yet. Create one to start tracking.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
          {savingsGoals.map((goal) => (
            <SavingsGoalCard
              key={goal.id}
              goal={goal}
              linkedAccount={
                goal.linkedAccountId ? accountById.get(goal.linkedAccountId) : undefined
              }
              currency={currency}
              onContribute={() => setContributeGoal(goal)}
              onEdit={() => {
                setEditGoal(goal);
                setModalOpen(true);
              }}
              onDelete={() => {
                if (window.confirm(`Delete ${goal.name}?`)) deleteSavingsGoal(goal.id);
              }}
            />
          ))}
        </div>
      )}

      <AddSavingsGoalModal
        open={modalOpen}
        goal={editGoal}
        accounts={accounts}
        onClose={() => setModalOpen(false)}
        onSave={(input) => {
          if (editGoal) updateSavingsGoal(editGoal.id, input);
          else createSavingsGoal(input);
        }}
      />

      <ContributeModal
        open={!!contributeGoal}
        goal={contributeGoal}
        currency={currency}
        onClose={() => setContributeGoal(null)}
        onSave={(amount) => {
          if (contributeGoal) contribute(contributeGoal, amount);
        }}
      />
    </div>
  );
}
