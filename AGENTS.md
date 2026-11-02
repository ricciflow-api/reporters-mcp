# Reporters.io public companion repository

Document and call only the public Reporters.io API at https://reporters.io/api/v1 and MCP at https://reporters.io/api/mcp. The hosted implementation belongs to the product repository. Keep credentials, customer data, operational notes and internal database details out of this public repository.

Creating API keys and all REST API and MCP use require an active Professional (Pro) subscription. Public documentation and OpenAPI remain readable without a subscription. Revoked or expired keys, and keys on accounts without active Pro access, must not authorize operations. Existing keys may still be revoked after a downgrade.

Use REPORTERS_API_KEY through an environment variable and Authorization: Bearer. Do not send credentials in URLs, follow authenticated redirects or retry requests automatically. Contact reveal requires explicit user intent and server-enforced entitlement; read-only research must not reveal contacts implicitly. Lists, exports and OAuth are outside the initial release.

Keep endpoint examples aligned with https://reporters.io/api/v1/openapi.json. Run npm test before review. Live discovery checks must not invoke data or contact-reveal tools.
