/** Explicit one-shot staging migration. JSON files remain authoritative.
 * Usage in a configured app container:
 *   node --import tsx server/pgStateMigrator.ts --dry-run
 *   node --import tsx server/pgStateMigrator.ts --apply
 */
import { identityPool, initializeIdentity } from './pgIdentity';
import { createPersonalStateBackup, verifyPersonalStateBackup } from './pgStateBackup';
import { verifyPersonalStateStaging } from './pgPersonalStateVerifier';
import { DEFAULT_PERSONAL_STATE_STAGE_KEY, personalStateSnapshotDigest,
  preparePersonalStateRows, readJsonSnapshot, readPersonalStateSchema,
  stagePersonalStateToPostgres } from './pgPersonalState';

async function main() {
  const args=process.argv.slice(2);
  const ready=args[0]==='--ready';
  if (!((args.length===1 && ['--dry-run','--apply','--verify','--backup'].includes(args[0])) ||
        (ready && args.length===2 && args[1].length>0)))
    throw new Error('Specify --dry-run, --backup, --apply, --verify or --ready <backup-file>');
  const dry=args[0]==='--dry-run';
  const verify=args[0]==='--verify';
  if (ready && process.env.H00K_PERSONAL_STATE_WRITERS_STOPPED !== '1')
    throw new Error('Readiness check requires stopped app writers; stop the app first and set H00K_PERSONAL_STATE_WRITERS_STOPPED=1');
  // Reading a verified, private backup is mandatory for any readiness claim.
  const verifiedBackup=ready ? verifyPersonalStateBackup(args[1]) : null;
  const snapshot=readJsonSnapshot();
  // A local, private copy also supports operators without DB connectivity.
  // Back up full app/PostgreSQL volumes separately before any real migration.
  if (args[0] === '--backup') {
    const backup = createPersonalStateBackup(snapshot);
    console.log(JSON.stringify({mode:'backup-only',backupFile:backup.file,
      snapshotSha256:backup.sha256,jsonStillAuthoritative:true},null,2));
    return;
  }
  // --verify must be truly read-only, including schema setup. Applying or
  // planning the first migration still initializes existing identity tables.
  if (!verify && !ready) await initializeIdentity();
  const connection=await identityPool().connect();
  try {
    if (verify || ready) {
      const result=await verifyPersonalStateStaging(connection,snapshot);
      // The operator may have forgotten to stop another app instance, or an
      // in-flight write may have completed during the read-only transaction.
      const snapshotUnchanged=personalStateSnapshotDigest(readJsonSnapshot()) ===
        personalStateSnapshotDigest(snapshot);
      const backupMatches=verifiedBackup?.sha256 === personalStateSnapshotDigest(snapshot);
      const preflightPassed=result.consistent && snapshotUnchanged &&
        (!ready || (backupMatches && result.skipped.invalid===0 && result.skipped.orphaned===0));
      // Only aggregate counts and fingerprints, never individual user IDs,
      // coins, trading history, chat identities or private JSON payloads.
      console.log(JSON.stringify({mode:ready?'ready-for-runtime-integration':'verify-read-only',
        ...result, snapshotUnchanged,
        ...(ready?{backupMatches,appWritersDeclaredStopped:true,
          preflightPassed,requiresPgRuntimeCutover:true}:{}),
        changesApplied:false,jsonStillAuthoritative:true,liveCutover:false},null,2));
      if (!preflightPassed) process.exitCode=2;
      return;
    }
    if(dry) {
      const r=await connection.query('SELECT id FROM auth_users');
      const prepared=preparePersonalStateRows(snapshot,
        new Set<string>(r.rows.map((u:{id:string})=>u.id)));
      let previousHash: string | null = null;
      try {
        const previous=await connection.query(
          'SELECT snapshot_sha256 FROM h00k_personal_state_staging_runs WHERE stage_key=$1',
          [DEFAULT_PERSONAL_STATE_STAGE_KEY]);
        previousHash=previous.rows[0]?.snapshot_sha256 ?? null;
      } catch(error) {
        // A first-time dry-run must also work before 002_personal_state.sql
        // creates the staging tables; other PostgreSQL errors still fail.
        if ((error as {code?:string}).code !== '42P01') throw error;
      }
      const snapshotSha256=personalStateSnapshotDigest(snapshot);
      console.log(JSON.stringify({mode:'dry-run',surveillance:prepared.surveillance.length,
        alerts:prepared.alerts.length,history:prepared.history.length,
        skipped:prepared.skipped,stageKey:DEFAULT_PERSONAL_STATE_STAGE_KEY,
        snapshotSha256,stagedSnapshotMatches:previousHash===null ? null :
          previousHash===snapshotSha256,
        changesApplied:false},null,2));
      return;
    }
    // A failed SQL transaction rolls back itself. The private copy permits
    // a separate, verified operator rollback even after a successful stage.
    const backup = createPersonalStateBackup(snapshot);
    // Abort if the three live JSON sources changed while backup was written.
    if (personalStateSnapshotDigest(readJsonSnapshot()) !== backup.sha256)
      throw new Error('JSON changed during backup; pause writers before PostgreSQL staging');
    const count=await stagePersonalStateToPostgres(connection,snapshot,readPersonalStateSchema());
    // An unpaused live writer can race *during* the database transaction.
    // Detect it even after COMMIT and fail closed; JSON stays authoritative.
    if (personalStateSnapshotDigest(readJsonSnapshot()) !== backup.sha256)
      throw new Error('JSON changed while staging to PostgreSQL; refuse readiness and restart from a quiesced snapshot');
    const checked=await verifyPersonalStateStaging(connection,snapshot);
    if (!checked.consistent)
      throw new Error('PostgreSQL staging committed but post-commit verification failed; JSON remains authoritative');
    console.log(JSON.stringify({mode:'staged-to-postgresql',...count,
      verifiedAfterCommit:true,
      backupFile:backup.file,
      jsonStillAuthoritative:true,liveCutover:false},null,2));
  } finally { connection.release(); await identityPool().end(); }
}
main().catch(error=>{console.error('[Personal state migration]',error.message);process.exitCode=1;});
