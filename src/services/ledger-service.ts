import axios, { AxiosInstance } from "axios";
import https from "https";
import type {
  LedgerAcquireResponse,
  LedgerLicenseInfo,
  LedgerServiceConfig,
  LicenseStage,
  Distribution,
  UsageLogRequest,
} from "../types.js";

function getEnvBool(name: string, defaultValue: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return defaultValue;
  return v === "true" || v === "1" || v === "yes";
}

export class LedgerService {
  private axiosInstance: AxiosInstance;
  private config: LedgerServiceConfig;
  private licenseCache: Map<string, { license: LedgerLicenseInfo; expires: number }>;

  constructor(config: Partial<LedgerServiceConfig> = {}) {
    this.config = {
      apiUrl:
        process.env.COPYRIGHTSH_LEDGER_API ||
        "https://ledger.copyright.sh",
      apiKey: process.env.COPYRIGHTSH_LEDGER_API_KEY,
      enableTracking: getEnvBool("ENABLE_LICENSE_TRACKING", true),
      enableCache: getEnvBool("ENABLE_LICENSE_CACHE", false),
      cacheTTLSeconds: parseInt(process.env.LICENSE_CACHE_TTL_SECONDS || "300", 10),
      licenseCheckTimeoutMs: parseInt(process.env.LICENSE_CHECK_TIMEOUT_MS || "5000", 10),
      licenseAcquireTimeoutMs: parseInt(process.env.LICENSE_ACQUIRE_TIMEOUT_MS || "8000", 10),
      usageLogTimeoutMs: parseInt(process.env.USAGE_LOG_TIMEOUT_MS || "3000", 10),
      ...config,
    };

    // Support DDEV/self-signed certs when pointed at *.ddev.site
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });

    this.axiosInstance = axios.create({
      baseURL: this.config.apiUrl,
      headers: {
        "Content-Type": "application/json",
        ...(this.config.apiKey ? { "X-API-Key": this.config.apiKey } : {}),
      },
      httpsAgent,
    });

    this.licenseCache = new Map();
  }

  async checkLicense(url: string): Promise<LedgerLicenseInfo> {
    if (!this.config.enableTracking) {
      return { url, license_found: false, action: "unknown" };
    }

    if (this.config.enableCache) {
      const cached = this.licenseCache.get(url);
      if (cached && cached.expires > Date.now()) return cached.license;
    }

    try {
      const response = await this.axiosInstance.get("/api/v1/licenses/", {
        params: { url },
        timeout: this.config.licenseCheckTimeoutMs,
        headers: this.config.apiKey ? { "X-API-Key": this.config.apiKey } : undefined,
      });

      const licenseArray = Array.isArray(response.data) ? response.data : [response.data];
      const licenseData = licenseArray.find((l: any) => l.license_type === "ai-license") || licenseArray[0];

      if (!licenseData) {
        return { url, license_found: false, action: "unknown" };
      }

      const opt = licenseData.opt_in_status;
      const action: "allow" | "deny" | "unknown" =
        opt === "opt-in" ? "allow" : opt === "opt-out" ? "deny" : "unknown";

      const license: LedgerLicenseInfo = {
        url,
        license_found: opt === "opt-in" || opt === "opt-out",
        action,
        price: licenseData.rate_per_token,
        payto: licenseData.wallet_id,
        license_version_id: licenseData.id,
      };

      if (this.config.enableCache) {
        this.licenseCache.set(url, {
          license,
          expires: Date.now() + this.config.cacheTTLSeconds * 1000,
        });
      }

      return license;
    } catch (error: any) {
      return { url, license_found: false, action: "unknown", error: error?.message || String(error) };
    }
  }

  async acquireLicenseToken(params: {
    url: string;
    stage: LicenseStage;
    distribution: Distribution;
    estimatedTokens: number;
    paymentMethod: "account_balance" | "x402";
    paymentProof?: string;
    paymentAmount?: number;
  }): Promise<LedgerAcquireResponse> {
    if (!this.config.apiKey) {
      throw new Error("COPYRIGHTSH_LEDGER_API_KEY is required for /api/v1/licenses/acquire");
    }

    const body = {
      url: params.url,
      estimated_tokens: params.estimatedTokens,
      stage: params.stage,
      distribution: params.distribution,
      payment_method: params.paymentMethod,
      payment_proof: params.paymentProof,
      payment_amount: params.paymentAmount,
    };

    const response = await this.axiosInstance.post("/api/v1/licenses/acquire", body, {
      timeout: this.config.licenseAcquireTimeoutMs,
      headers: { "X-API-Key": this.config.apiKey },
    });

    return response.data as LedgerAcquireResponse;
  }

  async logUsage(payload: UsageLogRequest): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error("COPYRIGHTSH_LEDGER_API_KEY is required for /api/v1/usage/log");
    }

    await this.axiosInstance.post("/api/v1/usage/log", payload, {
      timeout: this.config.usageLogTimeoutMs,
      headers: {
        "X-API-Key": this.config.apiKey,
      },
    });
  }
}











