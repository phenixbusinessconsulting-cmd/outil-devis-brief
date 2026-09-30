import { computeQuote, formatEuros, formatDate, REVERSE_CHARGE_MENTION, UNIT_LABELS } from './pricing.js';
import { labelOf, PAYMENT_CHOICES } from './constants.js';

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const qty = (q) => String(q).replace('.', ',');

function discountLabel(l) {
  if (l.discountType === 'POURCENT' && l.discountValue) return `−${qty(l.discountValue)} %`;
  if (l.discountType === 'MONTANT' && l.discountValue) return `−${formatEuros(l.discountValue)}`;
  return '';
}

function table(lines) {
  const out = ['| Désignation | Qté | Unité | PU HT | Remise | Total HT |', '|---|---:|---|---:|---:|---:|'];
  lines.forEach((l) => {
    const label = l.description ? `**${esc(l.label)}** — ${esc(l.description)}` : `**${esc(l.label)}**`;
    out.push(
      `| ${label} | ${qty(l.quantity)} | ${UNIT_LABELS[l.unit]} | ${formatEuros(l.unitPriceHT)} | ${discountLabel(l)} | ${formatEuros(l.amounts.net)} |`,
    );
  });
  return out.join('\n');
}

function totals(t, r, suffix = '') {
  const out = [`- Total HT${suffix} : **${formatEuros(t.ht)}**`];
  if (t.discount) out.push(`- dont remises : ${formatEuros(t.discount)}`);
  if (r.showVat) {
    out.push(`- TVA ${t.vatRate} % : ${formatEuros(t.vat)}`);
    out.push(`- **Total TTC${suffix} : ${formatEuros(t.ttc)}**`);
  } else {
    out.push(`- **Montant à régler${suffix} : ${formatEuros(t.due)}**`);
  }
  return out.join('\n');
}

export function buildQuoteMarkdown(quote, client, settings) {
  const r = computeQuote(quote);
  const brand = client.nomCommercial || client.raisonSociale;
  const out = [];
  out.push(`# Devis ${quote.number || '(brouillon)'}`, '');
  out.push(`**${settings.providerName}**`);
  [settings.providerAddress, settings.providerSiret && `SIRET ${settings.providerSiret}`, settings.providerVatNumber && `TVA ${settings.providerVatNumber}`, settings.providerEmail, settings.providerPhone]
    .filter(Boolean)
    .forEach((x) => out.push(`${x}  `));
  out.push('');
  out.push(`**Client : ${client.raisonSociale}**${brand !== client.raisonSociale ? ` (${brand})` : ''}  `);
  [client.adresse, [client.codePostal, client.ville].filter(Boolean).join(' '), client.siret && `SIRET ${client.siret}`, quote.clientVatNumber && `TVA intracommunautaire ${quote.clientVatNumber}`]
    .filter(Boolean)
    .forEach((x) => out.push(`${x}  `));
  out.push('');
  out.push(`- Date d’émission : ${formatDate(r.issuedAt)}`);
  out.push(`- Validité : ${quote.validityDays} jours, jusqu’au ${formatDate(r.validUntil)}`);
  out.push('');

  if (r.oneOffLines.length) {
    out.push('## Prestations ponctuelles', '', table(r.oneOffLines), '', totals(r.oneOff, r), '');
  }
  if (r.recurringLines.length) {
    out.push('## Prestations récurrentes mensuelles', '', table(r.recurringLines), '', totals(r.recurring, r, ' par mois'), '');
  }
  if (r.optionLines.length) {
    out.push('## Options (non incluses dans le total)', '', table(r.optionLines), '', totals(r.options, r), '');
  }

  if (r.oneOff.due > 0) {
    const p = r.payments;
    out.push('## Modalités de règlement (prestations ponctuelles)', '');
    if (quote.selectedPayment) out.push(`**Modalité retenue : ${labelOf(PAYMENT_CHOICES, quote.selectedPayment)}**`, '');
    out.push(
      `### Comptant`,
      '',
      p.cash.discount
        ? `Remise de ${qty(p.cash.discountPct)} % : ${formatEuros(p.cash.discount)} — **${formatEuros(p.cash.total)}** à la commande.`
        : `**${formatEuros(p.cash.total)}** à la commande.`,
      '',
      '### En trois fois',
      '',
    );
    p.threeTimes.installments.forEach((i) => out.push(`- ${i.label} (${formatDate(i.date)}) : ${formatEuros(i.amount)}`));
    out.push('', '### Mensualisé', '');
    if (quote.monthlyDownPayment) out.push(`Apport à la commande : ${formatEuros(quote.monthlyDownPayment)}`, '');
    out.push('| Durée | Majoration | Mensualité | Coût total |', '|---|---:|---:|---:|');
    p.monthly.forEach((m) =>
      out.push(`| ${m.months} mois | ${qty(m.surchargePct)} % | ${formatEuros(m.monthlyAmount)} | ${formatEuros(m.totalCost)} |`),
    );
    out.push('');
  }

  if (quote.notes) out.push('## Remarques', '', quote.notes, '');

  out.push('---', '');
  if (r.reverseCharge) out.push(`**${REVERSE_CHARGE_MENTION}**`, '');
  if (quote.vatRegime === 'EXONERATION' && quote.exemptionMention) out.push(`**${quote.exemptionMention}**`, '');
  if (quote.legalMentions) out.push(quote.legalMentions, '');
  out.push('Bon pour accord, date et signature du client :', '', '&nbsp;', '', '&nbsp;', '');
  return out.join('\n');
}
