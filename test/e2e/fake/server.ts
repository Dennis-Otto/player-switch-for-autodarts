/**
 * The fake Autodarts on the network: one HTTPS server on a free port of this
 * computer that answers for both of its hosts, by the Host header of a request.
 *
 * - https://play.autodarts.com serves the fake page, play.html with play.js, at
 *   every address, so a match page such as /matches/<id> is one too.
 * - https://api.autodarts.com/auth/v1 is the fake sign-in service of autodarts.ts,
 *   with the CORS headers that the page needs to reach it.
 *
 * The browser finds the server through --host-resolver-rules and trusts its
 * throwaway certificate (certificate.ts). Everything else that reaches it is
 * recorded in `stray` and answered with 404.
 */
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FakeAutodarts } from "./autodarts.ts";
import { makeCertificate } from "./certificate.ts";

export const PLAY_HOST = "play.autodarts.com";
export const AUTH_HOST = "api.autodarts.com";
const AUTH_PATH = "/auth/v1/";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLAY_HTML = readFileSync(path.join(HERE, "play.html"));
const PLAY_JS = readFileSync(path.join(HERE, "play.js"));

export interface FakeServer {
  /** The port on 127.0.0.1 that both hosts are mapped to. */
  readonly port: number;
  /** The hash of the public key of the certificate, for Chrome to trust. */
  readonly spki: string;
  /** The requests that it had no answer for, such as for another host. */
  readonly stray: string[];
  close(): Promise<void>;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function send(
  response: ServerResponse,
  status: number,
  type: string,
  body: Buffer | string,
): void {
  response.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
  });
  response.end(body);
}

/** Starts the fake Autodarts, which answers with the sign-in service it is given. */
export async function startFakeServer(
  autodarts: FakeAutodarts,
): Promise<FakeServer> {
  const certificate = makeCertificate([PLAY_HOST, AUTH_HOST]);
  const stray: string[] = [];

  async function answerAuth(
    request: IncomingMessage,
    response: ServerResponse,
    address: URL,
  ): Promise<void> {
    const cors = {
      "access-control-allow-origin": request.headers.origin ?? "*",
      "access-control-allow-methods": "POST",
      "access-control-allow-headers": "content-type",
    };
    if (request.method === "OPTIONS") {
      response.writeHead(204, cors);
      response.end();
      return;
    }
    const answer = autodarts.answer(
      address.pathname.slice(AUTH_PATH.length),
      parse(await readBody(request)),
    );
    response.writeHead(answer.status, {
      ...cors,
      "content-type": "application/json",
    });
    response.end(answer.body === null ? "" : JSON.stringify(answer.body));
  }

  async function route(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const host = (request.headers.host ?? "").replace(/:\d+$/, "");
    const address = new URL(request.url ?? "/", `https://${host}`);
    if (host === AUTH_HOST && address.pathname.startsWith(AUTH_PATH)) {
      await answerAuth(request, response, address);
    } else if (
      host === PLAY_HOST &&
      request.method === "GET" &&
      address.pathname === "/__e2e__/play.js"
    ) {
      send(response, 200, "text/javascript", PLAY_JS);
    } else if (
      host === PLAY_HOST &&
      request.method === "GET" &&
      address.pathname !== "/favicon.ico"
    ) {
      send(response, 200, "text/html; charset=utf-8", PLAY_HTML);
    } else {
      if (address.pathname !== "/favicon.ico") {
        stray.push(`${request.method} ${address.href}`);
      }
      send(response, 404, "text/plain", "Not found");
    }
  }

  const server = createServer(
    { cert: certificate.cert, key: certificate.key },
    (request, response) => {
      route(request, response).catch((error: unknown) => {
        stray.push(`${request.method} ${request.url}: ${String(error)}`);
        response.destroy();
      });
    },
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as AddressInfo).port,
    spki: certificate.spki,
    stray,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
