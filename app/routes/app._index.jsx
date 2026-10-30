import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { getHistory } from "../services/inventory.server";
import { AppProvider, Page, Card, Button, Collapsible, TextContainer } from "@shopify/polaris";
import { useState } from "react";
import "@shopify/polaris/build/esm/styles.css";

export const loader = async () => {
  const history = await getHistory(200);
  return json({ history });
};

function groupByOrder(history) {
  const grouped = {};
  for (const h of history) {
    const key = h.orderId || 'Unknown';
    if (!grouped[key]) grouped[key] = { orderName: h.orderName, items: [] };
    grouped[key].items.push(h);
  }
  return grouped;
}

export default function Index() {
  const { history } = useLoaderData();
  const grouped = groupByOrder(history);
  const [openOrders, setOpenOrders] = useState({});

  const toggleOrder = (orderId) => {
    setOpenOrders(prev => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  return (
    <AppProvider i18n={{}}>
      <Page title="Inventory Change History">
        <Card>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px' }}>Order Name</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>Order ID</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>Date</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>Show Details</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(grouped).map(([orderId, group]) => (
                <>
                  <tr key={orderId} style={{ background: '#f6f6f7' }}>
                    <td style={{ padding: '8px' }}>{group.orderName || '—'}</td>
                    <td style={{ padding: '8px' }}>{orderId}</td>
                    <td style={{ padding: '8px' }}>{new Date(group.items[0].timestamp).toLocaleString()}</td>
                    <td style={{ padding: '8px' }}>
                      <Button onClick={() => toggleOrder(orderId)} plain>
                        {openOrders[orderId] ? 'Hide' : 'Show'}
                      </Button>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={4} style={{ padding: 0, border: 0 }}>
                      <Collapsible open={!!openOrders[orderId]} transition={{ duration: '200ms', timingFunction: 'ease' }}>
                        <TextContainer>
                          <table style={{ width: '100%', margin: '8px 0', background: '#fff' }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left', padding: '6px' }}>Product</th>
                                <th style={{ textAlign: 'left', padding: '6px' }}>Variant</th>
                                <th style={{ textAlign: 'right', padding: '6px' }}>Old Qty</th>
                                <th style={{ textAlign: 'right', padding: '6px' }}>New Qty</th>
                                <th style={{ textAlign: 'left', padding: '6px' }}>Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.items.map((h, idx) => (
                                <tr key={h.id || idx}>
                                  <td style={{ padding: '6px' }}>{h.productTitle || h.productId}</td>
                                  <td style={{ padding: '6px' }}>{h.variantTitle || h.variantId}</td>
                                  <td style={{ padding: '6px', textAlign: 'right' }}>{h.oldQuantity}</td>
                                  <td style={{ padding: '6px', textAlign: 'right' }}>{h.newQuantity}</td>
                                  <td style={{ padding: '6px' }}>{new Date(h.timestamp).toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </TextContainer>
                      </Collapsible>
                    </td>
                  </tr>
                </>
              ))}
            </tbody>
          </table>
        </Card>
      </Page>
    </AppProvider>
  );
}
