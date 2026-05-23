---
name: cli-builder
description: Guide for building TypeScript CLIs with Bun. Use when creating command-line tools, adding subcommands to existing CLIs, or building developer tooling. Covers argument parsing, subcommand patterns, output formatting, and distribution.
tags:
  - typescript
  - cli
  - bun
  - tooling
---

# CLI Builder — TypeScript + Bun

## Project Setup

```bash
mkdir my-cli && cd my-cli
bun init -y
bun add commander chalk ora
```

```json
// package.json
{
  "name": "my-cli",
  "bin": { "my-cli": "./src/index.ts" },
  "scripts": {
    "build": "bun build ./src/index.ts --compile --outfile my-cli",
    "dev": "bun run ./src/index.ts"
  }
}
```

## Basic Structure

```typescript
#!/usr/bin/env bun
import { Command } from "commander";

const program = new Command();

program
  .name("my-cli")
  .description("Description")
  .version("1.0.0");

program
  .command("do <thing>")
  .description("Does the thing")
  .option("-v, --verbose", "verbose output")
  .action(async (thing, options) => {
    // implementation
  });

program.parse();
```

## Subcommand Pattern

```typescript
// src/commands/build.ts
import { Command } from "commander";
export const buildCommand = new Command("build")
  .description("Build the project")
  .action(async () => { /* ... */ });

// src/index.ts
program.addCommand(buildCommand);
```

## Output Formatting

```typescript
import chalk from "chalk";
import ora from "ora";

// Status indicators
console.log(chalk.green("✓ Done"));
console.log(chalk.red("✗ Failed"));
console.log(chalk.yellow("⚠ Warning"));
console.log(chalk.cyan("→ Info"));

// Spinner for async ops
const spinner = ora("Processing...").start();
await doWork();
spinner.succeed("Done");
// or spinner.fail("Failed");
```

## Distribution

```bash
# Single binary (Bun compile)
bun build ./src/index.ts --compile --outfile dist/my-cli

# npm package
npm publish --access public
```

## Input Validation Pattern

```typescript
import { z } from "zod";

const argsSchema = z.object({ port: z.number().min(1).max(65535) });
const parsed = argsSchema.safeParse({ port: Number(options.port) });
if (!parsed.success) {
  console.error(chalk.red("Invalid args:"), parsed.error.format());
  process.exit(1);
}
```
