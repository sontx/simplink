#!/usr/bin/env node
import { runSearch } from "./cli/search.js";
process.exitCode = await runSearch(process.argv.slice(2));
