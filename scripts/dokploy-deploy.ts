// Redeploys Dokploy applications one after another and waits for each build to finish.
// Usage: DOKPLOY_URL=... DOKPLOY_API_KEY=... bun scripts/dokploy-deploy.ts <unique title> <applicationId>...
const [title, ...applicationIds] = process.argv.slice(2);
const url = process.env.DOKPLOY_URL;
const key = process.env.DOKPLOY_API_KEY;
if (!(url && key && title && applicationIds.length > 0)) {
  throw new Error(
    "usage: see header; DOKPLOY_URL and DOKPLOY_API_KEY must be set"
  );
}

const POLL_MS = 10_000;
const BUILD_TIMEOUT_MS = 20 * 60_000;

type DeploymentStatus = "running" | "done" | "error" | "cancelled";

interface Deployment {
  title: string;
  status: DeploymentStatus;
}

const call = async (path: string, body?: unknown) => {
  const res = await fetch(`${url}/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-api-key": key, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${path} ${res.status}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
};

// The deployment row appears only once Dokploy's queue starts the build, so it is matched by title.
const settle = async (applicationId: string) => {
  const deadline = Date.now() + BUILD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const deployments: Deployment[] = await call(
        `deployment.all?applicationId=${encodeURIComponent(applicationId)}`
      );
      const status = deployments.find((d) => d.title === title)?.status;
      if (status && status !== "running") {
        return status;
      }
    } catch (error) {
      // the build keeps running when one status read fails; the deadline still ends the loop
      console.warn(`status check failed, retrying: ${error}`);
    }
    await Bun.sleep(POLL_MS);
  }
  return "timed out";
};

for (const applicationId of applicationIds) {
  await call("application.deploy", { applicationId, title });
  const status = await settle(applicationId);
  console.log(`${applicationId}: ${status}`);
  if (status !== "done") {
    throw new Error(`deploy of ${applicationId} ended ${status}`);
  }
}
