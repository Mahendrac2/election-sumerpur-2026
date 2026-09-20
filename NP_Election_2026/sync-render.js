const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const RENDER_BASE_URL = process.env.RENDER_URL || 'https://election-sumerpur2026.onrender.com';
const SYNC_KEY = 'SUMERPUR_SECURE_SYNC_2026';
const DB_PATH = path.join(__dirname, 'election_sumerpur.db');
const RESULTS_PATH = path.join(__dirname, 'results_store.json');
const RESULTS_SEED_PATH = path.join(__dirname, 'live_results_seed.json');
const BACKUP_DIR = path.join(__dirname, 'backups');

if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

console.log("\n========================================================================");
console.log(" 🏛️  सुमेरपुर चुनाव 2026 — 2-Way Real-Time Cloud Sync Engine");
console.log("     [मतदान + मतगणना सम्पूर्ण रीयल-टाइम क्लाउड सिंक एवं ऑटो-हील]");
console.log("========================================================================");
console.log(` 🌐  क्लाउड सर्वर: ${RENDER_BASE_URL}`);
console.log(` 💾  लोकल डेटाबेस: ${DB_PATH}`);
console.log(` 📊  मतगणना स्टोर: ${RESULTS_PATH}`);
console.log(` 📁  ऑटो-बैकअप डायरेक्टरी: ${BACKUP_DIR}`);
console.log("========================================================================\n");

// -------------------------------------------------------------
// 🗳️ 1. POLLING / MATDAN SYNC HELPERS
// -------------------------------------------------------------
function getLocalStats() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH);
        db.all('SELECT * FROM polling_stats ORDER BY booth_id ASC', [], (err, rows) => {
            db.close();
            if (err) return reject(err);
            resolve(rows || []);
        });
    });
}

function updateLocalStats(cloudBooths) {
    return new Promise((resolve, reject) => {
        if (!cloudBooths || cloudBooths.length === 0) return resolve(0);
        const db = new sqlite3.Database(DB_PATH);
        db.serialize(() => {
            const stmt = db.prepare(`
                UPDATE polling_stats 
                SET mock_done = ?, started = ?, v10 = ?, v13 = ?, v15 = ?, v18 = ?, v_queue = ?, v_final = ?, remark = ?, updated_at = ?, updated_by = ?
                WHERE booth_id = ?
            `);
            let count = 0;
            cloudBooths.forEach(b => {
                stmt.run(
                    b.mock_done || 'No',
                    b.started || 'No',
                    b.v10 || '',
                    b.v13 || '',
                    b.v15 || '',
                    b.v18 || '',
                    parseInt(b.v_queue) || 0,
                    b.v_final || '',
                    b.remark || 'शांतिपूर्ण',
                    b.updated_at || new Date().toISOString(),
                    b.updated_by || 'Cloud Sync',
                    b.id || b.booth_id
                );
                count++;
            });
            stmt.finalize(() => {
                db.close();
                resolve(count);
            });
        });
    });
}

async function pushLocalToCloud() {
    console.log("📤 [Polling Push] लोकल मतदान डेटाबेस को Render क्लाउड पर अपलोड किया जा रहा है...");
    try {
        const localRows = await getLocalStats();
        const res = await fetch(`${RENDER_BASE_URL}/api/admin/restore-snapshot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                syncKey: SYNC_KEY,
                snapshot: { polling_stats: localRows }
            })
        });
        const data = await res.json();
        if (data.success) {
            console.log(`✅ [Polling Push Success] Render पर सफलतापूर्वक ${data.restoredBooths} बूथों का डेटा रीस्टोर कर दिया गया!`);
        } else {
            console.error(`❌ [Polling Push Failed] ${data.message}`);
        }
    } catch (e) {
        console.error(`❌ [Polling Push Error]`, e.message);
    }
}

// -------------------------------------------------------------
// 🏆 2. COUNTING / MATGANA (RESULTS) SYNC HELPERS
// -------------------------------------------------------------
function getLocalResults() {
    try {
        if (fs.existsSync(RESULTS_PATH)) {
            return JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
        }
        if (fs.existsSync(RESULTS_SEED_PATH)) {
            return JSON.parse(fs.readFileSync(RESULTS_SEED_PATH, 'utf8'));
        }
    } catch(e) {
        console.error("Error reading local results:", e.message);
    }
    return null;
}

function saveLocalResults(cloudResults) {
    try {
        if (fs.existsSync(RESULTS_PATH)) {
            fs.copyFileSync(RESULTS_PATH, RESULTS_PATH + '.bak');
        }
        fs.writeFileSync(RESULTS_PATH, JSON.stringify(cloudResults, null, 2), 'utf8');

        // If results contain counted votes, safeguard in seed and dated backup
        const counted = cloudResults.summary ? (cloudResults.summary.totalCountedVotes || 0) : 0;
        const declared = cloudResults.declared_count || (cloudResults.summary ? cloudResults.summary.declaredWards : 0) || 0;
        if (counted > 0 || declared > 1) {
            fs.writeFileSync(RESULTS_SEED_PATH, JSON.stringify(cloudResults, null, 2), 'utf8');
            fs.writeFileSync(path.join(BACKUP_DIR, 'results_backup_latest.json'), JSON.stringify(cloudResults, null, 2), 'utf8');
        }
    } catch(e) {
        console.error("Error saving local results:", e.message);
    }
}

async function pushLocalResultsToCloud() {
    console.log("📤 [Results Push] लोकल मतगणना डेटाबेस को Render क्लाउड पर अपलोड किया जा रहा है...");
    try {
        const localStore = getLocalResults();
        if (!localStore || !localStore.wards) {
            console.log("⚠️ [Results Push] कोई लोकल रिजल्ट डेटा उपलब्ध नहीं है।");
            return;
        }
        const res = await fetch(`${RENDER_BASE_URL}/api/admin/restore-results`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                syncKey: SYNC_KEY,
                resultsStore: localStore
            })
        });
        if (!res.ok) {
            console.error(`⚠️ [Results Push] Render सर्वर स्टेटस: ${res.status} (कृपया सुनिश्चित करें कि नया कोड Render पर डिप्लॉय हो चुका है)`);
            return;
        }
        const data = await res.json();
        if (data.success) {
            console.log(`✅ [Results Push Success] Render पर मतगणना परिणाम सफलतापूर्वक रीस्टोर कर दिए गए! (गिने गए मत: ${localStore.summary ? localStore.summary.totalCountedVotes : 'N/A'})`);
        } else {
            console.error(`❌ [Results Push Failed] ${data.message}`);
        }
    } catch(e) {
        console.error(`❌ [Results Push Error]`, e.message);
    }
}

// -------------------------------------------------------------
// 🔄 3. MAIN 2-WAY SYNC CYCLE (POLLING + COUNTING)
// -------------------------------------------------------------
async function performSyncCycle() {
    const nowStr = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });

    // --- A. POLLING (MATDAN) SYNC ---
    try {
        const res = await fetch(`${RENDER_BASE_URL}/api/data`);
        if (!res.ok) {
            console.log(`⚠️ [Sync Warning] Render सर्वर स्टेटस: ${res.status} (जागने में थोड़ा समय लग सकता है)`);
            return;
        }
        const data = await res.json();
        if (data.success && data.booths) {
            const cloudBooths = data.booths;
            const cloudVotes = data.kpi ? data.kpi.totalLatestVotes : 0;
            const localRows = await getLocalStats();

            let localVotes = 0;
            localRows.forEach(r => {
                const v = parseInt(r.v_final) || parseInt(r.v18) || parseInt(r.v15) || parseInt(r.v13) || parseInt(r.v10) || 0;
                localVotes += v;
            });

            // Auto-heal polling if cloud restarted
            if (cloudVotes === 0 && localVotes > 0) {
                console.log(`\n🚨 [ALERT] Render का सर्वर रीस्टार्ट होने के कारण मतदान 0 दिख रहा है!`);
                console.log(`⚡ [AUTO-HEAL MATDAN] आपके PC का डेटाबेस (${localVotes} वोट) Render पर रीस्टोर किया जा रहा है...`);
                await pushLocalToCloud();
            } else if (cloudVotes >= localVotes) {
                await updateLocalStats(cloudBooths);
                const backupPayload = {
                    timestamp: new Date().toISOString(),
                    totalElectors: data.kpi ? data.kpi.totalElectors : 30598,
                    totalVotes: cloudVotes,
                    booths: cloudBooths
                };
                fs.writeFileSync(path.join(BACKUP_DIR, 'backup_latest.json'), JSON.stringify(backupPayload, null, 2));
            } else if (localVotes > cloudVotes) {
                console.log(`⚡ [Auto-Sync Matdan] लोकल PC में अधिक डेटा है (${localVotes} vs ${cloudVotes}), क्लाउड अपडेट किया जा रहा है...`);
                await pushLocalToCloud();
            }
        }
    } catch (err) {
        console.log(`⚠️ [Matdan Sync Error] ${err.message}`);
    }

    // --- B. COUNTING (MATGANA / RESULTS) SYNC ---
    try {
        const resResults = await fetch(`${RENDER_BASE_URL}/api/results/data`);
        if (resResults.ok) {
            const cloudResults = await resResults.json();
            if (cloudResults && cloudResults.wards) {
                const cloudCounted = cloudResults.summary ? (cloudResults.summary.totalCountedVotes || 0) : (cloudResults.total_counted_votes || 0);
                const cloudDeclared = cloudResults.declared_count || (cloudResults.summary ? cloudResults.summary.declaredWards : 0) || 0;

                const localResults = getLocalResults();
                const localCounted = localResults && localResults.summary ? (localResults.summary.totalCountedVotes || 0) : (localResults ? localResults.total_counted_votes || 0 : 0);
                const localDeclared = localResults ? (localResults.declared_count || (localResults.summary ? localResults.summary.declaredWards : 0) || 0) : 0;

                // Auto-heal counting if cloud restarted and went to 0
                if (cloudCounted === 0 && cloudDeclared <= 1 && (localCounted > 0 || localDeclared > 1)) {
                    console.log(`\n🚨 [ALERT] Render रीस्टार्ट होने से मतगणना परिणाम खाली (0 मत) दिख रहे हैं!`);
                    console.log(`⚡ [AUTO-HEAL MATGANA] आपके PC का रिजल्ट डेटाबेस (${localCounted} मत, ${localDeclared} घोषित वार्ड) Render पर रीस्टोर किया जा रहा है...`);
                    await pushLocalResultsToCloud();
                } else if (cloudCounted > localCounted || (cloudCounted === localCounted && cloudDeclared > localDeclared)) {
                    saveLocalResults(cloudResults);
                    console.log(`🟢 [Counting Sync OK] ${nowStr} — Render से मतगणना सिंक: ${cloudCounted} गिने गए मत, ${cloudDeclared} वार्ड घोषित (लोकल PC पर सुरक्षित)`);
                } else if (localCounted > cloudCounted || (localCounted === cloudCounted && localDeclared > cloudDeclared)) {
                    console.log(`⚡ [Auto-Sync Matgana] लोकल PC में अधिक मतगणना डेटा है (${localCounted} vs ${cloudCounted}), क्लाउड पर अपडेट किया जा रहा है...`);
                    await pushLocalResultsToCloud();
                }
            }
        }
    } catch(err) {
        console.log(`⚠️ [Matgana Sync Error] ${err.message}`);
    }
}

// -------------------------------------------------------------
// 🚀 4. RUNNER
// -------------------------------------------------------------
const arg = process.argv[2];
if (arg === '--push') {
    Promise.all([pushLocalToCloud(), pushLocalResultsToCloud()]).then(() => {
        console.log("🏁 सभी मतदान और मतगणना डेटा क्लाउड पर पुश हो गए हैं।");
        process.exit(0);
    });
} else {
    // Initial sync
    performSyncCycle();
    // Recurring sync every 15 seconds
    setInterval(performSyncCycle, 15000);
    console.log("⏱️  निरंतर रीयल-टाइम 2-Way ऑटो-सिंक सक्रिय (Active every 15s). बंद करने के लिए Ctrl+C दबाएं।\n");
}
