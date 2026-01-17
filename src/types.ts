export type LicenseStage = "infer" | "embed" | "tune" | "train";
export type Distribution = "private" | "public";

export interface ExaSearchRequest {
  query: string;
  numResults?: number;
  type?: "neural" | "deep" | "fast" | "auto";
  includeDomains?: string[];
  excludeDomains?: string[];
  useAutoprompt?: boolean;
  text?: boolean;
  contents?: {
    text?: boolean;
    highlights?: boolean;
    summary?: boolean;
  };
}

export interface ExaSearchResult {
  id?: string;
  url: string;
  title?: string;
  publishedDate?: string;
  author?: string;
  score?: number;
  text?: string;
}

export interface ExaSearchResponse {
  results: ExaSearchResult[];
  autopromptString?: string;
  requestId?: string;
}

export interface ExaContentsRequest {
  urls: string[];
  text?: boolean;
  highlights?: boolean;
  summary?: boolean;
}

export interface ExaContentsResult {
  url: string;
  title?: string;
  text?: string;
  summary?: string;
  highlights?: string[];
}

export interface ExaContentsResponse {
  results: ExaContentsResult[];
  statuses?: Record<string, any>;
}

export interface LedgerLicenseInfo {
  url: string;
  license_found: boolean;
  action: "allow" | "deny" | "unknown";
  price?: number; // USD per 1K tokens (rate_per_token in ledger naming)
  payto?: string;
  license_version_id?: number;
  license_sig?: string;
  error?: string;
}

export interface LedgerAcquireResponse {
  licensed_url: string;
  license_version_id: number;
  license_sig: string;
  expires_at: string;
  cost: number;
  currency: string;
  stage: LicenseStage;
  distribution: Distribution;
  estimated_tokens: number;
  license_status: string;
  rate_per_1k_tokens: number;
}

export interface UsageHit {
  url: string;
  tokens: number;
}

export interface UsageLogRequest {
  gen_id: string;
  hits: UsageHit[];
}

export interface LicensedFetchResult {
  requested_url: string;
  final_url: string;
  status: number;
  content_type?: string | null;
  content_text?: string;
  payment_attempted: boolean;
  payment_required: boolean;
  x402?: {
    price?: string | null;
    payto?: string | null;
    stage?: string | null;
    distribution?: string | null;
    facilitator_url?: string | null;
  };
  acquire?: {
    licensed_url: string;
    cost: number;
    currency: string;
    expires_at: string;
    license_version_id: number;
    license_sig: string;
  };
  error?: string;
}

export interface LedgerServiceConfig {
  apiUrl: string;
  apiKey?: string;
  enableTracking: boolean;
  enableCache: boolean;
  cacheTTLSeconds: number;
  licenseCheckTimeoutMs: number;
  licenseAcquireTimeoutMs: number;
  usageLogTimeoutMs: number;
}











