// Поиск варианта по названию продукта и цвету/размеру через Shopify GraphQL
// admin — Shopify Admin API client
// productTitle — строка, например "Example component"
// value — строка, например "Steel / Single" или "Sand"

export default async function variantResolver(admin, productTitle, value) {
  // 1. Поиск продукта по title
  const query = `#graphql
    query FindProduct($query: String!) {
      products(first: 1, query: $query) {
        edges {
          node {
            id
            title
            variants(first: 100) {
              edges {
                node {
                  id
                  selectedOptions { name value }
                  product { id }
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
  console.log('[variantResolver][DEBUG] GraphQL product search response:', JSON.stringify(data, null, 2));
  const product = data?.data?.products?.edges?.[0]?.node;
  if (!product) {
    console.log('[variantResolver][DEBUG] Product not found for title:', productTitle);
    return null;
  }
  console.log('[variantResolver][DEBUG] Found product:', JSON.stringify(product, null, 2));

  // 2. Разбить value на color/size
  const valueParts = value.split(' / ').map(v => v.trim());
  const color = valueParts[0];
  const size = valueParts[1];
  console.log('[variantResolver][DEBUG] Looking for variant with color:', color, 'size:', size);

  // 3. Найти вариант по опциям
  for (const edge of product.variants.edges) {
    const variant = edge.node;
    const options = variant.selectedOptions;
    console.log('[variantResolver][DEBUG] Checking variant:', variant.id, 'options:', options);
    if (
      options[0]?.value === color &&
      (size ? options[1]?.value === size : true)
    ) {
      console.log('[variantResolver][DEBUG] Variant matched:', variant.id);
      return {
        ...variant,
        product_id: product.id
      };
    }
  }
  console.log('[variantResolver][DEBUG] No matching variant found for product:', productTitle, 'with value:', value);
  return null;
}
