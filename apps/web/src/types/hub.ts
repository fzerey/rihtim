export interface HubResult {
  name: string;
  description: string;
  isOfficial: boolean;
  isAutomated: boolean;
  starCount: number;
}

export interface HubTag {
  name: string;
  lastUpdated?: string;
  size?: number;
}
