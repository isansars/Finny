import { test } from "node:test";
import assert from "node:assert/strict";
import { zip, crc32 } from "../../src/lib/zip.ts";

test("crc32 of a known string", () => { assert.equal(crc32(new TextEncoder().encode("hello")), 0x3610a686); });
test("a zip starts with a local header and ends with the end-of-central-directory record", () => {
  const z = zip({ "a.csv": "x,y\n1,2\n", "b.csv": "z\n" });
  const v = new DataView(z.buffer, z.byteOffset, z.byteLength);
  assert.equal(v.getUint32(0, true), 0x04034b50);
  assert.equal(v.getUint32(z.length - 22, true), 0x06054b50);
  assert.equal(v.getUint16(z.length - 22 + 10, true), 2); // two entries
});
