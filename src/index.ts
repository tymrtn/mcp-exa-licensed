#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, Tool } from "@modelcontextprotocol/sdk/types.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import crypto from "crypto";
import { encoding_for_model } from "tiktoken";

import { ExaClient } from "./services/exa-client.js";
import { LedgerService } from "./services/ledger-service.js";
import { licensedFetchText } from "./services/licensed-fetcher.js";
import type { Distribution, ExaSearchResult, LicenseStage } from "./types.js";

dotenv.config();

class TokenEstimator {
  private encoder: any | null = null;

  constructor() {
    try {
      this.encoder = encoding_for_model("gpt-4");
    } catch {
      this.encoder = null;
    }
  }

  estimate(text: string): number {
    if (!text) return 0;
    try {
      if (this.encoder) return this.encoder.encode(text).length;
    } catch {
      // fall through
    }
    return Math.ceil(text.length / 4);
  }

  cleanup(): void {
    try {
      this.encoder?.free?.();
    } catch {
      // ignore
    }
  }
}

class CopyrightExaMcp {
  private server: Server;
  private exa: ExaClient;
  private ledger: LedgerService;
  private tokens: TokenEstimator;

  constructor(exaApiKey: string) {
    this.server = new Server(
      { name: "copyrightsh-exa-licensed-mcp", version: "0.1.0-alpha.1" },
      { capabilities: { tools: {} } }
    );
    this.exa = new ExaClient(exaApiKey);
    this.ledger = new LedgerService();
    this.tokens = new TokenEstimator();

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => console.error("[MCP Error]", error);

    const shutdown = async () => {
      this.tokens.cleanup();
      await this.server.close();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: "copyrightish-exa-search",
          description:
            "🔎 Exa web search with Copyright.sh licensing: optionally fetches results using x402 (HTTP 402) + records usage in the ledger.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query" },
              num_results: { type: "number", description: "Number of results (max 100)", default: 10 },
              type: {
                type: "string",
                enum: ["neural", "deep", "fast", "auto"],
                description: "Exa search type",
                default: "neural",
              },
              include_domains: { type: "array", items: { type: "string" } },
              exclude_domains: { type: "array", items: { type: "string" } },
              fetch: {
                type: "boolean",
                description:
                  "If true: fetch each result URL directly. If a publisher returns 402 + x402 headers, will call /api/v1/licenses/acquire then retry with the licensed_url token.",
                default: false,
              },
              stage: { type: "string", enum: ["infer", "embed", "tune", "train"], default: "infer" },
              distribution: { type: "string", enum: ["private", "public"], default: "private" },
              estimated_tokens: {
                type: "number",
                description: "Token estimate used for license acquisition when a 402 paywall is encountered",
                default: 1500,
              },
              max_chars: { type: "number", description: "Max chars to return per fetched document", default: 200000 },
            },
            required: ["query"],
          },
        },
      ];
      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name !== "copyrightish-exa-search") {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }

      const query = String((args as any)?.query || "");
      if (!query) throw new McpError(ErrorCode.InvalidParams, "query is required");

      const numResults = Number((args as any)?.num_results ?? 10);
      const type = ((args as any)?.type ?? "neural") as "neural" | "deep" | "fast" | "auto";
      const includeDomains = (args as any)?.include_domains as string[] | undefined;
      const excludeDomains = (args as any)?.exclude_domains as string[] | undefined;
      const fetch = Boolean((args as any)?.fetch ?? false);
      const stage = ((args as any)?.stage ?? "infer") as LicenseStage;
      const distribution = ((args as any)?.distribution ?? "private") as Distribution;
      const estimatedTokens = Number((args as any)?.estimated_tokens ?? 1500);
      const maxChars = Number((args as any)?.max_chars ?? 200000);

      const searchResp = await this.exa.search({
        query,
        numResults,
        type,
        includeDomains,
        excludeDomains,
        text: false,
      });

      const results: ExaSearchResult[] = searchResp.results || [];
      const urls = results.map((r) => r.url).filter(Boolean);

      // License check (best-effort, cached optionally)
      const licenseMap = new Map<string, any>();
      await Promise.all(
        urls.map(async (u) => {
          const lic = await this.ledger.checkLicense(u);
          licenseMap.set(u, lic);
        })
      );

      let fetchedByUrl: Record<string, any> | undefined;
      let usageLog: any | undefined;

      if (fetch) {
        fetchedByUrl = {};
        const hits: { url: string; tokens: number }[] = [];

        for (const u of urls) {
          const fetched = await licensedFetchText(u, {
            ledger: this.ledger,
            stage,
            distribution,
            estimatedTokens,
            maxChars,
          });
          fetchedByUrl[u] = fetched;

          if (fetched.content_text && fetched.status >= 200 && fetched.status < 300) {
            const t = this.tokens.estimate(fetched.content_text);
            if (t > 0) hits.push({ url: u, tokens: t });
          }
        }

        // Ledger usage logging (required for compensation/audit). If secrets are missing, return an explicit warning.
        if (hits.length > 0) {
          const genId = crypto.randomUUID();
          try {
            await this.ledger.logUsage({ gen_id: genId, hits });
            usageLog = { ok: true, gen_id: genId, hits: hits.length };
          } catch (e: any) {
            usageLog = { ok: false, error: e?.message || String(e), gen_id: genId, hits: hits.length };
          }
        }
      }

      const enriched = results.map((r) => ({
        ...r,
        license: licenseMap.get(r.url),
        fetched: fetchedByUrl ? fetchedByUrl[r.url] : undefined,
      }));

      const responseBody = {
        query,
        exa: { num_results: numResults, type, request_id: (searchResp as any).requestId },
        results: enriched,
        usage_log: usageLog,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(responseBody, null, 2) }],
      };
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

function listTools(): void {
  console.log(JSON.stringify(["copyrightish-exa-search"], null, 2));
}

async function doctor(): Promise<void> {
  const issues: string[] = [];
  const exa = process.env.EXA_API_KEY;
  const ledgerApi = process.env.COPYRIGHTSH_LEDGER_API || "https://ledger.copyright.sh";
  const ledgerKey = process.env.COPYRIGHTSH_LEDGER_API_KEY;

  if (!exa) issues.push("EXA_API_KEY missing");
  if (!ledgerKey) issues.push("COPYRIGHTSH_LEDGER_API_KEY missing (required for acquire + usage logging)");

  console.log("🩺 Copyright.sh Exa MCP Doctor");
  console.log(`- EXA_API_KEY: ${exa ? `set (${exa.slice(0, 6)}…)` : "MISSING"}`);
  console.log(`- COPYRIGHTSH_LEDGER_API: ${ledgerApi}`);
  console.log(`- COPYRIGHTSH_LEDGER_API_KEY: ${ledgerKey ? `set (${ledgerKey.slice(0, 4)}…)` : "MISSING"}`);

  if (issues.length > 0) {
    console.log(`Status: ❌ ${issues.join("; ")}`);
    process.exit(1);
  }
  console.log("Status: ✅ Ready");
}

async function main() {
  const argv = (await yargs(hideBin(process.argv))
    .option("list-tools", { type: "boolean", default: false })
    .option("doctor", { type: "boolean", default: false })
    .help()
    .parse()) as any;

  if (argv["list-tools"]) {
    listTools();
    return;
  }
  if (argv.doctor) {
    await doctor();
    return;
  }

  const exaKey = process.env.EXA_API_KEY;
  if (!exaKey) {
    console.error("EXA_API_KEY is required to start the MCP server.");
    process.exit(1);
  }

  const server = new CopyrightExaMcp(exaKey);
  await server.run();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});










