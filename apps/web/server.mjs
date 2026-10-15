// Production entry point. Same Next.js app, with two things Next's own server doesn't do:
//  1. it records the TCP peer address in x-jimkit-peer (after deleting any copy a client sent), because "who is on my
//     network" has to be decided from the real connection, never from a header the client controls, and
//  2. it lifts Node's request timeouts. Node drops any request that takes over five minutes to arrive, which would cut off
//     a large upload from a slow connection; uploads are bounded by the size limits instead.
// In the Docker image Next's generated standalone server.js sits next to this file and is started; from a source checkout
// (`npm start`) the app is started programmatically.
import { existsSync } from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT ?? 3000);

const create = http.createServer;
http.createServer = function patched(...args) {
  const server = create.apply(this, args);
  server.prependListener("request", (req) => {
    delete req.headers["x-jimkit-peer"];
    req.headers["x-jimkit-peer"] = req.socket.remoteAddress ?? "";
  });
  server.requestTimeout = 0; // no limit on receiving a request (big uploads)
  server.timeout = 0; // none on a socket being busy (big downloads)
  server.headersTimeout = 200_000;
  return server;
};
// must outlast a reverse proxy's idle timeout, or reused connections get reset under load
process.env.KEEP_ALIVE_TIMEOUT ??= "190000";

const standalone = fileURLToPath(new URL("./server.js", import.meta.url));
if (existsSync(standalone)) {
  await import(standalone);
} else {
  const { default: next } = await import("next");
  const app = next({ dev: false, hostname: "0.0.0.0", port });
  const handle = app.getRequestHandler();
  await app.prepare();
  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error("request failed:", err);
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
  });
  server.keepAliveTimeout = 190_000;
  server.listen(port, "0.0.0.0", () => console.log(`jimkit listening on :${port}`));
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => server.close(() => process.exit(0)));
}
