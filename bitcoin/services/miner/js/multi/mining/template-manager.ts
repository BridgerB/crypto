import { getBlockTemplate, testRPCConnection } from "../rpc/client.ts";
import { createGenesisBlockTemplate } from "./genesis-template.ts";
import type {
  BlockTemplate,
  MiningMode,
  TemplateUpdate,
} from "../types/bitcoin.ts";
import type { Result, RPCConfig } from "../types/config.ts";
import type { Logger } from "../utils/logger.ts";

export interface TemplateManagerConfig {
  mode: MiningMode;
  rpcConfig: RPCConfig;
  pollingIntervalMs: number;
  logger: Logger;
}

export interface TemplateManager {
  start(): Promise<Result<void>>;
  stop(): void;
  getCurrentTemplate(): BlockTemplate | null;
  onNewTemplate(callback: (update: TemplateUpdate) => void): void;
  removeTemplateListener(callback: (update: TemplateUpdate) => void): void;
  getStats(): TemplateManagerStats;
}

export interface TemplateManagerStats {
  templatesReceived: number;
  significantUpdates: number;
  lastUpdateTime: number;
  uptime: number;
  currentBlockHeight: number;
  pollingErrors: number;
}

/**
 * Creates a template manager that handles both genesis and live mining modes
 */
export function createTemplateManager(
  config: TemplateManagerConfig,
): TemplateManager {
  let currentTemplate: BlockTemplate | null = null;
  let pollingInterval: number | null = null;
  let isRunning = false;
  let listeners: ((update: TemplateUpdate) => void)[] = [];
  let stats: TemplateManagerStats = {
    templatesReceived: 0,
    significantUpdates: 0,
    lastUpdateTime: 0,
    uptime: 0,
    currentBlockHeight: 0,
    pollingErrors: 0,
  };
  const startTime = Date.now();

  /**
   * Fetches a fresh block template based on the current mode
   */
  async function fetchTemplate(): Promise<Result<BlockTemplate>> {
    if (config.mode.type === "genesis") {
      // Return genesis block template for testing
      return createGenesisBlockTemplate();
    } else {
      // Fetch live template from Bitcoin Core
      return await getBlockTemplate(config.rpcConfig);
    }
  }

  /**
   * Determines if a template change is significant enough to restart mining
   */
  function hasSignificantChange(
    oldTemplate: BlockTemplate,
    newTemplate: BlockTemplate,
  ): boolean {
    // Block height changed (new block found)
    if (oldTemplate.height !== newTemplate.height) {
      return true;
    }

    // Previous block hash changed
    if (oldTemplate.previousblockhash !== newTemplate.previousblockhash) {
      return true;
    }

    // Number of transactions changed significantly
    const oldTxCount = oldTemplate.transactions.length;
    const newTxCount = newTemplate.transactions.length;
    if (Math.abs(oldTxCount - newTxCount) > 0) {
      return true;
    }

    // Transaction content changed
    if (
      oldTemplate.transactions.length > 0 && newTemplate.transactions.length > 0
    ) {
      const oldTxIds = oldTemplate.transactions.map((tx) => tx.txid).sort();
      const newTxIds = newTemplate.transactions.map((tx) => tx.txid).sort();
      if (JSON.stringify(oldTxIds) !== JSON.stringify(newTxIds)) {
        return true;
      }
    }

    // Coinbase value changed
    if (oldTemplate.coinbasevalue !== newTemplate.coinbasevalue) {
      return true;
    }

    // Target difficulty changed
    if (oldTemplate.target !== newTemplate.target) {
      return true;
    }

    return false;
  }

  /**
   * Processes a new template and notifies listeners if significant
   */
  async function processNewTemplate(newTemplate: BlockTemplate): Promise<void> {
    const oldTemplate = currentTemplate;
    const isSignificant = oldTemplate
      ? hasSignificantChange(oldTemplate, newTemplate)
      : true;

    if (isSignificant || !oldTemplate) {
      config.logger.info(
        `📋 New block template: Height ${newTemplate.height}, ` +
          `Transactions: ${newTemplate.transactions.length}, ` +
          `Coinbase: ${(newTemplate.coinbasevalue / 100000000).toFixed(8)} BTC`,
      );

      if (oldTemplate && newTemplate.height > oldTemplate.height) {
        config.logger.info(
          `🔄 New block detected! Height ${oldTemplate.height} → ${newTemplate.height}`,
        );
      }

      const update: TemplateUpdate = {
        oldTemplate: oldTemplate || newTemplate,
        newTemplate,
        hasSignificantChange: isSignificant,
        shouldRestartMining: isSignificant,
      };

      currentTemplate = newTemplate;
      stats.lastUpdateTime = Date.now();
      stats.currentBlockHeight = newTemplate.height;

      if (isSignificant) {
        stats.significantUpdates++;
      }

      // Notify all listeners
      listeners.forEach((callback) => {
        try {
          callback(update);
        } catch (error) {
          config.logger.error(`Template listener error: ${error}`);
        }
      });
    }
  }

  /**
   * Polling loop for live templates
   */
  async function pollForTemplates(): Promise<void> {
    if (!isRunning) {
      return;
    }

    try {
      const templateResult = await fetchTemplate();

      if (templateResult.success) {
        stats.templatesReceived++;
        await processNewTemplate(templateResult.data);
      } else {
        stats.pollingErrors++;
        config.logger.warn(
          `Failed to fetch block template: ${templateResult.error}`,
        );

        // For live mode, check RPC connection
        if (config.mode.type === "live") {
          const connectionResult = await testRPCConnection(config.rpcConfig);
          if (!connectionResult.success) {
            config.logger.error(
              `RPC connection lost: ${connectionResult.error}`,
            );
          }
        }
      }
    } catch (error) {
      stats.pollingErrors++;
      config.logger.error(`Template polling error: ${error}`);
    }

    // Schedule next poll
    if (isRunning) {
      pollingInterval = setTimeout(pollForTemplates, config.pollingIntervalMs);
    }
  }

  return {
    async start(): Promise<Result<void>> {
      if (isRunning) {
        return { success: false, error: "Template manager is already running" };
      }

      config.logger.info(
        `🚀 Starting template manager in ${config.mode.type} mode`,
      );

      // For live mode, test connection first
      if (config.mode.type === "live") {
        const connectionResult = await testRPCConnection(config.rpcConfig);
        if (!connectionResult.success) {
          return {
            success: false,
            error: `Cannot connect to Bitcoin Core: ${connectionResult.error}`,
          };
        }
        config.logger.info(
          `✅ Connected to Bitcoin Core at ${config.rpcConfig.host}:${config.rpcConfig.port}`,
        );
      }

      isRunning = true;

      // Get initial template
      const initialTemplateResult = await fetchTemplate();
      if (!initialTemplateResult.success) {
        isRunning = false;
        return {
          success: false,
          error:
            `Failed to get initial template: ${initialTemplateResult.error}`,
        };
      }

      await processNewTemplate(initialTemplateResult.data);

      // Start polling for live mode
      if (config.mode.type === "live") {
        config.logger.info(
          `⏰ Starting template polling every ${
            config.pollingIntervalMs / 1000
          } seconds`,
        );
        pollingInterval = setTimeout(
          pollForTemplates,
          config.pollingIntervalMs,
        );
      } else {
        config.logger.info(`🧪 Using genesis block template for testing`);
      }

      return { success: true, data: undefined };
    },

    stop(): void {
      if (!isRunning) {
        return;
      }

      config.logger.info("🛑 Stopping template manager");
      isRunning = false;

      if (pollingInterval !== null) {
        clearTimeout(pollingInterval);
        pollingInterval = null;
      }

      listeners = [];
      currentTemplate = null;
    },

    getCurrentTemplate(): BlockTemplate | null {
      return currentTemplate;
    },

    onNewTemplate(callback: (update: TemplateUpdate) => void): void {
      listeners.push(callback);
    },

    removeTemplateListener(callback: (update: TemplateUpdate) => void): void {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    },

    getStats(): TemplateManagerStats {
      return {
        ...stats,
        uptime: Date.now() - startTime,
      };
    },
  };
}

/**
 * Utility function to determine if mining should be restarted based on template change
 */
export function shouldRestartMining(
  oldTemplate: BlockTemplate,
  newTemplate: BlockTemplate,
): boolean {
  // Always restart if block height changed
  if (oldTemplate.height !== newTemplate.height) {
    return true;
  }

  // Restart if previous block hash changed
  if (oldTemplate.previousblockhash !== newTemplate.previousblockhash) {
    return true;
  }

  // Restart if target changed (difficulty adjustment)
  if (oldTemplate.target !== newTemplate.target) {
    return true;
  }

  return false;
}

/**
 * Calculates mining progress metrics from template updates
 */
export function calculateTemplateMetrics(stats: TemplateManagerStats): {
  averageUpdateInterval: number;
  updateFrequency: number;
  errorRate: number;
  uptime: number;
} {
  const updateFrequency = stats.templatesReceived > 0
    ? stats.templatesReceived / (stats.uptime / 1000)
    : 0;
  const averageUpdateInterval = stats.templatesReceived > 1
    ? stats.uptime / (stats.templatesReceived - 1)
    : 0;
  const errorRate = (stats.templatesReceived + stats.pollingErrors) > 0
    ? stats.pollingErrors / (stats.templatesReceived + stats.pollingErrors)
    : 0;

  return {
    averageUpdateInterval,
    updateFrequency,
    errorRate,
    uptime: stats.uptime / 1000, // Convert to seconds
  };
}
