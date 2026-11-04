// No database is contacted: only public pages and requests without a session cookie.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const origin = "http://localhost:3108";
let output = "";
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", "3108"],
  {
    env: {
      ...process.env,
      DATABASE_URL:
        "postgresql://unconfigured:unconfigured@localhost:1/unconfigured",
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      BETTER_AUTH_URL: origin,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
server.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  output += chunk.toString();
});
try {
  const deadline = Date.now() + 30000;
  while (!output.includes("Ready")) {
    if (server.exitCode !== null || Date.now() > deadline)
      throw new Error(`Server failed to start: ${output}`);
    await delay(250);
  }
  for (const [path, heading] of [
    ["/", "A little clarity."],
    ["/login", "Welcome back."],
    ["/register", "Start fresh."],
  ]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    assert.ok((await response.text()).includes(heading), path);
    console.log(`PASS public page ${path}`);
  }
  for (const path of [
    "/setup",
    "/dashboard/settings",
    "/dashboard",
    "/dashboard/accounts",
    "/dashboard/categories",
    "/dashboard/transactions",
    "/dashboard/transactions/export",
    "/dashboard/import",
    "/dashboard/review",
    "/dashboard/transfers",
    "/dashboard/subscriptions",
    "/dashboard/subscriptions/private-id",
    "/dashboard/bills",
    "/dashboard/bills/private-id",
    "/dashboard/calendar",
    "/dashboard/budgets",
    "/dashboard/goals",
    "/dashboard/comparisons",
  ]) {
    const response = await fetch(origin + path, { redirect: "manual" });
    assert.equal(response.status, 307, path);
    assert.equal(
      new URL(response.headers.get("location"), origin).pathname,
      "/login",
      path,
    );
    console.log(`PASS signed-out redirect ${path}`);
  }
  console.log("HTTP smoke checks passed. Database integration was not tested.");
} finally {
  server.kill();
}
