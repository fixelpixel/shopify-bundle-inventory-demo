import { authenticate } from "../shopify.server";
import prisma  from "../db.server";

// Минимальная функция поиска продукта по title через GraphQL
async function findProductByTitle(admin, productTitle) {
  const query = `#graphql
    query FindProduct($query: String!) {
      products(first: 1, query: $query) {
        edges {
          node {
            id
            title
            metafield(namespace: "custom", key: "has_bundle_product") {
              id
              namespace
              key
              value
            }
            variants(first: 100) {
              edges {
                node {
                  id
                  selectedOptions { name value }
                  inventoryQuantity
                  inventoryItem { id }
                }
              }
            }
          }
        }
      }
    }
  `;
  const response = await admin.graphql(query, { variables: { query: `title:\"${productTitle}\"` } });
  const data = await response.json();
  return data?.data?.products?.edges?.[0]?.node || null;
}

export const handleOrderWebhook = async ({ request }) => {
  const { admin, payload } = await authenticate.webhook(request);

  // Проверка на повторную обработку заказа
  const existing = await prisma.processedOrder.findUnique({
    where: { orderId: String(payload.id) }
  });
  if (existing) {
    return new Response('SKIP: already processed', { status: 200 });
  }

  const locationId = await getFirstLocationId(admin);
  
  // Track product variant deductions to avoid double processing
  const variantDeductions = new Map(); // key: variantId + color + size, value: total quantity to deduct
  
  // First pass: collect all deductions needed
  for (const item of payload.line_items) {
    if (item.properties && item.properties.length > 0) {
      for (const prop of item.properties) {
        if (prop.name) {
          const productTitle = prop.name.replace(/\s*\d+$/, '').trim();
          const product = await findProductByTitle(admin, productTitle);
          if (product) {
            const valueParts = (prop.value || '').split(' / ').map(v => v.trim());
            const color = valueParts[0];
            const size = valueParts[1];
            
            // Find matching variants for this product
            for (const e of product.variants.edges) {
              const variant = e.node;
              const colorMatch = variant.selectedOptions.find(opt => opt.name === 'Color' && opt.value === color);
              const sizeMatch = size ? variant.selectedOptions.find(opt => opt.name === 'Size' && opt.value === size) : true;
              
              if (colorMatch && sizeMatch && variant.inventoryItem?.id) {
                const deductionKey = `${variant.id}_${color}_${size || 'no-size'}`;
                const currentDeduction = variantDeductions.get(deductionKey) || 0;
                variantDeductions.set(deductionKey, currentDeduction + item.quantity);
                
                console.log('[DEBUG][Deduction tracked]', {
                  productTitle,
                  variantId: variant.id,
                  color,
                  size,
                  itemQuantity: item.quantity,
                  totalDeduction: currentDeduction + item.quantity
                });
              }
            }
          } else {
            console.log('[DEBUG][Product not found]', { productTitle });
          }
        }
      }
    }
  }
  
  // Second pass: process unique deductions
  for (const [deductionKey, totalQuantity] of variantDeductions.entries()) {
    const [variantId, color, size] = deductionKey.split('_');
    const actualSize = size === 'no-size' ? null : size;
    
    // Find the product and variant again for processing
    let foundProduct = null;
    let foundVariant = null;
    
    for (const item of payload.line_items) {
      if (item.properties && item.properties.length > 0) {
        for (const prop of item.properties) {
          if (prop.name) {
            const productTitle = prop.name.replace(/\s*\d+$/, '').trim();
            const product = await findProductByTitle(admin, productTitle);
            if (product) {
              const variant = product.variants.edges.find(e => e.node.id === variantId);
              if (variant) {
                foundProduct = product;
                foundVariant = variant.node;
                break;
              }
            }
          }
        }
        if (foundProduct && foundVariant) break;
      }
      if (foundProduct && foundVariant) break;
    }
    
    if (foundProduct && foundVariant) {
      await processVariantDeduction(admin, locationId, foundProduct, foundVariant, color, actualSize, totalQuantity, payload);
    }
  }

  // Зафиксировать, что заказ обработан
  await prisma.processedOrder.create({
    data: { orderId: String(payload.id) }
  });

  return new Response('OK', { status: 200 });
}

async function processVariantDeduction(admin, locationId, product, variant, color, size, totalQuantity, payload) {
  try {
    // Get inventory level information for this variant
    const { inventoryLevelId, available } = await getInventoryLevelIdAndAvailable(admin, variant.inventoryItem.id, locationId);
    
    if (!inventoryLevelId) {
      console.log('[ERROR][No inventory level found]', { variantId: variant.id });
      return;
    }
    
    console.log('[DEBUG][Processing variant deduction]', {
      productTitle: product.title,
      variantId: variant.id,
      color,
      size,
      totalQuantity,
      currentAvailable: available
    });
    
    // Perform inventory adjustment
    const adjustMutation = `#graphql
      mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
        inventoryAdjustQuantities(input: $input) {
          userErrors {
            field
            message
          }
          inventoryAdjustmentGroup {
            createdAt
            reason
            changes {
              name
              delta
            }
          }
        }
      }
    `;
    
    const adjustInput = {
      reason: "correction",
      name: "available",
      changes: [{
        delta: -totalQuantity,
        inventoryItemId: variant.inventoryItem.id,
        locationId: locationId
      }]
    };
    
    const adjustResp = await admin.graphql(adjustMutation, { variables: { input: adjustInput } });
    const adjustData = await adjustResp.json();
    
    console.log('[DEBUG][Inventory adjusted]', JSON.stringify(adjustData, null, 2));
    
    if (adjustData?.data?.inventoryAdjustQuantities?.userErrors?.length) {
      console.error('[ERROR][Shopify userErrors]', adjustData.data.inventoryAdjustQuantities.userErrors);
      return;
    }
    
    // Get new quantity after adjustment
    let newQuantity = null;
    try {
      newQuantity = await getInventoryLevel(admin, inventoryLevelId);
    } catch (err) {
      console.log('[ERROR][GetInventoryLevel failed]', err);
    }
    
    // Save to inventory history
    const variantTitle = variant.selectedOptions.map(opt => `${opt.name}: ${opt.value}`).join(', ');
    
    try {
      await prisma.inventoryHistory.create({
        data: {
          orderId: String(payload.id),
          orderName: payload.name,
          productId: String(product.id),
          productTitle: product.title,
          variantId: String(variant.id),
          variantTitle,
          oldQuantity: variant.inventoryQuantity,
          newQuantity,
          locationId: String(locationId)
        }
      });
      
      console.log('[DEBUG][InventoryHistory saved]', {
        orderId: payload.id,
        variantId: variant.id,
        oldQuantity: variant.inventoryQuantity,
        newQuantity,
        deductedQuantity: totalQuantity
      });
    } catch (err) {
      console.log('[ERROR][InventoryHistory save failed]', err);
    }
    
  } catch (err) {
    console.error('[ERROR][processVariantDeduction]', err);
  }
}

async function processProductDeduction(admin, locationId, item, prop, product, payload) {
  const valueParts = (prop.value || '').split(' / ').map(v => v.trim());
  const color = valueParts[0];
  const size = valueParts[1];
  
  // Для matchedVariants получить inventoryLevelId и available через отдельный запрос
  const matchedVariants = [];
  for (const e of product.variants.edges) {
    const variant = {
      id: e.node.id,
      options: e.node.selectedOptions,
      inventoryQuantity: e.node.inventoryQuantity,
      inventoryItemId: e.node.inventoryItem?.id,
      inventoryLevelId: null,
      available: null
    };
    const colorMatch = variant.options.find(opt => opt.name === 'Color' && opt.value === color);
    const sizeMatch = size ? variant.options.find(opt => opt.name === 'Size' && opt.value === size) : true;
    if (colorMatch && sizeMatch && variant.inventoryItemId && locationId) {
      try {
        const { inventoryLevelId, available } = await getInventoryLevelIdAndAvailable(admin, variant.inventoryItemId, locationId);
        variant.inventoryLevelId = inventoryLevelId;
        variant.available = available;
      } catch (err) {
        console.log('[ERROR][getInventoryLevelIdAndAvailable]', err);
      }
      matchedVariants.push(variant);
    }
  }
  
  console.log('[DEBUG][Matched variants]', JSON.stringify({
    product_id: product.id,
    title: product.title,
    value: prop.value,
    matchedVariants
  }, null, 2));
  
  // Корректировка inventory для всех вариантов одним запросом
  const changes = matchedVariants
    .filter(variant => variant.inventoryItemId)
    .map(variant => ({
      delta: -item.quantity,
      inventoryItemId: variant.inventoryItemId,
      locationId: locationId
    }));
    
  if (changes.length > 0) {
    const adjustMutation = `#graphql
      mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
        inventoryAdjustQuantities(input: $input) {
          userErrors {
            field
            message
          }
          inventoryAdjustmentGroup {
            createdAt
            reason
            
            changes {
              name
              delta
            }
          }
        }
      }
    `;
    const adjustInput = {
      reason: "correction",
      name: "available",
      changes
    };
    const adjustResp = await admin.graphql(adjustMutation, { variables: { input: adjustInput } });
    const adjustData = await adjustResp.json();
    console.log('[DEBUG][Inventory adjusted group]', JSON.stringify(adjustData, null, 2));
    if (adjustData?.data?.inventoryAdjustQuantities?.userErrors?.length) {
      console.error('[ERROR][Shopify userErrors]', adjustData.data.inventoryAdjustQuantities.userErrors);
    }
    
    // Сохранить историю для каждого варианта
    for (let i = 0; i < matchedVariants.length; ++i) {
      const variant = matchedVariants[i];
      const oldQuantity = variant.inventoryQuantity;
      const variantTitle = variant.options.map(opt => `${opt.name}: ${opt.value}`).join(', ');
      let newQuantity = null;
      try {
        // Получить новое значение остатка после корректировки
        newQuantity = variant.inventoryLevelId
          ? await getInventoryLevel(admin, variant.inventoryLevelId)
          : null;
      } catch (err) {
        console.log('[ERROR][GetInventoryLevel failed]', err);
      }
      try {
        await prisma.inventoryHistory.create({
          data: {
            orderId: String(payload.id),
            orderName: payload.name,
            productId: String(product.id),
            productTitle: product.title,
            variantId: String(variant.id),
            variantTitle,
            oldQuantity,
            newQuantity,
            locationId: String(locationId)
          }
        });
        console.log('[DEBUG][InventoryHistory saved]', {
          orderId: payload.id,
          variantId: variant.id,
          oldQuantity,
          newQuantity
        });
      } catch (err) {
        console.log('[ERROR][InventoryHistory save failed]', err);
      }
    }
  }
}

// Получить inventoryLevelId и available для inventoryItemId/locationId
async function getInventoryLevelIdAndAvailable(admin, inventoryItemId, locationId) {
  const query = `#graphql
    query GetInventoryLevel($inventoryItemId: ID!, $locationId: ID!) {
      inventoryItem(id: $inventoryItemId) {
        id
        inventoryLevel(locationId: $locationId) {
          id
          quantities(names: ["available"]) {
            name
            quantity
          }
        }
      }
    }
  `;
  const resp = await admin.graphql(query, { variables: { inventoryItemId, locationId } });
  const data = await resp.json();
  const level = data?.data?.inventoryItem?.inventoryLevel;
  let available = null;
  if (level && Array.isArray(level.quantities)) {
    const found = level.quantities.find(q => q.name === "available");
    available = found ? found.quantity : null;
  }
  return level ? { inventoryLevelId: level.id, available } : { inventoryLevelId: null, available: null };
}

// Получить актуальное количество на складе по inventoryLevelId
async function getInventoryLevel(admin, inventoryLevelId) {
  const query = `#graphql
    query GetInventoryLevel($id: ID!) {
      inventoryLevel(id: $id) {
        id
        quantities(names: ["available"]) {
          name
          quantity
        }
      }
    }
  `;
  const resp = await admin.graphql(query, { variables: { id: inventoryLevelId } });
  const data = await resp.json();
  const quantities = data?.data?.inventoryLevel?.quantities;
  if (Array.isArray(quantities)) {
    const found = quantities.find(q => q.name === "available");
    return found ? found.quantity : null;
  }
  return null;
}

// Получить первую доступную locationId
async function getFirstLocationId(admin) {
  const query = `#graphql
    query GetLocations {
      locations(first: 1) {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  `;
  const resp = await admin.graphql(query);
  const data = await resp.json();
  return data?.data?.locations?.edges?.[0]?.node?.id || null;
}
