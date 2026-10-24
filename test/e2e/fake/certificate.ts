/**
 * A throwaway TLS certificate for the fake Autodarts, made for one run of the tests
 * and never stored: a new P-256 key and a certificate that the key signs itself, for
 * the host names it is given. The browser trusts its key alone, through
 * `--ignore-certificate-errors-spki-list`, so the tests trust no other certificate
 * that they don't check.
 *
 * Node can read a certificate but not make one, so this writes the few fields of
 * X.509 that a TLS server needs in DER by hand (RFC 5280).
 */
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from "node:crypto";

/** A certificate and its key, in PEM, and the hash of its public key for Chrome. */
export interface Certificate {
  readonly cert: string;
  readonly key: string;
  /** The base64 SHA-256 of the public key, for --ignore-certificate-errors-spki-list. */
  readonly spki: string;
}

/** One element of DER: its tag, its length and its content. */
function der(tag: number, ...content: Buffer[]): Buffer {
  const body = Buffer.concat(content);
  const length = body.length;
  let header: Buffer;
  if (length < 0x80) {
    header = Buffer.from([tag, length]);
  } else {
    const bytes: number[] = [];
    for (let rest = length; rest > 0; rest >>= 8) {
      bytes.unshift(rest & 0xff);
    }
    header = Buffer.from([tag, 0x80 | bytes.length, ...bytes]);
  }
  return Buffer.concat([header, body]);
}

const sequence = (...content: Buffer[]): Buffer => der(0x30, ...content);

function objectId(dotted: string): Buffer {
  const [first = 0, second = 0, ...rest] = dotted.split(".").map(Number);
  const bytes = [first * 40 + second];
  for (const part of rest) {
    const chunk = [part & 0x7f];
    for (let value = part >> 7; value > 0; value >>= 7) {
      chunk.unshift(0x80 | (value & 0x7f));
    }
    bytes.push(...chunk);
  }
  return der(0x06, Buffer.from(bytes));
}

function utcTime(date: Date): Buffer {
  const text = date.toISOString().replace(/[-:T]/g, "").slice(2, 14);
  return der(0x17, Buffer.from(`${text}Z`, "ascii"));
}

function commonName(name: string): Buffer {
  return sequence(
    der(
      0x31,
      sequence(objectId("2.5.4.3"), der(0x0c, Buffer.from(name, "utf8"))),
    ),
  );
}

function pem(label: string, body: Buffer): string {
  const lines = body.toString("base64").match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

/** Makes a certificate for these host names, valid from a day ago for a week. */
export function makeCertificate(hosts: readonly string[]): Certificate {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const publicKeyInfo = publicKey.export({ type: "spki", format: "der" });
  const ecdsaWithSha256 = sequence(objectId("1.2.840.10045.4.3.2"));
  const name = commonName("Fake Autodarts for the end-to-end tests");
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  // A positive serial number: its first bit is clear.
  const serial = randomBytes(16);
  serial[0] = (serial[0] ?? 0) & 0x7f;
  const alternativeNames = sequence(
    ...hosts.map((host) => der(0x82, Buffer.from(host, "ascii"))),
  );
  const extensions = der(
    0xa3,
    sequence(
      // subjectAltName, which TLS matches the host against.
      sequence(objectId("2.5.29.17"), der(0x04, alternativeNames)),
      // basicConstraints: no certificate authority.
      sequence(objectId("2.5.29.19"), der(0x04, sequence())),
      // extKeyUsage: a TLS server.
      sequence(
        objectId("2.5.29.37"),
        der(0x04, sequence(objectId("1.3.6.1.5.5.7.3.1"))),
      ),
    ),
  );
  const certificateInfo = sequence(
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, serial),
    ecdsaWithSha256,
    name,
    sequence(utcTime(new Date(now - day)), utcTime(new Date(now + 7 * day))),
    name,
    publicKeyInfo,
    extensions,
  );
  const signature = sign("sha256", certificateInfo, privateKey);
  const certificate = sequence(
    certificateInfo,
    ecdsaWithSha256,
    der(0x03, Buffer.from([0]), signature),
  );
  return {
    cert: pem("CERTIFICATE", certificate),
    key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    spki: createHash("sha256").update(publicKeyInfo).digest("base64"),
  };
}
