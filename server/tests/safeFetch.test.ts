import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import { gzipSync } from "node:zlib";
import {
  FetchRefused,
  guardedLookup,
  isPublicAddress,
  safeFetch,
} from "../src/platform/safeFetch.ts";
import { jobPostingText, listingText } from "../src/projects/listingText.ts";

test("only public unicast addresses may be contacted", () => {
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "172.18.0.12",
    "192.168.178.131",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "64:ff9b::7f00:1",
    "not an address",
  ]) {
    assert.equal(isPublicAddress(address), false, address);
  }
  for (const address of ["93.184.215.14", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
    assert.equal(isPublicAddress(address), true, address);
  }
});

const refusal = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error instanceof FetchRefused ? error.reason : `other: ${String(error)}`;
  }
  return "fetched";
};

test("internal targets are refused before any connection", async () => {
  assert.equal(await refusal(safeFetch("http://127.0.0.1/")), "blocked_address");
  assert.equal(await refusal(safeFetch("http://[::1]/")), "blocked_address");
  assert.equal(
    await refusal(safeFetch("http://169.254.169.254/latest/meta-data")),
    "blocked_address",
  );
  assert.equal(await refusal(safeFetch("http://localhost/")), "blocked_address");
  assert.equal(await refusal(safeFetch("http://shared-mongo.internal/")), "blocked_address");
  assert.equal(await refusal(safeFetch("http://example.com:27017/")), "invalid_url");
  assert.equal(await refusal(safeFetch("file:///etc/passwd")), "invalid_url");
  assert.equal(await refusal(safeFetch("http://user:pw@example.com/")), "invalid_url");
});

test("a host name that resolves to a private address is refused in the socket lookup", async () => {
  const result = await new Promise<unknown>((resolve) =>
    guardedLookup(false)("localhost", { all: true }, (error) => resolve(error)),
  );
  assert.ok(result instanceof FetchRefused);
  assert.equal((result as FetchRefused).reason, "blocked_address");
});

let server: Server;
let base = "";

before(async () => {
  server = createServer((request, response) => {
    switch (request.url) {
      case "/listing":
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(
          "<html><body><main><h1>Android Engineer</h1><p>Kotlin &amp; Compose</p></main></body></html>",
        );
        return;
      case "/gzip":
        response.writeHead(200, { "Content-Type": "text/plain", "Content-Encoding": "gzip" });
        response.end(gzipSync("compressed listing text"));
        return;
      case "/latin1":
        response.writeHead(200, { "Content-Type": "text/plain; charset=iso-8859-1" });
        response.end(Buffer.from("Düsseldorf", "latin1"));
        return;
      case "/redirect":
        response.writeHead(302, { Location: "/listing" });
        response.end();
        return;
      case "/loop":
        response.writeHead(302, { Location: "/loop" });
        response.end();
        return;
      case "/big":
        response.writeHead(200, { "Content-Type": "text/plain" });
        response.end("x".repeat(3000));
        return;
      case "/image":
        response.writeHead(200, { "Content-Type": "image/png" });
        response.end("png");
        return;
      default:
        response.writeHead(403, { "Content-Type": "text/html" });
        response.end("login required");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

after(() => server.close());

const local = { allowPrivate: true, maxBytes: 2000 };

test("pages are fetched, redirects followed and bodies decoded", async () => {
  const page = await safeFetch(`${base}/redirect`, local);
  assert.equal(page.url, `${base}/listing`);
  assert.match(listingText(page.body, page.contentType), /Android Engineer\n\nKotlin & Compose/);
  assert.equal((await safeFetch(`${base}/gzip`, local)).body, "compressed listing text");
  assert.equal((await safeFetch(`${base}/latin1`, local)).body, "Düsseldorf");
});

test("loops, large bodies, other content and errors are refused", async () => {
  assert.equal(await refusal(safeFetch(`${base}/loop`, local)), "too_many_redirects");
  assert.equal(await refusal(safeFetch(`${base}/big`, local)), "too_large");
  assert.equal(await refusal(safeFetch(`${base}/image`, local)), "unsupported_content");
  assert.equal(await refusal(safeFetch(`${base}/private`, local)), "http_error");
});

test("a schema.org JobPosting is preferred over the page text", () => {
  const html = `<html><head><title>Jobs</title>
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},
    {"@type":"JobPosting","title":"Senior Android Engineer","hiringOrganization":{"name":"Aster Care"},
    "jobLocation":{"address":{"addressLocality":"Düsseldorf","addressCountry":"DE"}},
    "description":"&lt;p&gt;Kotlin und Compose&lt;/p&gt;&lt;ul&gt;&lt;li&gt;TalkBack&lt;/li&gt;&lt;/ul&gt;"}]}</script>
    </head><body><nav>Menu</nav><p>Cookie banner</p></body></html>`;
  assert.equal(
    jobPostingText(html),
    "Senior Android Engineer\nAster Care\nDüsseldorf, DE\n\nKotlin und Compose\n\n- TalkBack",
  );
  assert.equal(jobPostingText("<html><body>No posting</body></html>"), null);
});

test("without a posting, scripts and navigation are dropped and entities decoded", () => {
  const text = listingText(
    `<html><head><title>Projekt &ndash; Kotlin</title><style>p{}</style></head><body><nav>Menü</nav>
     <script>track()</script><p>Remote&nbsp;80&#x20;% &uuml;ber 6 Monate</p><footer>Impressum</footer></body></html>`,
    "text/html",
  );
  assert.equal(text, "Projekt – Kotlin\n\nRemote 80 % über 6 Monate");
});
