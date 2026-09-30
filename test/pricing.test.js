import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLine, computeQuote, split } from '../src/services/pricing.js';

const base = {
  vatRegime: 'TVA_20',
  cashDiscountPct: 5,
  depositPct: 40,
  monthlySurcharge12Pct: 6,
  monthlySurcharge24Pct: 10,
  monthlySurcharge36Pct: 15,
  monthlyDownPayment: 0,
  validityDays: 30,
  issuedAt: '2026-01-31T10:00:00Z',
};

const line = (over) => ({
  position: 0,
  unitPriceHT: 100000,
  quantity: 1,
  discountType: 'AUCUNE',
  discountValue: 0,
  recurring: false,
  isOption: false,
  ...over,
});

test('remise en pourcentage et en euros par ligne', () => {
  assert.deepEqual(computeLine(line({ quantity: 2, discountType: 'POURCENT', discountValue: 10 })), {
    gross: 200000,
    discount: 20000,
    net: 180000,
  });
  assert.equal(computeLine(line({ discountType: 'MONTANT', discountValue: 15000 })).net, 85000);
  // Une remise ne rend jamais une ligne négative.
  assert.equal(computeLine(line({ discountType: 'MONTANT', discountValue: 999999 })).net, 0);
});

test('TVA 20 % : ponctuel, récurrent et options séparés', () => {
  const r = computeQuote({
    ...base,
    lines: [
      line({ unitPriceHT: 150000 }),
      line({ unitPriceHT: 4900, recurring: true, unit: 'MOIS' }),
      line({ unitPriceHT: 30000, isOption: true }),
    ],
  });
  assert.equal(r.oneOff.ht, 150000);
  assert.equal(r.oneOff.vat, 30000);
  assert.equal(r.oneOff.due, 180000);
  assert.equal(r.recurring.due, 5880);
  assert.equal(r.options.ht, 30000);
  assert.equal(r.showVat, true);
});

test('autoliquidation : aucune TVA, HT à régler, alerte sans numéro intracom', () => {
  const r = computeQuote({ ...base, vatRegime: 'AUTOLIQUIDATION', lines: [line({})] });
  assert.equal(r.oneOff.vat, 0);
  assert.equal(r.oneOff.due, 100000);
  assert.equal(r.showVat, false);
  assert.equal(r.reverseCharge, true);
  assert.equal(r.missingClientVat, true);
  const ok = computeQuote({ ...base, vatRegime: 'AUTOLIQUIDATION', clientVatNumber: 'BE0123456789', lines: [] });
  assert.equal(ok.missingClientVat, false);
});

test('modalités de règlement', () => {
  const r = computeQuote({ ...base, lines: [line({ unitPriceHT: 100000 })] }); // 1 200 € TTC
  const { cash, threeTimes, monthly } = r.payments;
  assert.equal(cash.total, 114000);
  assert.deepEqual(
    threeTimes.installments.map((i) => i.amount),
    [48000, 36000, 36000],
  );
  // 31 janvier + 1 mois = 28 février.
  assert.equal(threeTimes.installments[1].date.getUTCDate(), 28);
  const m12 = monthly.find((m) => m.months === 12);
  assert.equal(m12.totalCost, 127200);
  assert.equal(m12.monthlyAmount, 10600);
});

test('mensualisé avec apport', () => {
  const r = computeQuote({ ...base, monthlyDownPayment: 20000, lines: [line({})] });
  const m24 = r.payments.monthly.find((m) => m.months === 24);
  assert.equal(m24.financed, 100000);
  assert.equal(m24.totalCost, 20000 + 110000);
});

test('split : somme exacte', () => {
  const parts = split(100001, 3);
  assert.equal(parts.reduce((a, b) => a + b, 0), 100001);
});
