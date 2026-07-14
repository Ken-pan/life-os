-- 信用卡「实际扣款日」(提前还款)支持。
-- finance_accounts 增加 payment_day：用户常在到期日(due_day)前提前还款，
-- 现金会更早离开账户。设置后，现金流/日历/安全垫按此日建模；未设置回退 due_day。
-- 可空、非破坏性；与 due_day 同为 1-28 或 99(每月最后一天)。
ALTER TABLE "public"."finance_accounts"
  ADD COLUMN IF NOT EXISTS "payment_day" integer;
