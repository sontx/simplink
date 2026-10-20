#!/usr/bin/env node
import { runDocs } from "./cli/docs.js";
process.exitCode = await runDocs(process.argv.slice(2));
