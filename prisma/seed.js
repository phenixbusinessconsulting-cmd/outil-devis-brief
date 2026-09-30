// Catalogue initial : tous les modules du formulaire, prix à 0 € à renseigner
// dans l'administration. Relançable sans risque : les lignes existantes
// (même code) ne sont pas modifiées.
import { prisma } from '../src/db.js';

const M = (category, unit, entries) =>
  entries.map(([code, label, description = '']) => ({ code, label, description, category, unit }));

const items = [
  ...M('SITE', 'FORFAIT', [
    ['site.vitrine', 'Création du site vitrine', 'Conception, rédaction optimisée SEO, intégration responsive, mise en ligne.'],
    ['site.maquette', 'Maquette graphique personnalisée', 'Direction artistique et maquette de la page d’accueil.'],
    ['site.redaction', 'Rédaction de contenus', 'Textes optimisés pour le référencement local.'],
  ]),
  ...M('SITE', 'PAGE', [['site.page', 'Page supplémentaire', 'Page de prestation ou de ville, contenu rédigé.']]),
  ...M('RESEAUX_AVIS', 'FORFAIT', [
    ['reseaux.instagram', 'Flux Instagram'],
    ['reseaux.facebook', 'Page Facebook'],
    ['reseaux.avis-google', 'Avis Google affichés'],
    ['reseaux.widget-avis', 'Widget de dépôt d’avis'],
    ['reseaux.tiktok', 'TikTok'],
    ['reseaux.linkedin', 'LinkedIn'],
  ]),
  ...M('CONTACT_CONVERSION', 'FORFAIT', [
    ['contact.whatsapp', 'Bouton WhatsApp flottant'],
    ['contact.agent-whatsapp', 'Callbot ou agent conversationnel WhatsApp'],
    ['contact.chat', 'Chat en direct'],
    ['contact.chatbot', 'Chatbot de qualification'],
    ['contact.rappel', 'Rappel automatique'],
    ['contact.formulaire-devis', 'Formulaire de devis détaillé'],
    ['contact.rendez-vous', 'Prise de rendez-vous en ligne'],
    ['contact.click-to-call', 'Click-to-call mobile'],
  ]),
  ...M('COMMERCE_PAIEMENT', 'FORFAIT', [
    ['commerce.boutique', 'Boutique en ligne'],
    ['commerce.acompte', 'Paiement d’acompte en ligne'],
    ['commerce.devis-signature', 'Devis en ligne avec signature électronique'],
    ['commerce.click-collect', 'Click and collect'],
  ]),
  ...M('CONTENU_CONFIANCE', 'FORFAIT', [
    ['contenu.avant-apres', 'Galerie avant-après'],
    ['contenu.portfolio', 'Portfolio filtrable'],
    ['contenu.blog', 'Blog ou actualités'],
    ['contenu.faq', 'FAQ'],
    ['contenu.temoignages-video', 'Témoignages vidéo'],
    ['contenu.certifications', 'Affichage des certifications'],
  ]),
  ...M('ACQUISITION_MESURE', 'FORFAIT', [
    ['acquisition.analytics', 'Google Analytics'],
    ['acquisition.search-console', 'Search Console'],
    ['acquisition.conversions', 'Suivi des conversions'],
    ['acquisition.pixel-meta', 'Pixel Meta'],
    ['acquisition.newsletter', 'Newsletter'],
    ['acquisition.landing', 'Landing pages pour campagnes'],
  ]),
  ...M('TECHNIQUE_CONFORMITE', 'FORFAIT', [
    ['technique.cookies', 'Bannière cookies RGPD'],
    ['technique.confidentialite', 'Politique de confidentialité'],
    ['technique.accessibilite', 'Accessibilité renforcée'],
    ['technique.multilingue', 'Multilingue'],
  ]),
  ...M('TECHNIQUE_CONFORMITE', 'MOIS', [
    ['technique.hebergement', 'Hébergement et nom de domaine'],
    ['technique.maintenance', 'Maintenance'],
    ['technique.sauvegardes', 'Sauvegardes'],
  ]),
  ...M('VISIBILITE_LOCALE', 'FORFAIT', [
    ['local.gbp', 'Création ou optimisation de la fiche Google Business Profile'],
    ['local.annuaires', 'Annuaires locaux'],
  ]),
  ...M('VISIBILITE_LOCALE', 'MOIS', [
    ['local.publications', 'Publications Google Business'],
    ['local.avis', 'Gestion des avis'],
  ]),
].map((item, position) => ({ ...item, position }));

let created = 0;
for (const item of items) {
  const exists = await prisma.catalogItem.findUnique({ where: { code: item.code }, select: { id: true } });
  if (!exists) {
    await prisma.catalogItem.create({ data: item });
    created++;
  }
}
await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
console.log(`✓ Catalogue : ${created} ligne(s) créée(s), ${items.length - created} déjà présente(s)`);
await prisma.$disconnect();
