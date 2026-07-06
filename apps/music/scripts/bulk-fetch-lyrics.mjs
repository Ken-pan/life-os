/**
 * Batch-fetch lyrics for cloud tracks missing lyrics, write to music.music_track_meta.
 *
 * Usage:
 *   node scripts/bulk-fetch-lyrics.mjs <userId>
 *   node scripts/bulk-fetch-lyrics.mjs <userId> --limit 50
 *
 * Requires: supabase login (access token in keychain) or SUPABASE_ACCESS_TOKEN.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fetchRemoteLyrics } from '../server/lyricsFetch.mjs';

const userId = process.argv[2];
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : 0;

if (!userId) {
  console.error('Usage: node scripts/bulk-fetch-lyrics.mjs <userId> [--limit N]');
  process.exit(1);
}

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const sqlScript = `${repoRoot}/scripts/supabase-sql.sh`;

function sqlQuote(v) {
  return `'${String(v ?? '').replace(/'/g, "''")}'`;
}

/** @param {string} sql */
function runSql(sql) {
  const res = spawnSync('bash', [sqlScript, sql], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  if (res.status !== 0) {
    throw new Error((res.stderr || res.stdout || 'SQL failed').slice(0, 800));
  }
  const out = (res.stdout || '').trim();
  if (!out) return [];
  try {
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new Error(`Unexpected SQL response: ${out.slice(0, 300)}`);
  }
}

const query = `
select track_id, title, artist, duration
from music.music_track_meta
where user_id = ${sqlQuote(userId)}
  and coalesce(trim(lyrics), '') = ''
  and coalesce(trim(title), '') <> ''
  and coalesce(trim(artist), '') <> ''
order by added_at desc
${limit > 0 ? `limit ${Math.floor(limit)}` : ''};
`;

console.log('Querying tracks without lyrics...');
const tracks = runSql(query);
console.log(`Found ${tracks.length} tracks to process.`);

let repaired = 0;
let failed = 0;

for (let i = 0; i < tracks.length; i++) {
  const row = tracks[i];
  const title = String(row.title || '').trim();
  const artist = String(row.artist || '').trim();
  const duration = Number(row.duration) || undefined;
  const trackId = String(row.track_id || '').trim();

  if (!trackId || !title || !artist) continue;

  process.stdout.write(`[${i + 1}/${tracks.length}] ${title} — ${artist} ... `);

  try {
    const fetched = await fetchRemoteLyrics(title, artist, duration);
    if (!fetched?.text) {
      console.log('miss');
      failed += 1;
    } else {
      const updateSql = `
update music.music_track_meta
set lyrics = ${sqlQuote(fetched.text)}, updated_at = now()
where user_id = ${sqlQuote(userId)} and track_id = ${sqlQuote(trackId)};
`;
      runSql(updateSql);
      console.log(`ok (${fetched.source})`);
      repaired += 1;
    }
  } catch (err) {
    console.log(`error: ${err.message}`);
    failed += 1;
  }

  await new Promise((r) => setTimeout(r, 250));
}

console.log(`Done. fetched=${repaired} missed=${failed} total=${tracks.length}`);
