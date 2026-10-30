import prisma from '../db.server';

export async function getHistory(limit = 200) {
  return prisma.inventoryHistory.findMany({
    orderBy: { timestamp: 'desc' },
    take: limit,
  });
}

export async function saveHistory(event) {
  await prisma.inventoryHistory.create({ data: event });
}

export async function isOrderProcessed(orderId) {
  const found = await prisma.processedOrder.findUnique({ where: { orderId: String(orderId) } });
  return !!found;
}

export async function markOrderProcessed(orderId) {
  await prisma.processedOrder.upsert({
    where: { orderId: String(orderId) },
    update: {},
    create: { orderId: String(orderId) },
  });
}
