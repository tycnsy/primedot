-- Enum values must be committed before they can be referenced in constraints.
-- Keep this migration separate from column/constraint changes (see 034).

alter type budget_txn_type add value if not exists 'transfer';
