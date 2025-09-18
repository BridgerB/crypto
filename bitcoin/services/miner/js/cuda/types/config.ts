export interface RPCConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface ApplicationConfig {
  rpc: RPCConfig;
  mining: {
    workerCount: number;
    progressReportInterval: number;
    progressReportingIntervalMs: number;
    maxNonceValue: number;
  };
  logging: {
    enableEmojis: boolean;
    logLevel: "debug" | "info" | "warn" | "error";
  };
}

export type Result<T, E = string> = {
  success: true;
  data: T;
} | {
  success: false;
  error: E;
};
