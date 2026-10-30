# Bundle inventory adjuster

A Shopify app that deducts component inventory when an order contains bundle selections in line-item properties. It records inventory changes and processed order IDs in PostgreSQL.

## Local setup

Use Node.js 22, PostgreSQL, a Shopify developer account and a development store.

```sh
npm ci
cp .env.example .env
npm run setup
npm run build
npx @shopify/cli app config link
npm run dev
```

Fill in `.env` and link your own app before starting the Shopify flow. `shopify.app.toml` contains placeholder URLs and a placeholder client ID. Never deploy it as supplied.

## Stack and limits

Remix 2, React 18, Shopify Polaris, Prisma 6 and PostgreSQL. The build works without Shopify credentials; authenticated app screens and webhooks need your own account. No automated test suite is included.

This is a prototype. It selects the first location, matches component products by title and expects Color / Size options. Processing is not atomic across Shopify and the database. Review retries, inventory writes and the API version before using it with a real store. Included configuration examples are synthetic; there are no merchant exports or session databases.

Licensed under Apache-2.0. See [LICENSE](LICENSE).
