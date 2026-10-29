// Provisions narbel on Dokploy as split services via its API.
// Usage: DOKPLOY_URL=... DOKPLOY_API_KEY=... RESEND_API_KEY=... BASE_DOMAIN=example.com bun scripts/dokploy-provision.ts <environmentId> <sshKeyId>
// Hosts: <BASE_DOMAIN> (web), api.<BASE_DOMAIN>, store.<BASE_DOMAIN>, all https via Dokploy's Traefik + Let's Encrypt.
// Writes generated secrets to .dokploy-state.json (gitignored) so reruns reuse them.
import { randomBytes } from "node:crypto";

const [environmentId, sshKeyId] = process.argv.slice(2);
const base = `${process.env.DOKPLOY_URL}/api`;
const key = process.env.DOKPLOY_API_KEY;
const resendKey = process.env.RESEND_API_KEY;
const baseDomain = process.env.BASE_DOMAIN;
if (!(environmentId && sshKeyId && key && resendKey && baseDomain)) {
  throw new Error("usage: see header");
}

const HOSTS = {
  web: baseDomain,
  api: `api.${baseDomain}`,
  store: `store.${baseDomain}`,
};
const webUrl = `https://${HOSTS.web}`;
const apiUrl = `https://${HOSTS.api}`;
// the browser PUTs to presigned URLs, so the store must be publicly reachable
const storeUrl = `https://${HOSTS.store}`;
const REPO = "git@github.com:jirayusueb/narbel.git";
const BRANCH = process.env.BRANCH ?? "rebuild";

const call = async (path: string, body?: unknown) => {
  const res = await fetch(`${base}/${path}`, {
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

const statePath = ".dokploy-state.json";
const state = (await Bun.file(statePath).exists())
  ? await Bun.file(statePath).json()
  : {
      dbPassword: randomBytes(16).toString("hex"),
      cachePassword: randomBytes(16).toString("hex"),
      authSecret: randomBytes(24).toString("hex"),
      s3Key: randomBytes(10).toString("hex"),
      s3Secret: randomBytes(20).toString("hex"),
    };
const save = () => Bun.write(statePath, JSON.stringify(state, null, 2));
await save();

if (!state.dbId) {
  const db = await call("postgres.create", {
    name: "narbel-db",
    appName: "narbel-db",
    databaseName: "narbel",
    databaseUser: "narbel",
    databasePassword: state.dbPassword,
    dockerImage: "postgres:18-alpine",
    environmentId,
  });
  state.dbId = db.postgresId;
  // Dokploy may suffix appName; the actual appName is the service's DNS name on dokploy-network
  state.dbHost = db.appName;
  await save();
}
if (!state.cacheId) {
  const cache = await call("redis.create", {
    name: "narbel-cache",
    appName: "narbel-cache",
    databasePassword: state.cachePassword,
    dockerImage: "redis:7-alpine",
    environmentId,
  });
  state.cacheId = cache.redisId;
  state.cacheHost = cache.appName;
  await save();
}

const app = async (
  name: string,
  field: "storeId" | "apiId" | "webId",
  sourceType: "git" | "docker"
) => {
  if (!state[field]) {
    const created = await call("application.create", {
      name,
      appName: name,
      environmentId,
      sourceType,
    });
    state[field] = created.applicationId;
    state[`${field}Host`] = created.appName;
    await save();
  }
  return state[field] as string;
};

const storeId = await app("narbel-store", "storeId", "docker");
const apiId = await app("narbel-api", "apiId", "git");
const webId = await app("narbel-web", "webId", "git");

const env = (vars: Record<string, string>) =>
  Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

// MinIO no longer publishes images to Docker Hub; RustFS is an S3-compatible drop-in.
await call("application.saveDockerProvider", {
  applicationId: storeId,
  dockerImage: "rustfs/rustfs",
  username: null,
  password: null,
  registryUrl: null,
});
await call("application.saveEnvironment", {
  applicationId: storeId,
  env: env({
    RUSTFS_ACCESS_KEY: state.s3Key,
    RUSTFS_SECRET_KEY: state.s3Secret,
  }),
  buildArgs: null,
  buildSecrets: null,
  createEnvFile: false,
});

for (const [id, dockerfile, stage] of [
  [apiId, "apps/server/Dockerfile", "runner"],
  [webId, "apps/web/Dockerfile", "runner"],
] as const) {
  await call("application.saveGitProvider", {
    applicationId: id,
    customGitUrl: REPO,
    customGitBranch: BRANCH,
    customGitSSHKeyId: sshKeyId,
    customGitBuildPath: "/",
    watchPaths: null,
  });
  await call("application.saveBuildType", {
    applicationId: id,
    buildType: "dockerfile",
    dockerfile,
    dockerContextPath: ".",
    dockerBuildStage: stage,
    herokuVersion: null,
    railpackVersion: null,
  });
}

await call("application.saveEnvironment", {
  applicationId: apiId,
  env: env({
    DATABASE_URL: `postgresql://narbel:${state.dbPassword}@${state.dbHost}:5432/narbel`,
    REDIS_URL: `redis://default:${state.cachePassword}@${state.cacheHost}:6379`,
    BETTER_AUTH_SECRET: state.authSecret,
    BETTER_AUTH_URL: apiUrl,
    CORS_ORIGIN: webUrl,
    WEB_ORIGIN: webUrl,
    S3_ENDPOINT: storeUrl,
    S3_REGION: "us-east-1",
    S3_BUCKET: "narbel",
    S3_ACCESS_KEY_ID: state.s3Key,
    S3_SECRET_ACCESS_KEY: state.s3Secret,
    RESEND_API_KEY: resendKey,
    RESEND_FROM: "Narbel <onboarding@resend.dev>",
  }),
  buildArgs: null,
  buildSecrets: null,
  createEnvFile: false,
});
await call("application.saveEnvironment", {
  applicationId: webId,
  env: env({
    SERVER_URL: `http://${state.apiIdHost}:3000`,
    VITE_SERVER_URL: apiUrl,
  }),
  buildArgs: env({ VITE_SERVER_URL: apiUrl }),
  buildSecrets: null,
  createEnvFile: false,
});

const appInfo = (applicationId: string) =>
  call(`application.one?applicationId=${applicationId}`);
for (const [id, host, port] of [
  [webId, HOSTS.web, 3001],
  [apiId, HOSTS.api, 3000],
  [storeId, HOSTS.store, 9000],
] as const) {
  const info = await appInfo(id);
  // traffic goes through Traefik on 443; directly published ports would bypass TLS
  for (const published of info.ports ?? []) {
    await call("port.delete", { portId: published.portId });
  }
  const domains: { host: string }[] = info.domains ?? [];
  if (!domains.some((d) => d.host === host)) {
    await call("domain.create", {
      applicationId: id,
      host,
      port,
      https: true,
      certificateType: "letsencrypt",
      domainType: "application",
    });
  }
}

const mounts =
  (await call(`application.one?applicationId=${storeId}`)).mounts ?? [];
if (!mounts.some((m: { mountPath: string }) => m.mountPath === "/data")) {
  await call("mounts.create", {
    type: "volume",
    volumeName: "narbel-store-data",
    mountPath: "/data",
    serviceType: "application",
    serviceId: storeId,
  });
}

await call("postgres.deploy", { postgresId: state.dbId });
await call("redis.deploy", { redisId: state.cacheId });
await call("application.deploy", {
  applicationId: storeId,
  title: "provision",
});

// RustFS has no bootstrap-bucket env, and Bun's S3 client cannot create buckets, so aws-cli does it.
// The CORS rule lets the web origin PUT to presigned URLs straight from the browser.
const aws = (args: string[]) =>
  Bun.$`docker run --rm -e AWS_ACCESS_KEY_ID=${state.s3Key} -e AWS_SECRET_ACCESS_KEY=${state.s3Secret} -e AWS_DEFAULT_REGION=us-east-1 -e AWS_REQUEST_CHECKSUM_CALCULATION=when_required amazon/aws-cli --endpoint-url ${storeUrl} ${args}`.nothrow();
// retries also cover the wait for the store's Let's Encrypt certificate
for (let attempt = 0; attempt < 45; attempt += 1) {
  if (
    (await aws(["s3api", "head-bucket", "--bucket", "narbel"]).quiet())
      .exitCode === 0
  ) {
    break;
  }
  await aws(["s3api", "create-bucket", "--bucket", "narbel"]).quiet();
  await Bun.sleep(4000);
}
const cors = JSON.stringify({
  CORSRules: [
    {
      AllowedOrigins: [webUrl],
      AllowedMethods: ["PUT", "GET", "HEAD"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag"],
      MaxAgeSeconds: 3600,
    },
  ],
});
await aws([
  "s3api",
  "put-bucket-cors",
  "--bucket",
  "narbel",
  "--cors-configuration",
  cors,
]);

await call("application.deploy", { applicationId: apiId, title: "provision" });
await call("application.deploy", { applicationId: webId, title: "provision" });
console.log(
  JSON.stringify(
    {
      apiId,
      webId,
      storeId,
      dbId: state.dbId,
      cacheId: state.cacheId,
      apiUrl,
      webUrl,
    },
    null,
    2
  )
);
