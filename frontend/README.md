# LLM Gateway Frontend Console

A lightweight, zero-dependency developer console for provisioning virtual keys, executing chat proxy requests, and inspecting live spend analytics.

## Features
- **Key Provisioning**: Generate isolated virtual API keys with custom USD budgets.
- **Spend & Token Telemetry**: Live visual budget meter, request counters, and prompt/completion token metrics.
- **Proxy Playground**: Execute chat completions through the gateway, inspect roundtrip latency, token breakdowns, and fallback indicators.
- **Client Code Generator**: Automatically generates copy-pasteable `curl` commands with your active key.

## Architecture
- **Vanilla HTML5 / Modern CSS / Vanilla JS**: Zero heavy frameworks, zero runtime dependencies, instant load time.
- **Configurable `API_BASE`**: Connects to the backend via relative URLs when served statically by Express or to an external API URL when running independently.

## Running Locally
When running the gateway backend (`npm start`), the dashboard is automatically accessible at `http://localhost:3000`.

Alternatively, serve this directory with any static server:
```bash
npx serve frontend
```
