// Run: node --test 'config/pi/tests/*.test.ts'
import assert from "node:assert/strict";
import { test } from "node:test";
import { forbiddenBash, parseSpec } from "../extensions/worker-sensors.ts";

const spec = (extra: string, tests = "npm test") => `---\nfiles-allowed: [src/**]\ntests: ${tests}\n${extra}---\nbody\n`;

const CLOUD: Array<[string, string[], boolean]> = [
	["npx cdk deploy MyStack", [], true],
	["cdk --profile dev destroy MyStack --force", [], true],
	["cd infra && pnpm cdk bootstrap", [], true],
	["cdk synth", [], false],
	["cdk diff MyStack", [], false],
	["aws lambda invoke --function-name f out.json", [], true],
	["aws --region us-east-1 s3api put-object --bucket b --key k", [], true],
	["aws ecs update-service --cluster c --service s", [], true],
	["aws ec2 terminate-instances --instance-ids i-1", [], true],
	["aws cloudformation deploy --template-file t.yml", [], true],
	["aws sts get-caller-identity", [], false],
	["aws logs describe-log-groups", [], false],
	["cdk deploy MyStack-dev --require-approval never", ["cdk deploy MyStack-dev"], false],
	["npx cdk deploy MyStack-dev", ["cdk deploy MyStack-dev"], false],
	["cdk deploy MyStack-prod", ["cdk deploy MyStack-dev"], true],
	["cdk deploy MyStack-dev2", ["cdk deploy MyStack-dev"], true],
	["cdk deploy MyStack-dev && aws lambda invoke --function-name f o", ["cdk deploy MyStack-dev"], true],
	["git push", ["git push"], true],
];

for (const [command, allowed, blocked] of CLOUD) {
	test(`forbiddenBash: ${command}${allowed.length ? ` (allowed: ${allowed.join(", ")})` : ""}`, () => {
		assert.equal(forbiddenBash(command, allowed) !== undefined, blocked);
	});
}

test("parseSpec: allowed-commands as a block list", () => {
	const parsed = parseSpec(spec("allowed-commands:\n  - cdk deploy MyStack-dev\n  - aws lambda invoke --function-name smoke\n"));
	assert.notEqual(typeof parsed, "string");
	if (typeof parsed !== "string") assert.deepEqual(parsed.allowedCommands, ["cdk deploy MyStack-dev", "aws lambda invoke --function-name smoke"]);
});

test("parseSpec: allowed-commands defaults to none", () => {
	const parsed = parseSpec(spec(""));
	assert.notEqual(typeof parsed, "string");
	if (typeof parsed !== "string") assert.deepEqual(parsed.allowedCommands, []);
});

const TEMP_TESTS: Array<[string, boolean]> = [
	["bash /tmp/check.sh", false],
	["node /private/tmp/x/run.mjs", false],
	["sh $TMPDIR/t.sh", false],
	["/var/folders/vj/T/run.sh", false],
	["npm test", true],
	["bash scripts/check.sh", true],
	["node --test 'config/pi/tests/*.test.ts'", true],
];
for (const [tests, ok] of TEMP_TESTS) {
	test(`parseSpec: tests '${tests}' ${ok ? "accepted" : "refused"}`, () => {
		assert.equal(typeof parseSpec(spec("", tests)) !== "string", ok);
	});
}
