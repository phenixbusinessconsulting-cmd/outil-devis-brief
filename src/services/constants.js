// Libellés partagés : servis au navigateur par GET /api/meta.

export const CATEGORIES = [
  { code: 'SITE', label: 'Site et socle', module: false },
  { code: 'RESEAUX_AVIS', label: 'Réseaux sociaux et avis', module: true },
  { code: 'CONTACT_CONVERSION', label: 'Contact et conversion', module: true },
  { code: 'COMMERCE_PAIEMENT', label: 'Commerce et paiement', module: true },
  { code: 'CONTENU_CONFIANCE', label: 'Contenu et confiance', module: true },
  { code: 'ACQUISITION_MESURE', label: 'Acquisition et mesure', module: true },
  { code: 'TECHNIQUE_CONFORMITE', label: 'Technique et conformité', module: true },
  { code: 'VISIBILITE_LOCALE', label: 'Visibilité locale', module: true },
];

export const UNITS = [
  { code: 'FORFAIT', label: 'Forfait' },
  { code: 'PAGE', label: 'Par page' },
  { code: 'MOIS', label: 'Par mois' },
  { code: 'HEURE', label: 'Par heure' },
];

export const VAT_REGIMES = [
  { code: 'TVA_20', label: 'TVA française à 20 %' },
  { code: 'AUTOLIQUIDATION', label: 'Autoliquidation' },
  { code: 'EXONERATION', label: 'Exonération' },
];

export const TONES = [
  { code: 'PROXIMITE', label: 'Proximité' },
  { code: 'EXPERTISE', label: 'Expertise' },
  { code: 'PREMIUM', label: 'Premium' },
  { code: 'ACCESSIBLE', label: 'Accessible' },
];

export const REFERENCE_ELEMENTS = [
  { code: 'PALETTE', label: 'Palette de couleurs' },
  { code: 'TYPOGRAPHIE', label: 'Typographie' },
  { code: 'ANIMATIONS', label: 'Animations et transitions' },
  { code: 'STRUCTURE_ACCUEIL', label: 'Structure de la page d’accueil' },
  { code: 'PHOTOS', label: 'Style des photos' },
  { code: 'PRESTATIONS', label: 'Mise en page des prestations' },
  { code: 'FORMULAIRE', label: 'Style du formulaire' },
  { code: 'FOOTER', label: 'Pied de page' },
];

export const ANIMATION_LEVELS = [
  { code: 'AUCUNE', label: 'Aucune' },
  { code: 'SOBRE', label: 'Sobre' },
  { code: 'MARQUEE', label: 'Marquée' },
];

export const ORIGINS = [
  { code: 'MAISON', label: 'Réalisation maison' },
  { code: 'TIERS', label: 'Site tiers' },
];

export const PAYMENT_CHOICES = [
  { code: 'COMPTANT', label: 'Comptant' },
  { code: 'TROIS_FOIS', label: 'En trois fois' },
  { code: 'MENSUEL_12', label: 'Mensualisé 12 mois' },
  { code: 'MENSUEL_24', label: 'Mensualisé 24 mois' },
  { code: 'MENSUEL_36', label: 'Mensualisé 36 mois' },
];

export const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

export const labelOf = (list, code) => list.find((x) => x.code === code)?.label ?? code;
