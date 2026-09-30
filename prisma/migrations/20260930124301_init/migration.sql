-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "sid" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "vatRegime" TEXT NOT NULL DEFAULT 'TVA_20',
    "exemptionMention" TEXT NOT NULL DEFAULT 'TVA non applicable, article 293 B du Code général des impôts',
    "cashDiscountPct" REAL NOT NULL DEFAULT 0,
    "depositPct" REAL NOT NULL DEFAULT 40,
    "monthlySurcharge12Pct" REAL NOT NULL DEFAULT 0,
    "monthlySurcharge24Pct" REAL NOT NULL DEFAULT 0,
    "monthlySurcharge36Pct" REAL NOT NULL DEFAULT 0,
    "quoteValidityDays" INTEGER NOT NULL DEFAULT 30,
    "providerName" TEXT NOT NULL DEFAULT 'Phenix Group International',
    "providerAddress" TEXT NOT NULL DEFAULT '',
    "providerSiret" TEXT NOT NULL DEFAULT '',
    "providerVatNumber" TEXT NOT NULL DEFAULT '',
    "providerEmail" TEXT NOT NULL DEFAULT '',
    "providerPhone" TEXT NOT NULL DEFAULT '',
    "legalMentions" TEXT NOT NULL DEFAULT '',
    "clientRetentionMonths" INTEGER NOT NULL DEFAULT 36,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "basePriceHT" INTEGER NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'FORFAIT',
    "category" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Client" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdById" INTEGER NOT NULL,
    "raisonSociale" TEXT NOT NULL,
    "nomCommercial" TEXT NOT NULL DEFAULT '',
    "secteur" TEXT NOT NULL DEFAULT '',
    "anneeCreation" INTEGER,
    "siret" TEXT NOT NULL DEFAULT '',
    "formeJuridique" TEXT NOT NULL DEFAULT '',
    "assurances" TEXT NOT NULL DEFAULT '',
    "tvaIntracom" TEXT NOT NULL DEFAULT '',
    "adresse" TEXT NOT NULL DEFAULT '',
    "codePostal" TEXT NOT NULL DEFAULT '',
    "ville" TEXT NOT NULL DEFAULT '',
    "communes" JSONB NOT NULL,
    "rayonKm" INTEGER,
    "motClePrincipal" TEXT NOT NULL DEFAULT '',
    "motsClesSecond" JSONB NOT NULL,
    "longueTraine" JSONB NOT NULL,
    "concurrents" JSONB NOT NULL,
    "nbAvisGoogle" INTEGER,
    "noteGoogle" REAL,
    "temoignages" TEXT NOT NULL DEFAULT '',
    "realisations" TEXT NOT NULL DEFAULT '',
    "certifications" TEXT NOT NULL DEFAULT '',
    "telephone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "horaires" JSONB NOT NULL,
    "reseaux" JSONB NOT NULL,
    "lienGbp" TEXT NOT NULL DEFAULT '',
    "tons" JSONB NOT NULL,
    "elementsLangage" TEXT NOT NULL DEFAULT '',
    "couleursImposees" JSONB NOT NULL,
    "policesImposees" TEXT NOT NULL DEFAULT '',
    "niveauAnimation" TEXT NOT NULL DEFAULT 'SOBRE',
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Client_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientOffering" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clientId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priceMin" INTEGER,
    "priceMax" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ClientOffering_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientModule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clientId" INTEGER NOT NULL,
    "catalogItemId" INTEGER NOT NULL,
    "precision" TEXT NOT NULL DEFAULT '',
    "isOption" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ClientModule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientModule_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VisualReference" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clientId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'TIERS',
    "elements" JSONB NOT NULL,
    "likes" TEXT NOT NULL DEFAULT '',
    "avoid" TEXT NOT NULL DEFAULT '',
    "inspirationLevel" INTEGER NOT NULL DEFAULT 3,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "VisualReference_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Screenshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "referenceId" INTEGER NOT NULL,
    "storedName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "caption" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Screenshot_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "VisualReference" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuoteSequence" (
    "year" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lastNumber" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT,
    "clientId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BROUILLON',
    "issuedAt" DATETIME,
    "validityDays" INTEGER NOT NULL,
    "vatRegime" TEXT NOT NULL,
    "clientVatNumber" TEXT NOT NULL DEFAULT '',
    "cashDiscountPct" REAL NOT NULL,
    "depositPct" REAL NOT NULL,
    "monthlySurcharge12Pct" REAL NOT NULL,
    "monthlySurcharge24Pct" REAL NOT NULL,
    "monthlySurcharge36Pct" REAL NOT NULL,
    "monthlyDownPayment" INTEGER NOT NULL DEFAULT 0,
    "selectedPayment" TEXT NOT NULL DEFAULT '',
    "exemptionMention" TEXT NOT NULL DEFAULT '',
    "legalMentions" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Quote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "quoteId" INTEGER NOT NULL,
    "catalogItemId" INTEGER,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL,
    "unitPriceHT" INTEGER NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 1,
    "discountType" TEXT NOT NULL DEFAULT 'AUCUNE',
    "discountValue" REAL NOT NULL DEFAULT 0,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "isOption" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuoteLine_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_code_key" ON "CatalogItem"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ClientModule_clientId_catalogItemId_key" ON "ClientModule"("clientId", "catalogItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Screenshot_storedName_key" ON "Screenshot"("storedName");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_number_key" ON "Quote"("number");
