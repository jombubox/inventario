import { createServer } from "node:http";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const port = 5555;
const objects = new Map();
const awsEncode = (value) => encodeURIComponent(value).replace(/[!'()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
const hmac = (key, value) => createHmac("sha256", key).update(value).digest();
function validPresignedPut(request, url) {
  try {
    const query = url.searchParams;
    if (query.get("X-Amz-Algorithm") !== "AWS4-HMAC-SHA256") return false;
    const [accessKey, day, region, service, end] = query.get("X-Amz-Credential").split("/");
    if (accessKey !== "e2e-access-key" || region !== "auto" || service !== "s3" || end !== "aws4_request") return false;
    const date = query.get("X-Amz-Date"), expiry = Number(query.get("X-Amz-Expires"));
    const timestamp = Date.parse(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`);
    if (!Number.isFinite(timestamp) || expiry < 1 || expiry > 300 || Date.now() > timestamp + expiry * 1000 || timestamp > Date.now() + 60_000) return false;
    const signedHeaders = query.get("X-Amz-SignedHeaders");
    if (signedHeaders !== "content-type;host") return false;
    const canonicalHeaders = signedHeaders.split(";").map((name) => `${name}:${String(request.headers[name] ?? "").trim().replace(/\s+/gu, " ")}\n`).join("");
    const canonicalQuery = [...query.entries()].filter(([name]) => name !== "X-Amz-Signature")
      .map(([name, value]) => [awsEncode(name), awsEncode(value)]).sort(([a, av], [b, bv]) => a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0)
      .map(([name, value]) => `${name}=${value}`).join("&");
    const canonical = ["PUT", url.pathname, canonicalQuery, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
    const scope = `${day}/${region}/${service}/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", date, scope, createHash("sha256").update(canonical).digest("hex")].join("\n");
    const signingKey = hmac(hmac(hmac(hmac("AWS4e2e-secret-key", day), region), service), "aws4_request");
    const expected = hmac(signingKey, stringToSign);
    const actual = Buffer.from(query.get("X-Amz-Signature") ?? "", "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

const server = createServer(async (request, response) => {
  if (request.headers.origin === "http://127.0.0.1:3000") {
    response.setHeader("Access-Control-Allow-Origin", request.headers.origin);
    response.setHeader("Vary", "Origin");
  }
  if (request.method === "OPTIONS") {
    response.writeHead(request.headers.origin === "http://127.0.0.1:3000" ? 204 : 403, {
      "Access-Control-Allow-Methods": "PUT", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "300",
    }); response.end(); return;
  }
  if (request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: "ok", objects: objects.size }));
    return;
  }

  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const objectPath = url.pathname;
  if (request.method === "PUT") {
    if (url.searchParams.has("X-Amz-Algorithm") && !validPresignedPut(request, url)) {
      response.writeHead(403); response.end(); return;
    }
    if (!url.searchParams.has("X-Amz-Algorithm") && !request.headers.authorization) {
      response.writeHead(403); response.end(); return;
    }
    const copySource = request.headers["x-amz-copy-source"];
    if (copySource) {
      const source = objects.get(`/${decodeURIComponent(copySource).replace(/^\//u, "")}`);
      if (!source || request.headers["x-amz-copy-source-if-match"] !== source.etag) {
        response.writeHead(source ? 412 : 404); response.end(); return;
      }
      objects.set(objectPath, { ...source, body: Buffer.from(source.body) });
      response.writeHead(200, { "Content-Type": "application/xml" });
      response.end(`<CopyObjectResult><ETag>${source.etag}</ETag><LastModified>${new Date().toISOString()}</LastModified></CopyObjectResult>`); return;
    }
    const body = await readBody(request);
    const etag = `"${createHash("md5").update(body).digest("hex")}"`;
    objects.set(objectPath, {
      body, etag,
      contentType: request.headers["content-type"] ?? "application/octet-stream",
    });
    response.writeHead(200, { ETag: etag });
    response.end();
    return;
  }
  if (request.method === "DELETE") {
    objects.delete(objectPath);
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === "GET" || request.method === "HEAD") {
    const object = objects.get(objectPath);
    if (!object) {
      response.writeHead(404);
      response.end();
      return;
    }
    if (request.headers["if-match"] && request.headers["if-match"] !== object.etag) {
      response.writeHead(412); response.end(); return;
    }
    response.writeHead(200, {
      "Content-Type": object.contentType,
      "Content-Length": String(object.body.length),
      ETag: object.etag,
    });
    response.end(request.method === "HEAD" ? undefined : object.body);
    return;
  }

  response.writeHead(405);
  response.end();
});

server.listen(port, "127.0.0.1", () => process.stdout.write(`Fake R2 listening on ${port}.\n`));
