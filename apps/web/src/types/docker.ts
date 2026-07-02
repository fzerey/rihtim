/**
 * Types describing the JSON returned by `docker inspect` for a container.
 * Fields are optional because we can't fully trust Docker's response shape
 * across daemon versions; missing fields must be handled by consumers.
 */

export interface HostPortBinding {
  HostIp?: string;
  HostPort?: string;
}

export interface ContainerMount {
  Type?: string;
  Source?: string;
  Destination?: string;
  Mode?: string;
}

export interface NetworkConfig {
  IPAddress?: string;
  Gateway?: string;
  MacAddress?: string;
  NetworkID?: string;
}

export interface ContainerConfig {
  Image?: string;
  Env?: string[];
  Labels?: Record<string, string>;
  Entrypoint?: string[];
  Cmd?: string[];
  WorkingDir?: string;
  User?: string;
  Tty?: boolean;
  OpenStdin?: boolean;
  ExposedPorts?: Record<string, unknown>;
  Healthcheck?: unknown;
}

export interface HostConfig {
  PortBindings?: Record<string, HostPortBinding[]>;
  RestartPolicy?: { Name?: string };
  Memory?: number;
  MemorySwap?: number;
  MemoryReservation?: number;
  NanoCpus?: number;
  CpuShares?: number;
  CpuQuota?: number;
  CpuPeriod?: number;
  CpusetCpus?: string;
  PidsLimit?: number;
  Privileged?: boolean;
  CapAdd?: string[];
  CapDrop?: string[];
  SecurityOpt?: string[];
  ReadonlyRootfs?: boolean;
  UsernsMode?: string;
  LogConfig?: unknown;
  Binds?: string[];
}

export interface NetworkSettings {
  Networks?: Record<string, NetworkConfig>;
  Ports?: unknown;
}

export interface ContainerState {
  Status?: string;
  StartedAt?: string;
  FinishedAt?: string;
  ExitCode?: number;
  Health?: unknown;
}

export interface ContainerInspect {
  Id: string;
  Name?: string;
  Image?: string;
  Created?: string;
  Path?: string;
  Args?: string[];
  Platform?: string;
  Driver?: string;
  RestartCount?: number;
  Config?: ContainerConfig;
  HostConfig?: HostConfig;
  NetworkSettings?: NetworkSettings;
  State?: ContainerState;
  Mounts?: ContainerMount[];
}
