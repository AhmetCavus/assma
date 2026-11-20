import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type { Readable } from "node:stream";

/**
 * Fetches a public web page for the listing capture without letting a crafted link reach
 * assma's internal network (MongoDB, Ollama and other containers on dev-proxy).
 *
 * Every connection, including each redirect, resolves the host and refuses private, loopback,
 * link-local, shared, documentation and multicast addresses. The check runs in the socket's
 * own lookup, so the address that is checked is the address that is used (no DNS rebinding).
 * Only http and https on their default ports, at most three redirects, 2 MB and 10 seconds.
 */

export class FetchRefused extends Error {
  constructor(public readonly reason: FetchRefusal) {
    super(reason);
  }
}

export type FetchRefusal =
  | "invalid_url"
  | "blocked_address"
  | "unreachable"
  | "too_many_redirects"
  | "http_error"
  | "unsupported_content"
  | "too_large"
  | "timeout";

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

/** Whether an address may be contacted: public unicast only. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    return !blocked.check(address, "ipv4");
  }
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) {
      return isPublicAddress(mapped[1]!);
    }
    // Other IPv4-embedding forms (::a.b.c.d, ::ffff:hex) are refused outright.
    if (/^::(ffff:)?[0-9a-f]{1,4}:[0-9a-f]{1,4}$/i.test(address) || /^::\d/.test(address)) {
      return false;
    }
    return !blocked.check(address, "ipv6");
  }
  return false;
}

export type SafeFetchOptions = {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Tests only: allow loopback so a local server can stand in for a website. */
  allowPrivate?: boolean;
};

export type FetchedPage = { url: string; contentType: string; body: string };

export function guardedLookup(allowPrivate: boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) {
        callback(error, "", 0);
        return;
      }
      const list = addresses as LookupAddress[];
      const usable = list.filter((entry) => allowPrivate || isPublicAddress(entry.address));
      if (usable.length === 0 || usable.length !== list.length) {
        // Any private answer refuses the host, so mixed answers cannot be raced.
        callback(new FetchRefused("blocked_address") as NodeJS.ErrnoException, "", 0);
        return;
      }
      if (options.all) {
        callback(null, usable);
      } else {
        callback(null, usable[0]!.address, usable[0]!.family);
      }
    });
  };
}

function checkUrl(raw: string, allowPrivate: boolean): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchRefused("invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchRefused("invalid_url");
  }
  if (url.username || url.password) {
    throw new FetchRefused("invalid_url");
  }
  if (url.port && !allowPrivate) {
    throw new FetchRefused("invalid_url");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  // An address literal skips the lookup, so it is checked here.
  if (isIP(host) && !allowPrivate && !isPublicAddress(host)) {
    throw new FetchRefused("blocked_address");
  }
  if (!allowPrivate && (/^localhost$/i.test(host) || /\.(localhost|internal|local)$/i.test(host))) {
    throw new FetchRefused("blocked_address");
  }
  return url;
}

function decode(stream: Readable, encoding: string | undefined): Readable {
  switch ((encoding ?? "").toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return stream.pipe(createGunzip());
    case "deflate":
      return stream.pipe(createInflate());
    case "br":
      return stream.pipe(createBrotliDecompress());
    default:
      return stream;
  }
}

function charsetOf(contentType: string): string {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase() ?? "utf-8";
  try {
    new TextDecoder(charset);
    return charset;
  } catch {
    return "utf-8";
  }
}

function request(url: URL, options: Required<SafeFetchOptions>, signal: AbortSignal) {
  return new Promise<{ redirect: string } | { status: number; contentType: string; body: string }>(
    (resolve, reject) => {
      const client = url.protocol === "https:" ? https : http;
      const outgoing = client.request(
        url,
        {
          method: "GET",
          lookup: guardedLookup(options.allowPrivate),
          signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; assma listing reader)",
            Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
            "Accept-Language": "de,en;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
          },
        },
        (response) => {
          const status = response.statusCode ?? 0;
          if (status >= 300 && status < 400 && response.headers.location) {
            response.resume();
            resolve({ redirect: new URL(response.headers.location, url).toString() });
            return;
          }
          if (status < 200 || status >= 300) {
            response.resume();
            reject(new FetchRefused("http_error"));
            return;
          }
          const contentType = String(response.headers["content-type"] ?? "");
          if (!/^(text\/(html|plain)|application\/(xhtml\+xml|ld\+json|json))/i.test(contentType)) {
            response.resume();
            reject(new FetchRefused("unsupported_content"));
            return;
          }
          const declared = Number(response.headers["content-length"] ?? 0);
          if (declared > options.maxBytes) {
            response.resume();
            reject(new FetchRefused("too_large"));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          const body = decode(response, response.headers["content-encoding"]);
          body.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > options.maxBytes) {
              body.destroy();
              response.destroy();
              reject(new FetchRefused("too_large"));
              return;
            }
            chunks.push(chunk);
          });
          body.on("end", () =>
            resolve({
              status,
              contentType,
              body: new TextDecoder(charsetOf(contentType)).decode(Buffer.concat(chunks)),
            }),
          );
          body.on("error", () => reject(new FetchRefused("unreachable")));
        },
      );
      outgoing.on("error", (error) => {
        if (error instanceof FetchRefused) {
          reject(error);
        } else if (signal.aborted) {
          reject(new FetchRefused("timeout"));
        } else {
          reject(new FetchRefused("unreachable"));
        }
      });
      outgoing.end();
    },
  );
}

export async function safeFetch(
  raw: string,
  settings: SafeFetchOptions = {},
): Promise<FetchedPage> {
  const options: Required<SafeFetchOptions> = {
    maxBytes: settings.maxBytes ?? 2 * 1024 * 1024,
    timeoutMs: settings.timeoutMs ?? 10_000,
    maxRedirects: settings.maxRedirects ?? 3,
    allowPrivate: settings.allowPrivate ?? false,
  };
  const signal = AbortSignal.timeout(options.timeoutMs);
  let url = checkUrl(raw, options.allowPrivate);
  for (let hop = 0; hop <= options.maxRedirects; hop += 1) {
    const result = await request(url, options, signal);
    if ("redirect" in result) {
      url = checkUrl(result.redirect, options.allowPrivate);
      continue;
    }
    return { url: url.toString(), contentType: result.contentType, body: result.body };
  }
  throw new FetchRefused("too_many_redirects");
}
