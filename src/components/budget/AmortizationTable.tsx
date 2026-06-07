import { formatMoney } from '../../features/budget';
import type { AmortizationRow } from '../../features/budget';

interface AmortizationTableProps {
  schedule: AmortizationRow[];
  currency: string;
  maxRows?: number;
}

export default function AmortizationTable({
  schedule,
  currency,
  maxRows = 60,
}: AmortizationTableProps) {
  const rows = schedule.slice(0, maxRows);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-muted">
          <tr>
            <th className="py-1 pr-3 font-medium">Mo.</th>
            <th className="py-1 pr-3 font-medium">Payment</th>
            <th className="py-1 pr-3 font-medium">Interest</th>
            <th className="py-1 pr-3 font-medium">Principal</th>
            <th className="py-1 font-medium">Balance</th>
          </tr>
        </thead>
        <tbody className="tabular-nums text-fg">
          {rows.map((row) => (
            <tr key={row.month} className="border-t border-border/60">
              <td className="py-1 pr-3 text-muted">{row.month}</td>
              <td className="py-1 pr-3">{formatMoney(row.payment, currency)}</td>
              <td className="py-1 pr-3 text-danger">{formatMoney(row.interest, currency)}</td>
              <td className="py-1 pr-3">{formatMoney(row.principal, currency)}</td>
              <td className="py-1">{formatMoney(row.balance, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {schedule.length > rows.length ? (
        <p className="mt-1 text-[11px] text-muted">
          Showing first {rows.length} of {schedule.length} months.
        </p>
      ) : null}
    </div>
  );
}
