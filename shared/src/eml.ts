/**
 * A ready-to-send email as an .eml file: recipient, subject, message and the CV PDF attached.
 * "X-Unsent: 1" makes Outlook open it as a draft with a Send button; Thunderbird and Apple
 * Mail open it as a message that can be sent with "Edit as new". Lines end in CRLF and stay
 * below 78 characters, as RFC 5322 asks.
 */

const CRLF = "\r\n";

export function base64Of(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

const wrap = (value: string, width = 76) => value.match(new RegExp(`.{1,${width}}`, "g")) ?? [""];

const isAscii = (value: string) => /^[\x20-\x7e]*$/.test(value);

/** RFC 2047 encoded words, split on character boundaries so no line grows too long. */
export function encodeHeader(value: string): string {
  if (isAscii(value)) {
    return value;
  }
  const encoder = new TextEncoder();
  const words: string[] = [];
  let current = "";
  for (const character of value) {
    if (encoder.encode(current + character).length > 42) {
      words.push(current);
      current = "";
    }
    current += character;
  }
  if (current) {
    words.push(current);
  }
  return words.map((word) => `=?UTF-8?B?${base64Of(encoder.encode(word))}?=`).join(`${CRLF} `);
}

function mailbox(name: string, address: string): string {
  if (!name) {
    return address;
  }
  const display = isAscii(name) ? `"${name.replace(/["\\]/g, "\\$&")}"` : encodeHeader(name);
  return `${display} <${address}>`;
}

export type EmlInput = {
  to: string;
  from?: { name: string; address: string } | null;
  subject: string;
  message: string;
  attachment: { name: string; bytes: Uint8Array } | null;
  /** For a fixed boundary in tests. */
  boundary?: string;
};

export function buildEml(input: EmlInput): string {
  const boundary =
    input.boundary ?? `assma-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const body = base64Of(new TextEncoder().encode(input.message.replace(/\r?\n/g, CRLF)));
  const headers = [
    ...(input.from?.address ? [`From: ${mailbox(input.from.name, input.from.address)}`] : []),
    `To: ${input.to}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "X-Unsent: 1",
    "MIME-Version: 1.0",
  ];
  const text = [
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    ...wrap(body),
  ];
  if (!input.attachment) {
    return [...headers, ...text, ""].join(CRLF);
  }
  const name = input.attachment.name.replace(/["\\\r\n]/g, "");
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    ...text,
    `--${boundary}`,
    `Content-Type: application/pdf; name="${name}"`,
    `Content-Disposition: attachment; filename="${name}"`,
    "Content-Transfer-Encoding: base64",
    "",
    ...wrap(base64Of(input.attachment.bytes)),
    `--${boundary}--`,
    "",
  ].join(CRLF);
}

/** A mailto: link for web mail; it cannot carry the attachment. */
export function mailtoLink(to: string, subject: string, message: string): string {
  return `mailto:${encodeURIComponent(to).replace(/%40/g, "@")}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(message.replace(/\r?\n/g, "\r\n"))}`;
}
