#!/usr/bin/env node
import { runLint } from "./cli/lint.js";
process.exitCode = await runLint(process.argv.slice(2));
