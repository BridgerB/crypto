import { MINING_CONSTANTS, RPC_CONSTANTS } from "./constants.ts";
import type { ApplicationConfig, Result, RPCConfig } from "../types/config.ts";

export function createDefaultConfig(): ApplicationConfig {
  return {
    rpc: {
      host: RPC_CONSTANTS.DEFAULT_HOST,
      port: RPC_CONSTANTS.DEFAULT_PORT,
      username: RPC_CONSTANTS.DEFAULT_USERNAME,
      password: RPC_CONSTANTS.DEFAULT_PASSWORD,
    },
    mining: {
      workerCount: MINING_CONSTANTS.DEFAULT_WORKER_COUNT,
      progressReportInterval: MINING_CONSTANTS.DEFAULT_PROGRESS_REPORT_INTERVAL,
      progressReportingIntervalMs:
        MINING_CONSTANTS.PROGRESS_REPORTING_INTERVAL_MS,
      maxNonceValue: 0xFFFFFFFF,
    },
    logging: {
      enableEmojis: true,
      logLevel: "info",
    },
  };
}

export function loadConfigFromEnv(): ApplicationConfig {
  const defaultConfig = createDefaultConfig();

  return {
    rpc: {
      host: Deno.env.get("RPC_HOST") || defaultConfig.rpc.host,
      port: parseInt(
        Deno.env.get("RPC_PORT") || String(defaultConfig.rpc.port),
      ),
      username: Deno.env.get("RPC_USERNAME") || defaultConfig.rpc.username,
      password: Deno.env.get("RPC_PASSWORD") || defaultConfig.rpc.password,
    },
    mining: {
      workerCount: parseInt(
        Deno.env.get("WORKER_COUNT") ||
          String(defaultConfig.mining.workerCount),
      ),
      progressReportInterval: parseInt(
        Deno.env.get("PROGRESS_REPORT_INTERVAL") ||
          String(defaultConfig.mining.progressReportInterval),
      ),
      progressReportingIntervalMs: parseInt(
        Deno.env.get("PROGRESS_REPORTING_INTERVAL_MS") ||
          String(defaultConfig.mining.progressReportingIntervalMs),
      ),
      maxNonceValue: parseInt(
        Deno.env.get("MAX_NONCE_VALUE") ||
          String(defaultConfig.mining.maxNonceValue),
      ),
    },
    logging: {
      enableEmojis: Deno.env.get("ENABLE_EMOJIS") !== "false",
      logLevel:
        (Deno.env.get("LOG_LEVEL") as "debug" | "info" | "warn" | "error") ||
        defaultConfig.logging.logLevel,
    },
  };
}

export function validateRPCConfig(config: RPCConfig): Result<RPCConfig> {
  if (!config.host || config.host.length === 0) {
    return { success: false, error: "RPC host cannot be empty" };
  }

  if (config.port <= 0 || config.port > 65535) {
    return { success: false, error: "RPC port must be between 1 and 65535" };
  }

  if (!config.username || config.username.length === 0) {
    return { success: false, error: "RPC username cannot be empty" };
  }

  if (!config.password || config.password.length === 0) {
    return { success: false, error: "RPC password cannot be empty" };
  }

  return { success: true, data: config };
}

export function validateMiningConfig(
  config: ApplicationConfig["mining"],
): Result<ApplicationConfig["mining"]> {
  if (config.workerCount <= 0) {
    return { success: false, error: "Worker count must be greater than 0" };
  }

  if (config.workerCount > 32) {
    return { success: false, error: "Worker count cannot exceed 32" };
  }

  if (config.progressReportInterval <= 0) {
    return {
      success: false,
      error: "Progress report interval must be greater than 0",
    };
  }

  if (config.progressReportingIntervalMs <= 0) {
    return {
      success: false,
      error:
        "Progress reporting interval in milliseconds must be greater than 0",
    };
  }

  if (config.maxNonceValue <= 0) {
    return { success: false, error: "Max nonce value must be greater than 0" };
  }

  return { success: true, data: config };
}

export function validateApplicationConfig(
  config: ApplicationConfig,
): Result<ApplicationConfig> {
  const rpcValidation = validateRPCConfig(config.rpc);
  if (!rpcValidation.success) {
    return rpcValidation;
  }

  const miningValidation = validateMiningConfig(config.mining);
  if (!miningValidation.success) {
    return miningValidation;
  }

  const validLogLevels = ["debug", "info", "warn", "error"];
  if (!validLogLevels.includes(config.logging.logLevel)) {
    return {
      success: false,
      error: `Invalid log level: ${config.logging.logLevel}. Must be one of: ${
        validLogLevels.join(", ")
      }`,
    };
  }

  return { success: true, data: config };
}

export function getValidatedConfig(): Result<ApplicationConfig> {
  const config = loadConfigFromEnv();
  return validateApplicationConfig(config);
}

export function createRPCUrl(config: RPCConfig): string {
  return `http://${config.host}:${config.port}`;
}

export function createRPCCredentials(config: RPCConfig): string {
  return btoa(`${config.username}:${config.password}`);
}
