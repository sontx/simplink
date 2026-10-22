#!/usr/bin/env node
import { runIndex } from "./cli/index-file.js";
process.exitCode = await runIndex(process.argv.slice(2));
