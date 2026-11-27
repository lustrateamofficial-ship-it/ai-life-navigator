import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { hapticNotification } from "../platform/sdk";
import { formatNumber } from "../utils/format";
import { FinanceCharts } from "../components/charts";
import { BudgetCard } from "../components/BudgetCard";

interface FinanceDashboard {
  income: number;
  expenses: number;
  balance: number;
  saved: number;
  debts: number;
}

// Финансы: отдельный экран, как и остальные разделы из «Я».
export function Finance() {
  const [finance, setFinance] = useState<FinanceDashboard | null>(null);
  const [txType, setTxType] = useState<"income" | "expense">("expense");
  const [txAmount, setTxAmount] = useState("");
  const [txCategory, setTxCategory] = useState("");
  const [addingTx, setAddingTx] = useState(false);

  async function loadAll() {
    setFinance(await api.get<FinanceDashboard>("/finance/dashboard"));
  }

  useEffect(() => {
    loadAll();
  }, []);

  // Раздел 17: без формы добавления дохода/расхода дашборд финансов всегда показывает 0.
  async function addTransaction() {
    const amount = parseFloat(txAmount.replace(",", "."));
    if (!amount || !txCategory.trim() || addingTx) return;
    setAddingTx(true);
    try {
      await api.post(`/finance/${txType === "income" ? "income" : "expenses"}`, {
        amount,
        category: txCategory,
      });
      hapticNotification("success");
      setTxAmount("");
      setTxCategory("");
      await loadAll();
    } finally {
      setAddingTx(false);
    }
  }

  const balanceClass = finance && finance.balance < 0 ? "stat-value bad" : "stat-value";

  return (
    <div className="screen">
      <Link className="back-link" to="/me">
        ← Я
      </Link>
      <header className="page-header">
        <h2>Финансы</h2>
        <p>Доходы, расходы и бюджет по категориям.</p>
      </header>

      <div className="card">
        <div className="card-title">Финансы</div>
        {finance && (
          <div className="stat-grid">
            <div className="stat">
              <div className="stat-label">Доходы за месяц</div>
              <div className="stat-value">{formatNumber(finance.income)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Расходы за месяц</div>
              <div className="stat-value">{formatNumber(finance.expenses)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Баланс месяца</div>
              <div className={balanceClass}>{formatNumber(finance.balance)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Накоплено всего</div>
              <div className="stat-value">{formatNumber(finance.saved)}</div>
            </div>
          </div>
        )}
        {finance && finance.debts > 0 && <p className="mt text">Долги всего: {finance.debts}</p>}
        <FinanceCharts reloadKey={(finance?.income ?? 0) + (finance?.expenses ?? 0)} />

        <div className="segmented mt" role="group" aria-label="Тип записи">
          <button aria-pressed={txType === "expense"} onClick={() => setTxType("expense")}>
            Расход
          </button>
          <button aria-pressed={txType === "income"} onClick={() => setTxType("income")}>
            Доход
          </button>
        </div>
        <div className="field-row mt">
          <input
            inputMode="decimal"
            aria-label="Сумма"
            placeholder="Сумма"
            value={txAmount}
            onChange={(e) => setTxAmount(e.target.value)}
            style={{ width: 110, flexShrink: 0 }}
          />
          <input aria-label="Категория" placeholder="Категория" value={txCategory} onChange={(e) => setTxCategory(e.target.value)} />
        </div>
        <button className="primary mt" onClick={addTransaction} disabled={addingTx}>
          {addingTx ? "Добавляю..." : txType === "income" ? "Добавить доход" : "Добавить расход"}
        </button>
      </div>

      <BudgetCard reloadKey={finance?.expenses ?? 0} />
    </div>
  );
}
