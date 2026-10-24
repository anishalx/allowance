# Allowance

**A spending leash for AI agents, built on PayPal.**

AI agents can shop for you now, but nobody should hand one their PayPal password. Allowance lets you give any
agent (Claude, ChatGPT, Cursor, your own) a PayPal-backed allowance with rules you write in plain English.
Every payment request goes through a deterministic policy engine and an AI auditor before PayPal moves any money.

> 🚧 Under active development for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/).
> Full setup instructions, architecture, and demo will land here before submission.

## Status

- [x] Sandbox spike (`scripts/paypal-spike.mjs`): OAuth, Vault v3 setup token → payment token
- [x] Charge a vaulted wallet with no buyer present (Orders v2 + `vault_id`, captured instantly)
- [x] Refund a capture, Payouts batch to a PayPal account
- [ ] Direct-to-merchant charge (payee override) to a third-party sandbox business
- [ ] Webhooks
- [ ] Policy compiler + engine, AI auditor, MCP server
- [ ] Web app + AG Studio console

## License

[MIT](LICENSE)
