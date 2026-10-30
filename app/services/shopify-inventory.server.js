import { saveHistory } from './inventory.server';

export async function adjustInventory(admin, session, variant, delta, logger, orderInfo = {}) {
  const { inventory_item_id, product_id, title: variant_title, id: variant_id } = variant;
  const locationId = await getLocationId(admin, session, logger);
  if (!locationId) throw new Error('No location_id found');

  const inventoryLevel = await getInventoryLevel(admin, session, inventory_item_id, locationId, logger);
  const newQuantity = (inventoryLevel || 0) + delta;

  await setInventoryLevel(admin, session, inventory_item_id, locationId, newQuantity, logger);

  const event = {
    timestamp: new Date(),
    orderId: orderInfo.order_id ? String(orderInfo.order_id) : null,
    orderName: orderInfo.order_name || null,
    productId: String(product_id),
    productTitle: orderInfo.product_title || null,
    variantId: String(variant_id),
    variantTitle: variant_title,
    oldQuantity: inventoryLevel,
    newQuantity: newQuantity,
    locationId: String(locationId),
  };
  await saveHistory(event);
}

export async function getLocationId(admin, session, logger) {
  const locations = await admin.rest.resources.Location.all({ session });
  const activeLocation = locations.data.find(loc => loc.active);
  return activeLocation ? activeLocation.id : null;
}

export async function getInventoryLevel(admin, session, inventory_item_id, location_id, logger) {
  const levels = await admin.rest.resources.InventoryLevel.list({
    session,
    inventory_item_ids: inventory_item_id,
    location_ids: location_id,
  });
  return levels.data[0]?.available;
}

export async function setInventoryLevel(admin, session, inventory_item_id, location_id, available, logger) {
  await admin.rest.resources.InventoryLevel.set({
    session,
    inventory_item_id,
    location_id,
    available,
  });
}
