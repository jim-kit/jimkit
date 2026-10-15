// Runs once when the server starts: bring every enabled addon up, so uploads and results from before a restart are loaded.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startAddons } = await import("./core/addons");
  await startAddons();
}
