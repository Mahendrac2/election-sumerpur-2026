const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'election_sumerpur.db');
const db = new sqlite3.Database(dbPath);

// Official 6 Zones Master Metadata
const zonesMaster = {
    1: {
        id: 1,
        name: "जोन 1",
        area: "श्री मोहनलाल सियोल, तहसीलदार सुमेरपुर (मो. 8239785559)",
        zonal: "श्री रवि कुमार दैवतवाल, पशु चिकित्सा अधिकारी, बिसलपुर (मो. 7728897837)",
        hq: "रा.बा.उ.प्रा.वि., विवेकानन्द नगर सुमेरपुर",
        booths: [1, 2, 3, 4, 5, 7, 8, 9]
    },
    2: {
        id: 2,
        name: "जोन 2",
        area: "श्री मोहनलाल सियोल, तहसीलदार सुमेरपुर (मो. 8239785559)",
        zonal: "डॉ. ललित कुमार, पशु चिकित्सा अधिकारी, कोलीवाड़ा (मो. 9785349483)",
        hq: "कार्यालय मुख्य ब्लॉक शिक्षा अधिकारी, सुमेरपुर",
        booths: [6, 12, 13, 14, 15, 16, 17]
    },
    3: {
        id: 3,
        name: "जोन 3",
        area: "श्री अचलाराम मेघवाल, नायब तहसीलदार, नाणा (मो. 9799836861)",
        zonal: "श्री राजभवरायत, अधिशाषी अभियंता, जवाई नहर सुमेरपुर (मो. 8209230343)",
        hq: "रा.बा.उ.मा.वि. सुमेरपुर",
        booths: [18, 19, 20, 21, 22]
    },
    4: {
        id: 4,
        name: "जोन 4",
        area: "श्री अचलाराम मेघवाल, नायब तहसीलदार, नाणा (मो. 9799836861)",
        zonal: "श्री किशोर परमार, अधिशाषी अभियंता, जवाई नहर खण्ड, भैरू चौक (मो. 9413079474)",
        hq: "कार्यालय अधिशाषी अभियंता, जवाई नहर, भैरू चौक",
        booths: [10, 11, 24, 25, 26, 27, 28]
    },
    5: {
        id: 5,
        name: "जोन 5",
        area: "श्री मोहनलाल सियोल, तहसीलदार सुमेरपुर (मो. 8239785559)",
        zonal: "श्री राजीव चारण, प्रधानाचार्य, श्री हस्तीमलजी सि. रा.उ.मा.वि. पोमावा (मो. 9414341848)",
        hq: "रा.उ.प्रा.वि. नं. 1, वासुपूज्य कॉलोनी सुमेरपुर",
        booths: [23, 29, 30, 31, 32]
    },
    6: {
        id: 6,
        name: "जोन 6",
        area: "श्री मोहनलाल सियोल, तहसीलदार सुमेरपुर (मो. 8239785559)",
        zonal: "श्री शैतान सिंह सांदू, प्रधानाचार्य, स्वामी विवेकानन्द मॉडल स्कूल (मो. 9929956973)",
        hq: "रा.उ.प्रा.वि. जाखानगर सुमेरपुर",
        booths: [33, 34, 35, 36]
    }
};

// 36 Booths Master Data with Zone, Ward, Elector, and Official in charge
const masterBooths = [
  { b: 1,  z: 1, w: 1,  name: "रा.उ.प्रा.वि., संजय नगर (भाग 1)", el: 851, op: "OP1", pName: "श्री रामस्वरूप छाबा (अध्यापक)", pMob: "9680355685" },
  { b: 2,  z: 1, w: 1,  name: "रा.व.उ. संस्कृत वि., संजय नगर (भाग 2)", el: 960, op: "OP1", pName: "श्री गणेश राम (सहा. प्रशा. अधि.)", pMob: "8560055330" },
  { b: 3,  z: 1, w: 2,  name: "रा.प्रा.वि., विवेकानन्द नगर", el: 595, op: "OP1", pName: "श्री अंकित चतुर्वेदी (अध्यापक)", pMob: "7891826768" },
  { b: 4,  z: 1, w: 3,  name: "महाराणा प्रताप गाडोलिया लौहार सभा भवन", el: 861, op: "OP1", pName: "श्री नारायण लाल लखारा (वरिष्ठ सहायक)", pMob: "7742526889" },
  { b: 5,  z: 1, w: 4,  name: "सामुदायिक भवन, तहसील के पीछे", el: 369, op: "OP1", pName: "श्री दिलीप सिंह (प्रयोगशाला सहायक)", pMob: "9680003880" },
  { b: 6,  z: 2, w: 5,  name: "पीएम श्री रा.उ.मा.वि. (दाया भाग)", el: 893, op: "OP2", pName: "श्री फूजाराम (पर्यवेक्षक)", pMob: "7073956394" },
  { b: 7,  z: 1, w: 6,  name: "डॉ. अम्बेडकर सामुदायिक भवन, हाथी गडा", el: 1134, op: "OP1", pName: "श्री महेन्द्र सिंह राठौड़ (कनिष्ठ सहायक)", pMob: "9983114557" },
  { b: 8,  z: 1, w: 7,  name: "रा.उ.प्रा.वि. नं.3 नया भवन उषापुरी गेट", el: 972, op: "OP1", pName: "श्री करणसिंह देवड़ा (वरिष्ठ सहायक)", pMob: "7742689419" },
  { b: 9,  z: 1, w: 8,  name: "रैन बसेरा भवन बाईपास रोड (बायां भाग)", el: 1032, op: "OP1", pName: "श्री हिमांशु (कनिष्ठ लिपिक)", pMob: "9971893668" },
  { b: 10, z: 4, w: 9,  name: "रैन बसेरा भवन बाईपास रोड (दायां भाग)", el: 780, op: "OP4", pName: "श्री अशोक कुमार माली (कनिष्ठ लिपिक)", pMob: "8441067097" },
  { b: 11, z: 4, w: 10, name: "रा.उ.प्रा.वि. नं.2 (बांया भाग)", el: 805, op: "OP4", pName: "श्री योगेश गर्ग (वरिष्ठ सहायक)", pMob: "7073373171" },
  { b: 12, z: 2, w: 11, name: "रा.उ.प्रा.वि. नं.2 (दांया भाग)", el: 860, op: "OP2", pName: "श्री भरत कुमार (वरिष्ठ प्रबोधक)", pMob: "7791893959" },
  { b: 13, z: 2, w: 12, name: "कार्यालय CBEO जवाई बांध रोड़ (बायां)", el: 820, op: "OP2", pName: "श्री शंभु कुमार (कनिष्ठ लिपिक)", pMob: "9983946132" },
  { b: 14, z: 2, w: 13, name: "कार्यालय CBEO जवाई बांध रोड़ (दायां)", el: 966, op: "OP2", pName: "श्री भीखाराम (पर्यवेक्षक)", pMob: "9079852688" },
  { b: 15, z: 2, w: 14, name: "रा.बा.उ.मा.वि., कमरा नं. 2", el: 807, op: "OP2", pName: "श्री नरेश परमार (अध्यापक)", pMob: "8107286454" },
  { b: 16, z: 2, w: 15, name: "रा.बा.उ.मा.वि., कमरा नं. 3", el: 939, op: "OP2", pName: "श्री महेश पालीवाल (वरिष्ठ लिपिक)", pMob: "7610085209" },
  { b: 17, z: 2, w: 16, name: "कार्यालय गृह एवं नगरीय विकास कर", el: 660, op: "OP2", pName: "श्री रिडमल राम (वरिष्ठ प्रयोगशाला सहा.)", pMob: "9982493610" },
  { b: 18, z: 3, w: 17, name: "रा.बा.उ.मा.वि., कमरा नं. 9", el: 1039, op: "OP3", pName: "श्री ईमरान मोहम्मद (अध्यापक)", pMob: "9602959723" },
  { b: 19, z: 3, w: 18, name: "सरदार वल्लभ भाई पटेल विवाह स्थल", el: 912, op: "OP3", pName: "श्री सुरेश कुमार (अध्यापक)", pMob: "9982935583" },
  { b: 20, z: 3, w: 19, name: "कृषि उपज मण्डी श्रमिक विश्राम गृह", el: 949, op: "OP3", pName: "श्री पुकाराम (वरिष्ठ सहायक)", pMob: "8619885001" },
  { b: 21, z: 3, w: 20, name: "रा.उ.प्रा.वि. नं.1 वासू पूज्य काॅलोनी (बांया)", el: 368, op: "OP3", pName: "श्री दिनेश कुमार बगठिया (वरिष्ठ सहा.)", pMob: "9929884975" },
  { b: 22, z: 3, w: 21, name: "रा.उ.प्रा.वि. नं.1 वासू पूज्य काॅलोनी (दांया)", el: 725, op: "OP3", pName: "श्री छोगाराम देवासी (अध्यापक)", pMob: "7742747519" },
  { b: 23, z: 5, w: 22, name: "कार्यालय अधिशाषी अभियंता जवाई नहर (बांया)", el: 818, op: "OP5", pName: "श्री हनुवन्तसिंह (कनिष्ठ लिपिक)", pMob: "8233193295" },
  { b: 24, z: 4, w: 23, name: "रा.बा.उ.मा.वि., कमरा नं. 11", el: 767, op: "OP4", pName: "श्री प्रधान बैरवा (अध्यापक)", pMob: "9602328272" },
  { b: 25, z: 4, w: 24, name: "सुमेरपुर क्रय-विक्रय सहकारी समिति", el: 834, op: "OP4", pName: "श्री मनीष कुमार (अध्यापक)", pMob: "8432470870" },
  { b: 26, z: 4, w: 25, name: "महावीर जीवावत वाचनालय", el: 766, op: "OP4", pName: "श्री धर्मेन्द्र सिंह (प्रयोगशाला सहायक)", pMob: "8619796516" },
  { b: 27, z: 4, w: 26, name: "कार्यालय अधिशाषी अभियंता जवाई नहर (दायां)", el: 833, op: "OP4", pName: "निर्विरोध निर्वाचित (वीणा देवड़ा - BJP)", pMob: "-", isNirvirodh: 1 },
  { b: 28, z: 4, w: 27, name: "लालबहादुर शास्त्री वाचनालय", el: 919, op: "OP4", pName: "श्री कृष्णपाल सिंह (कनिष्ठ लिपिक)", pMob: "9950565481" },
  { b: 29, z: 5, w: 28, name: "रा.उ.प्रा.वि. नं.1 वासू पूज्य काॅलोनी (मध्य)", el: 826, op: "OP5", pName: "श्री जोगाराम मीणा (वरिष्ठ सहायक)", pMob: "6377310993" },
  { b: 30, z: 5, w: 29, name: "डाॅ. श्यामा प्रसाद मुखर्जी सामुदायिक भवन", el: 977, op: "OP5", pName: "श्री मनीष कुमार (कनिष्ठ लिपिक)", pMob: "9772309165" },
  { b: 31, z: 5, w: 30, name: "सामुदायिक सभा भवन, बाणमाता मन्दिर", el: 622, op: "OP5", pName: "श्री मनीष सांखला (कनिष्ठ लिपिक)", pMob: "9358693913" },
  { b: 32, z: 5, w: 31, name: "रा.उ.प्रा.वि. नं.5 जूना जाखोडा (बाँया)", el: 712, op: "OP5", pName: "श्री अश्विन सिंह राव (कनिष्ठ लिपिक)", pMob: "9667161210" },
  { b: 33, z: 6, w: 32, name: "रा.उ.प्रा.वि. नं.5 जूना जाखोडा (दांया)", el: 935, op: "OP6", pName: "श्री देवेन्द्र सिंह (वरिष्ठ लिपिक)", pMob: "8094145551" },
  { b: 34, z: 6, w: 33, name: "रा.उ.प्रा.वि., जाखानगर दाया भाग", el: 1123, op: "OP6", pName: "श्री हस्तीमल (प्रयोगशाला सहायक)", pMob: "8442047725" },
  { b: 35, z: 6, w: 34, name: "रा.उ.प्रा.वि., जाखानगर बांया भाग", el: 1260, op: "OP6", pName: "श्री राहुल राज (प्रयोगशाला सहायक)", pMob: "8290269639" },
  { b: 36, z: 6, w: 35, name: "कार्यालय सहायक अभियंता जलदाय विभाग", el: 843, op: "OP6", pName: "श्री जितेन्द्र सिंह (सहा. प्रशा. अधि.)", pMob: "7726017808" }
];

const defaultUsers = [
    { 
        username: "ro_sumerpur",  
        pass: "ROsdm@2026", 
        role: "RO",  
        name: "रिटर्निंग ऑफिसर (उपखण्ड मजिस्ट्रेट)",
        designation: "उपखण्ड मजिस्ट्रेट एवं रिटर्निंग ऑफिसर, सुमेरपुर",
        mobile: ""
    }
];

function initDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Booths table
            db.run(`CREATE TABLE IF NOT EXISTS booths (
                id INTEGER PRIMARY KEY,
                zone INTEGER NOT NULL,
                ward INTEGER NOT NULL,
                name TEXT NOT NULL,
                electors INTEGER NOT NULL,
                operator_role TEXT NOT NULL,
                praganak_name TEXT,
                praganak_mob TEXT,
                is_nirvirodh INTEGER DEFAULT 0
            )`);

            // Polling stats table
            db.run(`CREATE TABLE IF NOT EXISTS polling_stats (
                booth_id INTEGER PRIMARY KEY,
                mock_done TEXT DEFAULT 'No',
                started TEXT DEFAULT 'No',
                v10 TEXT DEFAULT '',
                v13 TEXT DEFAULT '',
                v15 TEXT DEFAULT '',
                v18 TEXT DEFAULT '',
                v_queue INTEGER DEFAULT 0,
                v_final TEXT DEFAULT '',
                remark TEXT DEFAULT 'शांतिपूर्ण',
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_by TEXT DEFAULT 'System',
                FOREIGN KEY (booth_id) REFERENCES booths(id)
            )`);

            // Users table
            db.run(`CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password TEXT NOT NULL,
                role TEXT NOT NULL,
                name TEXT NOT NULL,
                mobile TEXT DEFAULT '',
                designation TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME
            )`);

            // Safe column additions for existing db
            db.run(`ALTER TABLE users ADD COLUMN mobile TEXT DEFAULT ''`, () => {});
            db.run(`ALTER TABLE users ADD COLUMN designation TEXT DEFAULT ''`, () => {});
            db.run(`ALTER TABLE users ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});
            db.run(`ALTER TABLE users ADD COLUMN last_login DATETIME`, () => {});

            // System config table
            db.run(`CREATE TABLE IF NOT EXISTS system_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )`);

            // Activity logs
            db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                username TEXT,
                action TEXT,
                booth_id INTEGER,
                details TEXT
            )`);

            // Seed initial configuration if not present
            db.run(`INSERT OR IGNORE INTO system_config (key, value) VALUES ('global_override', 'false')`);
            db.run(`INSERT OR IGNORE INTO system_config (key, value) VALUES ('simulated_time', '')`);
            db.run(`INSERT OR IGNORE INTO system_config (key, value) VALUES ('reset_locked', 'false')`);

            // Seed Users
            const userStmt = db.prepare(`INSERT OR REPLACE INTO users (username, password, role, name) VALUES (?, ?, ?, ?)`);
            defaultUsers.forEach(u => userStmt.run(u.username, u.pass, u.role, u.name));
            userStmt.finalize();

            // Seed Booths
            db.get(`SELECT COUNT(*) as count FROM booths`, (err, row) => {
                if (err) return reject(err);
                if (row.count === 0) {
                    const bStmt = db.prepare(`INSERT INTO booths (id, zone, ward, name, electors, operator_role, praganak_name, praganak_mob, is_nirvirodh) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                    const sStmt = db.prepare(`INSERT INTO polling_stats (booth_id, mock_done, started, v10, v13, v15, v18, v_queue, v_final, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

                    masterBooths.forEach(b => {
                        bStmt.run(b.b, b.z, b.w, b.name, b.el, b.op, b.pName, b.pMob, b.isNirvirodh ? 1 : 0);
                        if (b.isNirvirodh) {
                            sStmt.run(b.b, 'N/A', 'N/A', '0', '0', '0', '0', 0, '0', 'वार्ड 26 निर्विरोध निर्वाचित (No Election)');
                        } else {
                            sStmt.run(b.b, 'No', 'No', '', '', '', '', 0, '', 'शांतिपूर्ण');
                        }
                    });

                    bStmt.finalize();
                    sStmt.finalize();
                    console.log('✅ SQLite Database Seeded with 36 Booths and 6 Users!');
                }
                resolve();
            });
        });
    });
}

module.exports = {
    db,
    zonesMaster,
    initDatabase
};
