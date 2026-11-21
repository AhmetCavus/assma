import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applicationEmail,
  applicationInputSchema,
  buildEml,
  daysBetween,
  dueFollowUps,
  encodeHeader,
  LOCALES,
  looksLikePdf,
  mailtoLink,
  upcomingFollowUps,
  type ApplicationSummary,
} from "../src/index.ts";

const row = (
  followUpAt: string | null,
  status: ApplicationSummary["status"] = "applied",
): Pick<ApplicationSummary, "followUpAt" | "status"> => ({ followUpAt, status });

test("follow-ups: due includes today and overdue, only for open applications", () => {
  const today = "2026-11-21";
  const list = [
    row("2026-11-25"),
    row("2026-11-21"),
    row("2026-11-10"),
    row("2026-11-01", "closed"),
    row(null),
    row("2026-11-15", "interview"),
  ];
  assert.deepEqual(
    dueFollowUps(list, today).map((item) => item.followUpAt),
    ["2026-11-10", "2026-11-15", "2026-11-21"],
  );
  assert.deepEqual(
    upcomingFollowUps(list, today).map((item) => item.followUpAt),
    ["2026-11-25"],
  );
  assert.equal(daysBetween("2026-11-10", today), 11);
  assert.equal(daysBetween("2026-10-30", "2026-11-02"), 3);
});

test("email draft: German greeting, strengths and signature from the profile", () => {
  const email = applicationEmail(
    {
      title: "Senior Android Engineer",
      company: "Aster Care",
      contact: "Jonas Klein",
      contactEmail: "jonas@northline.example",
    },
    {
      name: "Mara Linden",
      phone: "+49 170 0000000",
      email: "mara@linden.example",
      website: "https://linden.example/",
    },
    ["Kotlin", "Jetpack Compose", "TalkBack", "Offline-first", "CI"],
    LOCALES.de.apply.template,
  );
  assert.equal(email.to, "jonas@northline.example");
  assert.equal(email.subject, "Bewerbung: Senior Android Engineer");
  assert.match(email.message, /^Guten Tag Jonas Klein,/);
  assert.match(email.message, /„Senior Android Engineer“ für Aster Care/);
  assert.match(email.message, /Kotlin, Jetpack Compose, TalkBack, Offline-first\./);
  assert.doesNotMatch(email.message, /CI/);
  assert.match(
    email.message,
    /Viele Grüße\nMara Linden\n\+49 170 0000000\nmara@linden.example\nlinden.example$/,
  );

  const english = applicationEmail(
    { title: "Lead", company: "", contact: "", contactEmail: "" },
    { name: "", phone: "", email: "", website: "" },
    [],
    LOCALES.en.apply.template,
  );
  assert.match(english.message, /^Hello,\n\nI read your listing “Lead” with great interest/);
  assert.doesNotMatch(english.message, /experience covers/);
});

test(".eml: unsent draft with encoded subject, UTF-8 body and the PDF attached", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7\n...\n%%EOF\n");
  const eml = buildEml({
    to: "jonas@northline.example",
    from: { name: "Mara Linden", address: "mara@linden.example" },
    subject: "Bewerbung: Größte Aufgabe für Düsseldorf",
    message: "Guten Tag,\nanbei mein CV.",
    attachment: { name: "Mara-Linden_Aster-Care.pdf", bytes: pdf },
    boundary: "BOUNDARY",
  });
  const lines = eml.split("\r\n");
  assert.ok(
    lines.every((line) => line.length <= 78),
    "no line longer than 78 characters",
  );
  assert.ok(eml.includes('From: "Mara Linden" <mara@linden.example>'));
  assert.ok(eml.includes("X-Unsent: 1"));
  assert.match(eml, /Subject: =\?UTF-8\?B\?/);
  assert.ok(eml.includes('Content-Type: multipart/mixed; boundary="BOUNDARY"'));
  assert.ok(eml.includes('Content-Disposition: attachment; filename="Mara-Linden_Aster-Care.pdf"'));
  assert.ok(eml.trimEnd().endsWith("--BOUNDARY--"));
  // The parts decode back to the original text and bytes.
  const parts = eml.split("--BOUNDARY");
  const decode = (part: string) =>
    Buffer.from(part.split("\r\n\r\n")[1]!.replace(/\r\n/g, ""), "base64");
  assert.equal(decode(parts[1]!).toString("utf8"), "Guten Tag,\r\nanbei mein CV.");
  assert.deepEqual(new Uint8Array(decode(parts[2]!)), pdf);
  // The encoded subject decodes to the original.
  const subject = encodeHeader("Bewerbung: Größte Aufgabe für Düsseldorf")
    .split("\r\n ")
    .map((word) => Buffer.from(word.slice(10, -2), "base64").toString("utf8"))
    .join("");
  assert.equal(subject, "Bewerbung: Größte Aufgabe für Düsseldorf");
  assert.equal(encodeHeader("Plain subject"), "Plain subject");
});

test("mailto: encodes subject and body, keeps the address readable", () => {
  const link = mailtoLink("jonas@northline.example", "Bewerbung: A & B", "Zeile 1\nZeile 2");
  assert.equal(
    link,
    "mailto:jonas@northline.example?subject=Bewerbung%3A%20A%20%26%20B&body=Zeile%201%0D%0AZeile%202",
  );
});

test("application input: email needs details and a PDF, a portal record may state no CV", () => {
  const cv = { language: "de", skills: ["Kotlin"], referenceIds: [] };
  const base = { projectId: "a".repeat(24), submittedAt: new Date().toISOString(), cv };
  const email = { to: "jonas@northline.example", subject: "Bewerbung", message: "Hallo" };
  assert.equal(
    applicationInputSchema.safeParse({ ...base, channel: "email", email, file: "JVBERi0=" })
      .success,
    true,
  );
  assert.equal(
    applicationInputSchema.safeParse({ ...base, channel: "email", email }).success,
    false,
  );
  assert.equal(
    applicationInputSchema.safeParse({ ...base, channel: "email", file: "JVBERi0=" }).success,
    false,
  );
  assert.equal(
    applicationInputSchema.safeParse({ ...base, channel: "portal", portal: { cvUploaded: false } })
      .success,
    true,
  );
  assert.equal(
    applicationInputSchema.safeParse({ ...base, channel: "portal", portal: { cvUploaded: true } })
      .success,
    false,
  );
  assert.equal(
    applicationInputSchema.safeParse({
      ...base,
      channel: "portal",
      portal: { cvUploaded: false },
      file: "JVBERi0=",
    }).success,
    false,
  );
});

test("PDF check: header and end marker", () => {
  const encode = (text: string) => new TextEncoder().encode(text);
  assert.equal(looksLikePdf(encode("%PDF-1.7\nstuff\n%%EOF")), true);
  assert.equal(looksLikePdf(encode("%PDF-1.7\nstuff")), false);
  assert.equal(looksLikePdf(encode("<html>%%EOF")), false);
});
