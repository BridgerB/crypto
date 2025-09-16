import { BlockTemplate } from "./bitcoin.ts";

export interface WorkerStartMessage {
  type: "start";
  blockTemplate: BlockTemplate;
  nonceStart: number;
  nonceEnd: number;
  workerId: number;
}

export interface WorkerStopMessage {
  type: "stop";
}

export interface WorkerTemplateUpdateMessage {
  type: "template_update";
  blockTemplate: BlockTemplate;
  shouldRestart: boolean;
}

export interface WorkerProgressMessage {
  type: "progress";
  workerId: number;
  currentNonce: number;
  hash: string;
  attempts: number;
  hashRate: number;
}

export interface WorkerFoundMessage {
  type: "found";
  workerId: number;
  nonce: number;
  hash: string;
  attempts: number;
  totalAttempts: number;
  merkleRoot: string;
  blockHeight: number;
  serializedBlock?: string;
}

export interface WorkerExhaustedMessage {
  type: "exhausted";
  workerId: number;
  attempts: number;
}

export interface WorkerErrorMessage {
  type: "error";
  workerId: number;
  error: string;
}

export type WorkerMessage =
  | WorkerStartMessage
  | WorkerStopMessage
  | WorkerTemplateUpdateMessage;

export type WorkerResponse =
  | WorkerProgressMessage
  | WorkerFoundMessage
  | WorkerExhaustedMessage
  | WorkerErrorMessage;
