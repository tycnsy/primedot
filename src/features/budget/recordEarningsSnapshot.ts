import type { SupabaseClient } from '@supabase/supabase-js';
import { earningsForMonth } from './compute/earnings';
import { monthKey } from './compute/dates';
import type { IncomeEntry } from './types';

export async function recordEarningsSnapshotsForMonths(
  supabase: SupabaseClient,
  userId: string,
  months: string[],
  incomeEntries: IncomeEntry[],
  note?: string,
): Promise<void> {
  const uniqueMonths = [...new Set(months.map((m) => monthKey(m)))];

  for (const month of uniqueMonths) {
    const total = earningsForMonth(month, incomeEntries);

    const { data: latest, error: fetchError } = await supabase
      .from('budget_monthly_earnings_snapshots')
      .select('total_amount')
      .eq('user_id', userId)
      .eq('earned_month', month)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (latest && Number(latest.total_amount) === total) continue;

    const { error: insertError } = await supabase
      .from('budget_monthly_earnings_snapshots')
      .insert({
        user_id: userId,
        earned_month: month,
        total_amount: total,
        note: note ?? null,
      });

    if (insertError) throw insertError;
  }
}
