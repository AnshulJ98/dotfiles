import { test } from "node:test";
import assert from "node:assert/strict";
import { closesOnQuestion, isHeadless } from "./headless-close.ts";

const cases: [string, string, boolean][] = [
  ["should flag when the final line is a bare question",
   "I checked the index.\nIs the 800ms handler-side or the DynamoDB metric?", true],
  ["should flag when the question ends with a bold marker",
   "Findings below.\n**Is DAX off the table?**", true],
  ["should pass when the final line is a declaration",
   "Measure first. I am defaulting to DAX until you say otherwise.", false],
  ["should pass when a question is mid-reply but the close is declarative",
   "Is Redis the right call? No. Default taken: DAX, reversible in one deploy.", false],
  ["should pass when a trailing code fence follows the prose",
   "Run this.\n```sh\naws dynamodb describe-table\n```", false],
  ["should flag when the last list item is a question",
   "Next:\n- confirm the metric\n- which p99 are you quoting?", true],
  ["should pass when a trailing table follows the prose",
   "Pick pg-boss.\n\n| a | b |\n|---|---|\n| 1 | 2 |", false],
  ["should pass when the reply is empty", "", false],
  ["should pass when a question mark sits inside a quoted string",
   'The flag is named "--why?" and it is deprecated. Use --explain.', false],
];
for (const [name, input, expected] of cases) {
  test(name, () => assert.equal(closesOnQuestion(input), expected));
}
test("should detect headless when argv carries -p", () =>
  assert.equal(isHeadless(["node", "pi", "-p", "hi"]), true));
test("should detect interactive when argv lacks -p", () =>
  assert.equal(isHeadless(["node", "pi"]), false));
