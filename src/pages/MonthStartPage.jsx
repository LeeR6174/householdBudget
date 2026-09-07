import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronLeft, ChevronRight, PiggyBank, WalletCards } from 'lucide-react';
import { db } from '../db/db';
import { formatCurrency } from '../utils/format';
import { getCurrentBudgetMonth, getMonthRange } from '../utils/dateUtils';
import { isSettledReimbursement } from '../utils/transactionUtils';

export default function MonthStartPage() {
  const navigate = useNavigate();
  const selectedMonth = getCurrentBudgetMonth();
  const [step, setStep] = useState(1);
  const [budgetInputs, setBudgetInputs] = useState({});
  const [savingsAmount, setSavingsAmount] = useState('');
  const [saved, setSaved] = useState(false);
  const { startDate, endDate } = getMonthRange(selectedMonth);

  const categories = useLiveQuery(() => db.categories.where('type').equals('expense').toArray().then(items => (
    items.sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
  ))) || [];
  const monthlyBudgets = useLiveQuery(() => db.monthlyBudgets.where('month').equals(selectedMonth).toArray()) || [];
  const monthlySetting = useLiveQuery(() => db.monthlySettings.get(selectedMonth));
  const monthTransactions = useLiveQuery(() => db.transactions.where('date').between(startDate, endDate, true, true).toArray()) || [];

  useEffect(() => {
    const nextInputs = {};
    categories.forEach(category => {
      const existing = monthlyBudgets.find(item => item.categoryId === category.id);
      nextInputs[category.id] = existing ? String(existing.budget) : category.monthlyLimit > 0 ? String(category.monthlyLimit) : '';
    });
    setBudgetInputs(nextInputs);
  }, [categories, monthlyBudgets]);

  useEffect(() => {
    setSavingsAmount(monthlySetting?.targetSavings === undefined ? '' : String(monthlySetting.targetSavings));
  }, [monthlySetting]);

  const normalBudgetTotal = useMemo(() => categories.reduce((total, category) => {
    const isEmergency = category.isEmergency || category.isFixed || category.name === '緊急支出';
    return isEmergency ? total : total + (Number(budgetInputs[category.id]) || 0);
  }, 0), [categories, budgetInputs]);

  const currentSpent = useMemo(() => monthTransactions
    .filter(transaction => transaction.type === 'expense' && !transaction.isSavingsDepletion && !isSettledReimbursement(transaction))
    .reduce((total, transaction) => total + transaction.amount, 0), [monthTransactions]);

  const emergencySpent = useMemo(() => monthTransactions
    .filter(transaction => transaction.type === 'expense' && transaction.categoryId && !transaction.isSavingsDepletion && !isSettledReimbursement(transaction))
    .filter(transaction => categories.find(category => category.id === transaction.categoryId && (category.isEmergency || category.isFixed || category.name === '緊急支出')))
    .reduce((total, transaction) => total + transaction.amount, 0), [categories, monthTransactions]);

  const expectedExpense = normalBudgetTotal + emergencySpent;

  const handleBudgetChange = (categoryId, value) => {
    setBudgetInputs(previous => ({ ...previous, [categoryId]: value }));
    setSaved(false);
  };

  const saveSettings = async () => {
    await db.transaction('rw', [db.monthlyBudgets, db.monthlySettings], async () => {
      const existingBudgets = await db.monthlyBudgets.where('month').equals(selectedMonth).toArray();
      await Promise.all(existingBudgets.map(item => db.monthlyBudgets.delete(item.id)));
      const budgetsToAdd = categories
        .filter(category => !(category.isEmergency || category.isFixed || category.name === '緊急支出'))
        .map(category => ({ categoryId: category.id, month: selectedMonth, budget: Number(budgetInputs[category.id]) || 0 }))
        .filter(item => item.budget >= 0);
      if (budgetsToAdd.length > 0) await db.monthlyBudgets.bulkAdd(budgetsToAdd);
      await db.monthlySettings.put({ month: selectedMonth, targetSavings: Number(savingsAmount) || 0 });
    });
    setSaved(true);
  };

  return (
    <div className="page-container month-start-page">
      <div className="flex gap-sm items-center mb-lg">
        <button className="btn-back" onClick={() => navigate(-1)}><ChevronLeft size={24} /><span>戻る</span></button>
        <div className="page-title" style={{ marginBottom: 0 }}>月初めセッティング</div>
      </div>

      <div className="month-start-intro">
        <div className="text-sm font-bold">{selectedMonth.replace('-', '年')}月分を準備</div>
        <div className="text-xs text-secondary">予算、貯金積立額、最終予想支出を順番に確認します。</div>
      </div>

      <div className="stepper" aria-label="月初め設定の手順">
        {[['1', '予算'], ['2', '貯金'], ['3', '確認']].map(([number, label]) => (
          <div key={number} className={`stepper-item ${step >= Number(number) ? 'active' : ''}`}>
            <span>{step > Number(number) ? <Check size={14} /> : number}</span><small>{label}</small>
          </div>
        ))}
      </div>

      {step === 1 && (
        <section className="card setup-section">
          <div className="setup-section-title"><WalletCards size={20} /><div><h2>今月の予算</h2><p>カテゴリごとの予算を入力してください。</p></div></div>
          <div className="setup-fields">
            {categories.filter(category => !(category.isEmergency || category.isFixed || category.name === '緊急支出')).map(category => (
              <label key={category.id} className="setup-field">
                <span><i style={{ backgroundColor: category.color || '#94a3b8' }} />{category.name}</span>
                <div><span>¥</span><input type="number" inputMode="numeric" min="0" value={budgetInputs[category.id] || ''} onChange={event => handleBudgetChange(category.id, event.target.value)} placeholder="0" /></div>
              </label>
            ))}
          </div>
          {categories.filter(category => !(category.isEmergency || category.isFixed || category.name === '緊急支出')).length === 0 && <p className="empty-state">先にカテゴリ管理から支出カテゴリを追加してください。</p>}
          <button className="btn btn-primary" onClick={() => setStep(2)}>次へ：貯金積立額 <ChevronRight size={18} /></button>
        </section>
      )}

      {step === 2 && (
        <section className="card setup-section">
          <div className="setup-section-title"><PiggyBank size={20} /><div><h2>{selectedMonth.split('-')[1]}月の貯金積立額</h2><p>今月、先取りして貯金する金額を設定します。</p></div></div>
          <label className="setup-large-field"><span>積立額</span><div><span>¥</span><input type="number" inputMode="numeric" min="0" value={savingsAmount} onChange={event => { setSavingsAmount(event.target.value); setSaved(false); }} placeholder="0" /></div></label>
          <div className="setup-actions"><button className="btn btn-outline" onClick={() => setStep(1)}><ChevronLeft size={18} />戻る</button><button className="btn btn-primary" onClick={() => setStep(3)}>次へ：最終確認 <ChevronRight size={18} /></button></div>
        </section>
      )}

      {step === 3 && (
        <section className="card setup-section">
          <div className="setup-section-title"><Check size={20} /><div><h2>今月の見込み</h2><p>保存前に、この月の着地点を確認できます。</p></div></div>
          <div className="setup-summary"><div><span>予算合計</span><strong>{formatCurrency(normalBudgetTotal)}</strong></div><div><span>貯金積立額</span><strong className="text-primary">-{formatCurrency(Number(savingsAmount) || 0)}</strong></div><div className="setup-summary-total"><span>最終的な合計予想支出</span><strong>{formatCurrency(expectedExpense)}</strong><small>予算合計 + 今月すでに発生している緊急支出</small></div><div><span>現在までの支出</span><strong>{formatCurrency(currentSpent)}</strong></div></div>
          <div className="setup-actions"><button className="btn btn-outline" onClick={() => setStep(2)}><ChevronLeft size={18} />戻る</button><button className="btn btn-primary" onClick={saveSettings}>{saved ? <Check size={18} /> : <Check size={18} />}<span>{saved ? '保存済み' : 'この内容で保存'}</span></button></div>
        </section>
      )}
    </div>
  );
}
