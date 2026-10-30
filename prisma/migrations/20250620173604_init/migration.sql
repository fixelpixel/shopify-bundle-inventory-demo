-- CreateTable
CREATE TABLE "InventoryHistory" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT,
    "orderName" TEXT,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT,
    "variantId" TEXT NOT NULL,
    "variantTitle" TEXT,
    "oldQuantity" INTEGER,
    "newQuantity" INTEGER,
    "locationId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedOrder" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopToken" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "token" TEXT NOT NULL,

    CONSTRAINT "ShopToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedOrder_orderId_key" ON "ProcessedOrder"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopToken_shop_key" ON "ShopToken"("shop");
