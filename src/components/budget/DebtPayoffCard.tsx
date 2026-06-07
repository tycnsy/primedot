import { useState } from 'react';
import AmortizationTable from './AmortizationTable';
import {
  computePayoff,
  creditUtilization,
  formatMoney,
  formatPercent,
  paymentForMode,
} from '../../features/budget';
import type { Account, PayoffMode } from '../../features/budget';

interface DebtPayoffCardProps {
  account: Account;
  balance: number;
  currency: string;
  mode: PayoffMode;
  extraPayment: number;
}

export default function DebtPayoffCard({
  account,
  balance,
  currency,
  mode,
  extraPayment,
}: DebtPayoffCardProps) {
  const [showSchedule, setShowSchedule] = useState(false);

  const payment = paymentForMode(account, mode, extraPayment);
  const payoff = computePayoff({
    balance,
    apr: account.apr ?? 0,
    monthlyPayment: payment,
  });
  const utilization = creditUtilization(account, balance);

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-fg">{account.name}</p>
          <p className="text-xs text-muted">APR {account.apr ?? 0}%</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">Owed</p>
          <p className="text-lg font-semibold tabular-nums text-danger">
            {formatMoney(balance, currency)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric
          label="Utilization"
          value={utilization != null ? formatPercent(utilization) : '—'}
        />
        <Metric label="Payment / mo" value={formatMoney(payment, currency)} />
        <Metric
          label="Payoff"
          value={payoff.neverPaysOff ? 'Never' : `${payoff.months} mo`}
          danger={payoff.neverPaysOff}
        />
      </div>

      {payoff.neverPaysOff ? (
        <p className="text-xs text-danger">
          The current payment does not cover monthly interest. Increase the payment to make progress.
        </p>
      ) : (
        <p className="text-xs text-muted">
          Total interest:{' '}
          <span className="font-medium text-fg">{formatMoney(payoff.totalInterest, currency)}</span>{' '}
          · Total paid {formatMoney(payoff.totalPaid, currency)}
        </p>
      )}

      {payoff.schedule.length > 0 ? (
        <div>
          <button
            type="button"
            className="btn-ghost !px-2 !py-1 text-xs"
            onClick={() => setShowSchedule((value) => !value)}
          >
            {showSchedule ? 'Hide' : 'Show'} amortization
          </button>
          {showSchedule ? (
            <div className="mt-2">
              <AmortizationTable schedule={payoff.schedule} currency={currency} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg bg-surface2/60 p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${danger ? 'text-danger' : 'text-fg'}`}>
        {value}
      </p>
    </div>
  );
}
