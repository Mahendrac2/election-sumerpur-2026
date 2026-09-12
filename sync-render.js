const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const RENDER_BASE_URL = process.env.RENDER_URL || 'https://election-sumerpur2026.onrender.com';
const SYNC_KEY = 'SUMERPUR_SECURE_SYNC_2026';
const DB_PATH = path.join(__dirname, 'election_sumerpur.db');
const BACKUP_DIR = path.join(__dirname, 'backups');

if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

console.log("\n========================================================================");
console.log(" 🏛️  सुमेरपुर चुनाव 2026 — 2-Way Real-Time Cloud Sync Engine");
console.log("========================================================================");
console.log(` 🌐  क्लाउड सर्वर: ${RENDER_BASE_URL}`);
console.log(` 💾  लोकल डेटाबेस: ${DB_PATH}`);
console.log(` 📁  ऑटो-बैकअप डायरेक्टरी: ${BACKUP_DIR}`);
console.log("========================================================================\n");

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
    console.log("📤 [Push] लोकल डेटाबेस को Render क्लाउड पर अपलोड किया जा रहा है...");
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
            console.log(`✅ [Push Success] Render पर सफलतापूर्वक ${data.restoredBooths} बूथों का डेटा रीस्टोर कर दिया गया!`);
        } else {
            console.error(`❌ [Push Failed] ${data.message}`);
        }
    } catch (e) {
        console.error(`❌ [Push Error]`, e.message);
    }
}

async function performSyncCycle() {
    try {
        const res = await fetch(`${RENDER_BASE_URL}/api/data`);
        if (!res.ok) {
            console.log(`⚠️ [Sync Warning] Render सर्वर स्टेटस: ${res.status} (जागने में थोड़ा समय लग सकता है)`);
            return;
        }
        const data = await res.json();
        if (!data.success || !data.booths) return;

        const cloudBooths = data.booths;
        const cloudVotes = data.kpi ? data.kpi.totalLatestVotes : 0;
        const localRows = await getLocalStats();

        // Calculate total local votes
        let localVotes = 0;
        localRows.forEach(r => {
            const v = parseInt(r.v_final) || parseInt(r.v18) || parseInt(r.v15) || parseInt(r.v13) || parseInt(r.v10) || 0;
            localVotes += v;
        });

        // AUTO-HEALING: If Render has 0 votes but local PC has votes, Render must have restarted! Auto-restore!
        if (cloudVotes === 0 && localVotes > 0) {
            console.log(`\n🚨 [ALERT] Render का सर्वर रीस्टार्ट होने के कारण 0 वोट दिख रहा है!`);
            console.log(`⚡ [AUTO-HEAL] आपके PC का डेटाबेस (${localVotes} वोट) Render पर ऑटोमैटिकली रीस्टोर किया जा रहा है...`);
            await pushLocalToCloud();
            return;
        }

        // If Cloud has votes or changes, save locally
        if (cloudVotes >= localVotes) {
            await updateLocalStats(cloudBooths);
            
            // Save JSON backup
            const backupPayload = {
                timestamp: new Date().toISOString(),
                totalElectors: data.kpi ? data.kpi.totalElectors : 30598,
                totalVotes: cloudVotes,
                booths: cloudBooths
            };
            fs.writeFileSync(path.join(BACKUP_DIR, 'backup_latest.json'), JSON.stringify(backupPayload, null, 2));
            
            const now = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
            console.log(`🟢 [Sync OK] ${now} — Render से सिंक: कुल वोट ${cloudVotes} (लोकल PC और backups/ में सुरक्षित)`);
        } else if (localVotes > cloudVotes) {
            console.log(`⚡ [Auto-Sync] लोकल PC में अधिक डेटा है (${localVotes} vs ${cloudVotes}), क्लाउड अपडेट किया जा रहा है...`);
            await pushLocalToCloud();
        }
    } catch (err) {
        console.log(`⚠️ [Sync Error] ${err.message}`);
    }
}

// Handle Command-line args
const arg = process.argv[2];
if (arg === '--push') {
    pushLocalToCloud().then(() => process.exit(0));
} else {
    // Initial sync
    performSyncCycle();
    // Recurring sync every 15 seconds
    setInterval(performSyncCycle, 15000);
    console.log("⏱️  निरंतर रीयल-टाइम ऑटो-सिंक सक्रिय (Active every 15s). बंद करने के लिए Ctrl+C दबाएं।\n");
}
