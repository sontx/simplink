#!/usr/bin/env node
import { runSimp } from "./cli/simp.js";
process.exitCode = await runSimp(process.argv.slice(2));
