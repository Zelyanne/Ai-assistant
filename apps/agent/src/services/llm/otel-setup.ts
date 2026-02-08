import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { config } from "../../config/index.js";

let sdk: NodeSDK | null = null;
let langfuseSpanProcessor: LangfuseSpanProcessor | null = null;

export function initOTel() {
  if (sdk) return;

  console.log('[OTel] Initializing OpenTelemetry SDK with LangfuseSpanProcessor...');
  
  langfuseSpanProcessor = new LangfuseSpanProcessor({
    publicKey: config.LANGFUSE_PUBLIC_KEY,
    secretKey: config.LANGFUSE_SECRET_KEY,
    baseUrl: config.LANGFUSE_HOST,
    environment: config.NODE_ENV,
  });

  sdk = new NodeSDK({
    spanProcessors: [langfuseSpanProcessor],
  });

  sdk.start();
  console.log('[OTel] OpenTelemetry SDK started.');
}

export async function shutdownOTel() {
  if (sdk) {
    console.log('[OTel] Shutting down OpenTelemetry SDK...');
    await sdk.shutdown();
    sdk = null;
    console.log('[OTel] OpenTelemetry SDK shut down.');
  }
}

export async function flushOTel() {
  if (langfuseSpanProcessor) {
    console.log('[OTel] Flushing Langfuse spans...');
    await langfuseSpanProcessor.forceFlush();
  }
}
