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
  stages?: { name: string; uri?: string; status?: number; origin?: string; headers?: Record<string, any> }[];
  originResHeaders?: Record<string, any>;
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
