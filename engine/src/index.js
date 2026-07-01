'use strict'

/**
 * Entry point for the Millimore Streaming Engine helper process.
 * Launched by the Electron app; it exposes the local control server.
 *
 * OSN distribution directory can be provided via MILLIMORE_OSN_DIR (the app sets
 * this to the bundled OSN location); otherwise OSN is resolved from node_modules.
 */
const { start } = require('./server')

start({ osnDir: process.env.MILLIMORE_OSN_DIR || undefined })
