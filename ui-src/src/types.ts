export interface RequestEntry {
  id: string;
  timestamp: string;
  method?: string;
  url?: string;
  status?: number;
  durationMs?: number;
  reqHeaders?: Record<string, any>;
  resHeaders?: Record<string, any>;
  isError?: boolean;
  error?: any;
  rewrite?: { from: string; to: string };
  steps?: { uri: string; hook?: string }[];
  stages?: {
    name: string;
    uri?: string;
    status?: number;
    origin?: string;
    headers?: Record<string, any>;
    // Body forensics
    body?: string;              // base64 encoded, capped at 40KB (request) or 10KB (response)
    bodySize?: number;          // original size in bytes before truncation
    bodyTruncated?: boolean;    // true if original exceeded the cap
    contentType?: string;       // from Content-Type header, for decode decisions
    bodyUnchanged?: boolean;    // true if body passed through this stage without mutation (informational only — no data sent)

  }[];
  originResHeaders?: Record<string, any>;
  // Initial request body (POST/PUT/PATCH/DELETE only, base64, max 40KB)
  reqBody?: string;
  reqBodySize?: number;
  reqBodyTruncated?: boolean;
  reqContentType?: string;
}

export interface StickyHeader {
  key: string;
  value: string;
  target: 'request' | 'response';
  enabled: boolean;
}

export interface DistributionHook {
  id?: string;
  type: 'Lambda@Edge' | 'CloudFront Functions';
  path: string;
  code: string;
  stage?: string;
  disabled?: boolean;
}

export interface DistributionInfo {
  hooks: DistributionHook[];
  origins: any[];
  mode: string;
  port: number;
}
