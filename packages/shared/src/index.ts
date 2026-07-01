/**
 * Shared types between API and Web
 */

export type ConnectionKind =
  | "npipe"
  | "socket"
  | "tcp"
  | "ssh"
  | "wsl";

export interface DockerContext {
  id: string;
  name: string;
  kind: ConnectionKind;
  /** For npipe: e.g. //./pipe/docker_engine */
  socketPath?: string;
  /** For tcp: host and port */
  host?: string;
  port?: number;
  /** For SSH: user@host */
  sshHost?: string;
  /** For WSL: distro name (e.g. Ubuntu) */
  wslDistro?: string;
  /** Optional TLS material for tcp */
  tls?: {
    ca?: string;
    cert?: string;
    key?: string;
  };
  /** Marks this context as the currently selected one */
  current?: boolean;
}

export interface ContextTestResult {
  ok: boolean;
  error?: string;
  version?: {
    apiVersion?: string;
    version?: string;
    os?: string;
    arch?: string;
  };
}

export interface ContainerSummary {
  id: string;
  names: string[];
  image: string;
  imageId: string;
  command: string;
  createdAt: number;
  state: string;
  status: string;
  ports: Array<{
    ip?: string;
    privatePort: number;
    publicPort?: number;
    type: string;
  }>;
  labels: Record<string, string>;
  mounts: Array<{ source: string; destination: string; mode: string; type: string }>;
  networks: string[];
}

export interface ImageSummary {
  id: string;
  parentId: string;
  repoTags: string[];
  repoDigests: string[];
  createdAt: number;
  pulledAt?: number;
  size: number;
  virtualSize: number;
  labels: Record<string, string>;
  containers: number;
}

export interface VolumeSummary {
  name: string;
  driver: string;
  mountpoint: string;
  createdAt?: string;
  labels: Record<string, string>;
  scope: string;
}

export interface NetworkSummary {
  id: string;
  name: string;
  driver: string;
  scope: string;
  internal: boolean;
  attachable: boolean;
  ingress: boolean;
  labels: Record<string, string>;
  ipam?: {
    driver?: string;
    config?: Array<{ subnet?: string; gateway?: string }>;
  };
}

export interface SystemInfo {
  containers: number;
  containersRunning: number;
  containersPaused: number;
  containersStopped: number;
  images: number;
  serverVersion: string;
  operatingSystem: string;
  architecture: string;
  ncpu: number;
  memTotal: number;
  kernelVersion: string;
  dockerRootDir: string;
  name: string;
}

export interface DockerEvent {
  time: number;
  type: string;
  action: string;
  id?: string;
  name?: string;
  image?: string;
}

export interface StorageCategory {
  total: number;
  active: number;
  size: number;
  reclaimable: number;
}

export interface SystemStorage {
  images: StorageCategory;
  containers: StorageCategory;
  volumes: StorageCategory;
  buildCache: StorageCategory;
  totalSize: number;
  totalReclaimable: number;
}

export interface BuildCacheEntry {
  id: string;
  parents: string[];
  type: string;
  description: string;
  inUse: boolean;
  shared: boolean;
  size: number;
  createdAt: number;
  lastUsedAt?: number;
  usageCount: number;
}

export interface ContainerStatsSample {
  id: string;
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  blockRead: number;
  blockWrite: number;
  timestamp: number;
}

export interface ApiError {
  error: string;
  detail?: string;
}
