// Next.js server start hook: registers the model gateway's storage hooks
// (call log, spend, chains, caps) in the Node runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/server/gateway-store");
  }
}
