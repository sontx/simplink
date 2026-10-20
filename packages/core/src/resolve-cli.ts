#!/usr/bin/env node
import { runResolve } from "./cli/resolve.js";
process.exitCode = await runResolve(process.argv.slice(2));
