import { createServer } from "node:http";

const port = 5555;
const objects = new Map();

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

const server = createServer(async (request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: "ok", objects: objects.size }));
    return;
  }

  const objectPath = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  if (request.method === "PUT") {
    objects.set(objectPath, {
      body: await readBody(request),
      contentType: request.headers["content-type"] ?? "application/octet-stream",
    });
    response.writeHead(200, { ETag: '"fake-r2-etag"' });
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
    response.writeHead(200, {
      "Content-Type": object.contentType,
      "Content-Length": String(object.body.length),
    });
    response.end(request.method === "HEAD" ? undefined : object.body);
    return;
  }

  response.writeHead(405);
  response.end();
});

server.listen(port, "127.0.0.1", () => process.stdout.write(`Fake R2 listening on ${port}.\n`));
