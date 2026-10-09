#!/usr/bin/env node
// `npm run migrate` — apply pending database updates and exit. The signed
// updater runs this step before restarting the app (see scripts/updater/README.md).
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const pool = require("../config/db");
const { migrate } = require("../lib/migrate");

migrate(pool)
  .then(({ applied, total }) => { console.log(`Database up to date (${applied} applied, ${total} known).`); return pool.end(); })
  .catch((e) => { console.error(`❌ ${e.message}`); pool.end().finally(() => process.exit(1)); });
