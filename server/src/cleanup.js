/**
 * Sweeps orphaned uploads.
 *
 *   npm run cleanup:uploads             # dry run (default) - deletes nothing
 *   npm run cleanup:uploads -- --apply  # actually delete
 *
 * Flags:
 *   --apply                 Perform the deletion. Without it, this is a preview.
 *   --grace=<minutes>       Protect files newer than this. Default 60.
 *   --help                  Show usage.
 *
 * Intentionally a CLI script rather than an HTTP route: a destructive
 * maintenance operation should not be reachable over the network, and it
 * should not be something a stray request can trigger.
 */
/**
 * NOTE ON IMPORTS
 *
 * `config/env.js` validates the environment and calls process.exit(1) when
 * MONGODB_URI or JWT_SECRET is missing. That happens at module load, which
 * would make `--help` fail on a machine with no .env - a poor experience for
 * someone just trying to read the usage text, and it would also mask a typo'd
 * flag behind a confusing credentials error.
 *
 * So the modules that require configuration are imported dynamically, after
 * argument parsing has succeeded. Nothing below is imported statically.
 *
 * Keep in sync with DEFAULT_GRACE_PERIOD_MS in services/cleanupService.js.
 */
const DEFAULT_GRACE_MINUTES = 60;
function parseArgs(argv) {
  const options = {
    apply: false,
    graceMinutes: DEFAULT_GRACE_MINUTES,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--apply') options.apply = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--grace=')) {
      const value = Number(arg.split('=')[1]);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Invalid --grace value: ${arg.split('=')[1]}`);
      }
      options.graceMinutes = value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function printUsage() {
  console.log(`
Upload cleanup - removes files in the upload directory that no post or
profile references.

  Cleanup is a destructive maintenance task, so it is deliberately a CLI
  script and never an HTTP route.

  npm run cleanup:uploads                  Preview only (deletes nothing)
  npm run cleanup:uploads -- --apply       Delete the orphans
  npm run cleanup:uploads -- --grace=5     Protect files newer than 5 minutes
  npm run cleanup:help                     Show this text (no .env needed)

  NOTE: npm swallows flags it recognises (--help among them), so the direct
  form is the reliable one when a flag seems to be ignored:

  node server/src/cleanup.js --apply

Files younger than the grace period are never touched, because an upload
that is still being attached to a post looks identical to an orphan.
`);
}

async function main() {
  // Parse and validate arguments FIRST, so --help and bad flags never need
  // database credentials.
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  // Only now load the modules that require a configured environment.
  const [{ connectDatabase, disconnectDatabase }, { config }, { cleanupOrphanedUploads }] =
    await Promise.all([
      import('./config/db.js'),
      import('./config/env.js'),
      import('./services/cleanupService.js'),
    ]);

  await connectDatabase();

  const gracePeriodMs = Math.round(options.graceMinutes * 60 * 1000);

  console.log('');
  console.log('  Upload cleanup');
  console.log(`  directory   : ${config.uploadDir}`);
  console.log(`  mode        : ${options.apply ? 'APPLY (files will be deleted)' : 'DRY RUN (nothing will be deleted)'}`);
  console.log(`  grace period: ${options.graceMinutes} minute(s)`);
  console.log('');

  const summary = await cleanupOrphanedUploads(config.uploadDir, {
    apply: options.apply,
    gracePeriodMs,
  });

  console.log(`  Referenced (kept)      : ${summary.keptCount}`);
  console.log(`  Skipped (too recent)   : ${summary.skippedRecentCount}`);
  console.log(`  ${options.apply ? 'Deleted' : 'Would delete'}              : ${summary.deleted.length}`);

  if (summary.deleted.length > 0) {
    console.log('');
    for (const file of summary.deleted.slice(0, 50)) {
      console.log(`    ${file.name}  (${formatBytes(file.size)})`);
    }
    if (summary.deleted.length > 50) {
      console.log(`    ... and ${summary.deleted.length - 50} more`);
    }
  }

  if (summary.failed.length > 0) {
    console.log('');
    console.log(`  Failed to delete ${summary.failed.length} file(s):`);
    for (const failure of summary.failed) {
      console.log(`    ${failure.name}: ${failure.error}`);
    }
  }

  console.log('');
  console.log(`  Reclaimable: ${formatBytes(summary.reclaimableBytes)}`);

  if (!options.apply && summary.deleted.length > 0) {
    console.log('');
    console.log('  This was a dry run. Re-run with --apply to delete these files.');
  }

  console.log('');

  await disconnectDatabase();

  // A partial failure should be visible to a cron job / CI runner.
  if (summary.failed.length > 0) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error('');
  console.error(`[cleanup] Failed: ${error.message}`);
  if (error.message.startsWith('Unknown argument')) {
    console.error('[cleanup] Run with --help for usage.');
  }
  process.exit(1);
});
