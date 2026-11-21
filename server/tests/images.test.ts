import assert from "node:assert/strict";
import { test } from "node:test";
import { mongo } from "mongoose";
import { bytesOf } from "../src/platform/bytes.ts";

test("photo bytes survive the BSON Binary that lean queries return", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  assert.deepEqual(bytesOf(new mongo.Binary(jpeg)), jpeg);
  assert.deepEqual(bytesOf(jpeg), jpeg);
  assert.equal(bytesOf(null).length, 0);
  // The mistake this guards against: Buffer.from() on a Binary loses the data.
  assert.notDeepEqual(Buffer.from(new mongo.Binary(jpeg) as unknown as Uint8Array), jpeg);
});
