// Calculs du devis. Fonctions pures, en centimes : l'écran, l'impression et
// l'export Markdown passent tous par ici, ils affichent donc les mêmes chiffres.

export const VAT_RATES = { TVA_20: 20, AUTOLIQUIDATION: 0, EXONERATION: 0 };

export const REVERSE_CHARGE_MENTION =
  'Autoliquidation de la TVA par le preneur — article 283-2 du Code général des impôts';

export const UNIT_LABELS = { FORFAIT: 'forfait', PAGE: 'page', MOIS: 'mois', HEURE: 'heure' };

export function computeLine(line) {
  const quantity = Number(line.quantity) || 0;
  const gross = Math.round(line.unitPriceHT * quantity);
  let discount = 0;
  if (line.discountType === 'POURCENT') {
    discount = Math.round((gross * Math.min(Math.max(line.discountValue, 0), 100)) / 100);
  } else if (line.discountType === 'MONTANT') {
    discount = Math.min(Math.round(Math.max(line.discountValue, 0)), gross);
  }
  return { gross, discount, net: gross - discount };
}

function totalsFor(lines, vatRegime) {
  const rate = VAT_RATES[vatRegime] ?? 20;
  const ht = lines.reduce((sum, l) => sum + l.amounts.net, 0);
  const discount = lines.reduce((sum, l) => sum + l.amounts.discount, 0);
  const vat = Math.round((ht * rate) / 100);
  // Autoliquidation et exonération : le HT est le montant à régler.
  return { ht, discount, vatRate: rate, vat, ttc: ht + vat, due: ht + vat, count: lines.length };
}

function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // 31 janvier + 1 mois → dernier jour de février, pas 3 mars.
  if (d.getDate() < day) d.setDate(0);
  return d;
}

/** Répartit un montant en n parts entières dont la somme est exacte. */
export function split(amount, n) {
  const base = Math.floor(amount / n);
  const parts = Array(n).fill(base);
  parts[n - 1] += amount - base * n;
  return parts;
}

export function computePayments(quote, dueOneOff, startDate = new Date()) {
  const cashDiscount = Math.round((dueOneOff * (quote.cashDiscountPct || 0)) / 100);
  const cash = { discountPct: quote.cashDiscountPct || 0, discount: cashDiscount, total: dueOneOff - cashDiscount };

  const deposit = Math.round((dueOneOff * (quote.depositPct ?? 40)) / 100);
  const [second, third] = split(dueOneOff - deposit, 2);
  const threeTimes = {
    depositPct: quote.depositPct ?? 40,
    total: dueOneOff,
    installments: [
      { label: 'À la commande', amount: deposit, date: new Date(startDate) },
      { label: 'Deuxième échéance', amount: second, date: addMonths(startDate, 1) },
      { label: 'Solde', amount: third, date: addMonths(startDate, 2) },
    ],
  };

  const downPayment = Math.min(Math.max(quote.monthlyDownPayment || 0, 0), dueOneOff);
  const monthly = [12, 24, 36].map((months) => {
    const surchargePct = quote[`monthlySurcharge${months}Pct`] || 0;
    const financed = dueOneOff - downPayment;
    const surcharge = Math.round((financed * surchargePct) / 100);
    const parts = split(financed + surcharge, months);
    return {
      months,
      surchargePct,
      downPayment,
      financed,
      surcharge,
      monthlyAmount: parts[0],
      lastAmount: parts[months - 1],
      totalCost: downPayment + financed + surcharge,
    };
  });

  return { cash, threeTimes, monthly };
}

/**
 * Totaux complets : prestations ponctuelles, mensualités récurrentes et
 * options (chiffrées à part, hors total) ; puis les trois modalités de
 * règlement, calculées sur le ponctuel.
 */
export function computeQuote(quote) {
  const lines = [...(quote.lines || [])]
    .sort((a, b) => a.position - b.position)
    .map((l) => ({ ...l, amounts: computeLine(l) }));
  const oneOffLines = lines.filter((l) => !l.recurring && !l.isOption);
  const recurringLines = lines.filter((l) => l.recurring && !l.isOption);
  const optionLines = lines.filter((l) => l.isOption);

  const oneOff = totalsFor(oneOffLines, quote.vatRegime);
  const recurring = totalsFor(recurringLines, quote.vatRegime);
  const options = totalsFor(optionLines, quote.vatRegime);

  const issuedAt = quote.issuedAt ? new Date(quote.issuedAt) : new Date();
  const validUntil = new Date(issuedAt);
  validUntil.setDate(validUntil.getDate() + (quote.validityDays || 30));

  return {
    lines,
    oneOffLines,
    recurringLines,
    optionLines,
    oneOff,
    recurring,
    options,
    showVat: quote.vatRegime === 'TVA_20',
    reverseCharge: quote.vatRegime === 'AUTOLIQUIDATION',
    missingClientVat: quote.vatRegime === 'AUTOLIQUIDATION' && !String(quote.clientVatNumber || '').trim(),
    payments: computePayments(quote, oneOff.due, issuedAt),
    issuedAt,
    validUntil,
  };
}

export function formatEuros(cents) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
    .format(cents / 100)
    .replace(/ /g, ' ');
}

export function formatDate(date) {
  return new Intl.DateTimeFormat('fr-FR').format(new Date(date));
}
