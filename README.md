# Exa Licensed MCP (Copyright.sh)

Open-source MCP server that wraps Exa Search and adds Copyright.sh licensing, usage logging, and optional x402 licensed fetch.

## Features

- License discovery via `ai-license` meta tags
- Usage logging for compensation and audit trails
- Optional x402 licensed fetch on `402 Payment Required`
- Token estimation with `tiktoken`
- Graceful degradation when the ledger is unavailable

## Quick Start

### Install from source

```bash
git clone https://github.com/tymrtn/mcp-exa-licensed.git
cd mcp-exa-licensed
npm install
npm run build
```

### Run via npx (if published)

```bash
npx @copyrightsh/exa-licensed-mcp@latest
```

## Configuration

Copy `env.example` to `.env` and set your keys:

- `EXA_API_KEY`
- `COPYRIGHTSH_LEDGER_API_KEY` (recommended for license acquire + usage logging)

### MCP Config Example (npx)

```json
{
  "mcpServers": {
    "exa-licensed": {
      "command": "npx",
      "args": ["-y", "@copyrightsh/exa-licensed-mcp@latest"],
      "env": {
        "EXA_API_KEY": "exa-your-key-here",
        "COPYRIGHTSH_LEDGER_API": "https://ledger.copyright.sh",
        "COPYRIGHTSH_LEDGER_API_KEY": "cs-ledger-your-key-here"
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `EXA_API_KEY` | Yes | - | Exa API key |
| `COPYRIGHTSH_LEDGER_API` | No | `https://ledger.copyright.sh` | Ledger base URL |
| `COPYRIGHTSH_LEDGER_API_KEY` | Recommended | - | API key for license discovery + usage logging |
| `ENABLE_LICENSE_TRACKING` | No | `true` | Enable/disable licensing |
| `ENABLE_LICENSE_CACHE` | No | `false` | Cache license results |
| `LICENSE_CACHE_TTL_SECONDS` | No | `300` | Cache TTL for license lookups |
| `LICENSE_CHECK_TIMEOUT_MS` | No | `5000` | License discovery timeout (ms) |
| `LICENSE_ACQUIRE_TIMEOUT_MS` | No | `8000` | License acquisition timeout (ms) |
| `USAGE_LOG_TIMEOUT_MS` | No | `3000` | Usage logging timeout (ms) |
| `FETCH_TIMEOUT_MS` | No | `12000` | Direct fetch timeout (ms) |

## Tool

### `copyrightish-exa-search`

Search the web and optionally perform an x402-aware licensed fetch.

```json
{
  "query": "AI licensing news",
  "num_results": 10,
  "type": "neural",
  "fetch": true,
  "stage": "infer",
  "distribution": "private",
  "estimated_tokens": 1500,
  "max_chars": 200000
}
```

## CLI Helpers

```bash
node build/index.js --list-tools
node build/index.js --doctor
```

## Notes on Paywalled Sources

This server only unlocks sources that implement the Copyright.sh x402 flow (`402` + `payment-required: x402`). It does not bypass login/subscription paywalls.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
