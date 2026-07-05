import { useState } from "react";
import { useFinance, uid } from "../store/store";
import type { ScenarioEvent } from "../types";
import { signedMonthOffset } from "../engine/calendar";
import { DateField, NumberField, TextField } from "./fields";

type Kind = "income" | "expense";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function makeEvent(kind: Kind, date: string, amount: number, name: string): ScenarioEvent {
  const now = new Date();
  return {
    id: uid("evt"),
    name: name.trim() || (kind === "income" ? "一次性收入" : "一次性支出"),
    eventType: kind === "income" ? "windfall" : "one-time-purchase",
    enabled: true,
    amount,
    date,
    monthOffset: signedMonthOffset(now, date),
    fundingSource: kind === "expense" ? "checking" : undefined,
  };
}

export function CashflowQuickAddDrawer({ onClose }: { onClose: () => void }) {
  const store = useFinance();
  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState(0);
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayISO());

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) return;
    store.upsertEvent(makeEvent(kind, date, amount, name));
    onClose();
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-head">
          <h2>添加一次性收支</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            关闭
          </button>
        </div>

        <form onSubmit={add}>
          <div className="seg mb-3">
            <button
              type="button"
              className={kind === "expense" ? "active" : ""}
              onClick={() => setKind("expense")}
            >
              支出
            </button>
            <button
              type="button"
              className={kind === "income" ? "active" : ""}
              onClick={() => setKind("income")}
            >
              收入
            </button>
          </div>

          <NumberField label="金额" value={amount} onChange={setAmount} step={50} min={0} />
          <TextField
            label="名称"
            value={name}
            onChange={setName}
            placeholder={
              kind === "income" ? "如：报税退款 / 奖金" : "如：旅行 / 买设备 / 看病"
            }
          />
          <DateField label="日期" value={date} onChange={(v) => setDate(v || todayISO())} />

          <p className="meta mt-3 mb-0">
            过去的日期会记为「已发生」，不计入未来预测，只用于记录与对账。
          </p>

          <button
            className="btn mt-4 w-full"
            type="submit"
            disabled={amount <= 0}
          >
            添加
          </button>
        </form>
      </aside>
    </>
  );
}
