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
  | WorkerStopMessage;

export type WorkerResponse =
  | WorkerProgressMessage
  | WorkerFoundMessage
  | WorkerExhaustedMessage
  | WorkerErrorMessage;
