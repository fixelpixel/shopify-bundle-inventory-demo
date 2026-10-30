import { handleOrderWebhook } from "../services/order-webhook.server";

export const action = ({ request }) => handleOrderWebhook({ request });
