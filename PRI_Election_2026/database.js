const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { masterGramPanchayats, masterPsWards, priParties } = require('./candidates_pri_master');

const dbPath = path.join(__dirname, 'pri_election.db');
const db = new sqlite3.Database(dbPath);

function initDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // 1. ग्राम पंचायत तालिका
            db.run(`CREATE TABLE IF NOT EXISTS gram_panchayats (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                name_en TEXT,
                ps_ward INTEGER,
                total_electors INTEGER DEFAULT 0,
                total_booths INTEGER DEFAULT 1,
                sarpanch_reservation TEXT
            )`);

            // 2. पंचायत समिति वार्ड तालिका
            db.run(`CREATE TABLE IF NOT EXISTS ps_wards (
                ward INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                total_electors INTEGER DEFAULT 0,
                reservation TEXT
            )`);

            // 3. मतदान केंद्र (बूथ) तालिका
            db.run(`CREATE TABLE IF NOT EXISTS booths (
                id INTEGER PRIMARY KEY,
                gp_id INTEGER,
                ps_ward INTEGER,
                name TEXT NOT NULL,
                location TEXT,
                electors INTEGER DEFAULT 0,
                FOREIGN KEY (gp_id) REFERENCES gram_panchayats(id)
            )`);

            // 4. प्रत्याशी तालिका (सरपंच, PS सदस्य, ZP सदस्य)
            db.run(`CREATE TABLE IF NOT EXISTS candidates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_type TEXT NOT NULL, -- 'Sarpanch', 'PS_Member', 'ZP_Member'
                target_id INTEGER NOT NULL, -- gp_id (सरपंच) or ps_ward (PS सदस्य)
                candidate_no INTEGER,
                name TEXT NOT NULL,
                party TEXT DEFAULT 'निर्दलीय',
                symbol TEXT,
                gender TEXT DEFAULT 'M'
            )`);

            // 5. मतदान सांख्यिकी तालिका (Hourly Polling)
            db.run(`CREATE TABLE IF NOT EXISTS polling_stats (
                booth_id INTEGER PRIMARY KEY,
                mock_done TEXT DEFAULT 'Yes',
                started TEXT DEFAULT 'Yes',
                v10 TEXT DEFAULT '',
                v13 TEXT DEFAULT '',
                v15 TEXT DEFAULT '',
                v17 TEXT DEFAULT '',
                v_queue INTEGER DEFAULT 0,
                v_final TEXT DEFAULT '',
                remark TEXT DEFAULT 'शांतिपूर्ण',
                updated_at TEXT,
                FOREIGN KEY (booth_id) REFERENCES booths(id)
            )`);

            // 6. सरपंच मतगणना परिणाम तालिका
            db.run(`CREATE TABLE IF NOT EXISTS sarpanch_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                gp_id INTEGER NOT NULL,
                candidate_id INTEGER NOT NULL,
                evm_votes INTEGER DEFAULT 0,
                postal_votes INTEGER DEFAULT 0,
                total_votes INTEGER DEFAULT 0,
                is_winner INTEGER DEFAULT 0,
                margin INTEGER DEFAULT 0,
                FOREIGN KEY (gp_id) REFERENCES gram_panchayats(id),
                FOREIGN KEY (candidate_id) REFERENCES candidates(id)
            )`);

            // 7. उपयोगकर्ता (RO, सेक्टर मजिस्ट्रेट, ऑपरेटर)
            db.run(`CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password TEXT NOT NULL,
                role TEXT NOT NULL, -- 'ro', 'bdo', 'operator_gp', 'operator_ps'
                name TEXT NOT NULL,
                assigned_id INTEGER -- gp_id or ps_ward
            )`);

            // 8. सिस्टम सेटिंग्स
            db.run(`CREATE TABLE IF NOT EXISTS system_config (
                key TEXT PRIMARY KEY,
                value TEXT
            )`);

            // डिफ़ॉल्ट यूज़र्स सीडिंग
            const defaultUsers = [
                { u: "ro_pri", p: "ROpri@2026", r: "ro", n: "रिटर्निंग ऑफिसर (SDM / BDO)" },
                { u: "op_purada", p: "Purada@2026", r: "operator_gp", n: "ऑपरेटर ग्राम पंचायत पुराड़ा", id: 1 },
                { u: "op_bankli", p: "Bankli@2026", r: "operator_gp", n: "ऑपरेटर ग्राम पंचायत बांकली", id: 2 },
                { u: "op_balwana", p: "Balwana@2026", r: "operator_gp", n: "ऑपरेटर ग्राम पंचायत बलवाना", id: 3 }
            ];

            const userStmt = db.prepare(`INSERT OR REPLACE INTO users (username, password, role, name, assigned_id) VALUES (?, ?, ?, ?, ?)`);
            defaultUsers.forEach(u => userStmt.run(u.u, u.p, u.r, u.n, u.id || 0));
            userStmt.finalize();

            // मास्टर ग्राम पंचायतें सीड करें
            db.get(`SELECT COUNT(*) as count FROM gram_panchayats`, (err, row) => {
                if (err) return reject(err);
                if (row.count === 0) {
                    const gpStmt = db.prepare(`INSERT INTO gram_panchayats (id, name, name_en, ps_ward, total_electors, total_booths, sarpanch_reservation) VALUES (?, ?, ?, ?, ?, ?, ?)`);
                    masterGramPanchayats.forEach(gp => {
                        gpStmt.run(gp.id, gp.name, gp.name_en, gp.ps_ward, gp.total_electors, gp.total_booths, gp.sarpanch_reservation);
                    });
                    gpStmt.finalize();

                    // PS Wards सीड करें
                    const psStmt = db.prepare(`INSERT INTO ps_wards (ward, name, total_electors, reservation) VALUES (?, ?, ?, ?)`);
                    masterPsWards.forEach(ps => {
                        psStmt.run(ps.ward, ps.name, ps.total_electors, ps.reservation);
                    });
                    psStmt.finalize();

                    console.log("✅ [PRI Database] ग्राम पंचायतें, PS वार्ड और डिफ़ॉल्ट यूज़र्स सफलतापूर्वक सीड हो गए!");
                }
                resolve();
            });
        });
    });
}

module.exports = {
    db,
    initDatabase
};
