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

// 36 Booths Master Data with Ward, Part, Male, Female, TG and Total Electors
const masterBooths = [
  { b: 1,  z: 1, w: 1,  part: 1, name: "राजकीय उच्च प्राथमिक विद्यालय,संजय नगर सुमेरपुर", el: 851, male_el: 445, female_el: 406, tg_el: 0, op: "OP1", pName: "श्री रामस्वरूप छाबा (अध्यापक)", pMob: "9680355685" },
  { b: 2,  z: 1, w: 1,  part: 2, name: "राजकीय वरिष्ठ उपाध्याय संस्कृत विद्यालय, संजय नगर सुमेरपुर", el: 960, male_el: 501, female_el: 459, tg_el: 0, op: "OP1", pName: "श्री गणेश राम (सहा. प्रशा. अधि.)", pMob: "8560055330" },
  { b: 3,  z: 1, w: 2,  part: 1, name: "राजकीय प्राथमिक विद्यालय,विवेकानन्द नगर सुमेरपुर", el: 612, male_el: 302, female_el: 310, tg_el: 0, op: "OP1", pName: "श्री अंकित चतुर्वेदी (अध्यापक)", pMob: "7891826768" },
  { b: 4,  z: 1, w: 3,  part: 1, name: "महाराणा प्रताप गाडोलिया लौहार सभा भवन टेलिफोन एक्सचेंज के पास, ,सुमेरपुर", el: 829, male_el: 414, female_el: 415, tg_el: 0, op: "OP1", pName: "श्री नारायण लाल लखारा (वरिष्ठ सहायक)", pMob: "7742526889" },
  { b: 5,  z: 1, w: 4,  part: 1, name: "सामुदायिक भवन,तहसील के पीछे, संजय नगर, सुमेरपुर", el: 430, male_el: 229, female_el: 201, tg_el: 0, op: "OP1", pName: "श्री दिलीप सिंह (प्रयोगशाला सहायक)", pMob: "9680003880" },
  { b: 6,  z: 2, w: 5,  part: 1, name: "पीएम श्री राजकीय उच्च माध्यमिक विद्यालय (दाया भाग), सुमेरपुर", el: 902, male_el: 451, female_el: 451, tg_el: 0, op: "OP2", pName: "श्री फूजाराम (पर्यवेक्षक)", pMob: "7073956394" },
  { b: 7,  z: 1, w: 6,  part: 1, name: "डॉ. भीमराव अम्बेडकर सामुदायिक भवन,हाथी गडा,पानी टंकी के पास, सुमेरपुर", el: 1120, male_el: 562, female_el: 558, tg_el: 0, op: "OP1", pName: "श्री महेन्द्र सिंह राठौड़ (कनिष्ठ सहायक)", pMob: "9983114557" },
  { b: 8,  z: 1, w: 7,  part: 1, name: "राजकीय उच्च प्राथमिक विद्यालय नं.3, नया भवन उषापुरी गेट के अन्दर,सुमेरपुर", el: 976, male_el: 498, female_el: 478, tg_el: 0, op: "OP1", pName: "श्री करणसिंह देवड़ा (वरिष्ठ सहायक)", pMob: "7742689419" },
  { b: 9,  z: 1, w: 8,  part: 1, name: "आश्रय स्थल रैन बसेरा भवन बाईपास रोड, सुमेरपुर (बायां भाग)", el: 1071, male_el: 541, female_el: 530, tg_el: 0, op: "OP1", pName: "श्री हिमांशु (कनिष्ठ लिपिक)", pMob: "9971893668" },
  { b: 10, z: 4, w: 9,  part: 1, name: "आश्रय स्थल रैन बसेरा भवन बाईपास रोड, सुमेरपुर (दायां भाग)", el: 736, male_el: 371, female_el: 365, tg_el: 0, op: "OP4", pName: "श्री अशोक कुमार माली (कनिष्ठ लिपिक)", pMob: "8441067097" },
  { b: 11, z: 4, w: 10, part: 1, name: "राजकीय उच्च प्राथमिक विद्यालय नं.2,सुमेरपुर(बांया भाग)", el: 784, male_el: 390, female_el: 394, tg_el: 0, op: "OP4", pName: "श्री योगेश गर्ग (वरिष्ठ सहायक)", pMob: "7073373171" },
  { b: 12, z: 2, w: 11, part: 1, name: "राजकीय उच्च प्राथमिक विद्यालय नं.2,सुमेरपुर(दांया भाग)", el: 871, male_el: 446, female_el: 425, tg_el: 0, op: "OP2", pName: "श्री भरत कुमार (वरिष्ठ प्रबोधक)", pMob: "7791893959" },
  { b: 13, z: 2, w: 12, part: 1, name: "कार्यालय मुख्य ब्लॉक शिक्षा अधिकारी,जवाई बांध रोड ,सुमेरपुर (बायां भाग)", el: 822, male_el: 424, female_el: 398, tg_el: 0, op: "OP2", pName: "श्री शंभु कुमार (कनिष्ठ लिपिक)", pMob: "9983946132" },
  { b: 14, z: 2, w: 13, part: 1, name: "कार्यालय मुख्य ब्लॉक शिक्षा अधिकारी,जवाई बांध रोड ,सुमेरपुर (दायां भाग)", el: 965, male_el: 489, female_el: 476, tg_el: 0, op: "OP2", pName: "श्री भीखाराम (पर्यवेक्षक)", pMob: "9079852688" },
  { b: 15, z: 2, w: 14, part: 1, name: "राजकीय बालिका उच्च माध्यमिक विद्यालय,सुमेरपुर, कमरा नं. 2", el: 825, male_el: 413, female_el: 412, tg_el: 0, op: "OP2", pName: "श्री नरेश परमार (अध्यापक)", pMob: "8107286454" },
  { b: 16, z: 2, w: 15, part: 1, name: "राजकीय बालिका उच्च माध्यमिक विद्यालय,सुमेरपुर, कमरा नं. 3", el: 902, male_el: 444, female_el: 458, tg_el: 0, op: "OP2", pName: "श्री महेश पालीवाल (वरिष्ठ लिपिक)", pMob: "7610085209" },
  { b: 17, z: 2, w: 16, part: 1, name: "कार्यालय गृह एवं नगरीय विकास कर,नगरपालिका,सुमेरपुर", el: 653, male_el: 318, female_el: 335, tg_el: 0, op: "OP2", pName: "श्री रिडमल राम (वरिष्ठ प्रयोगशाला सहा.)", pMob: "9982493610" },
  { b: 18, z: 3, w: 17, part: 1, name: "राजकीय बालिका उच्च माध्यमिक विद्यालय,सुमेरपुर कमरा नं. 9", el: 1036, male_el: 530, female_el: 506, tg_el: 0, op: "OP3", pName: "श्री ईमरान मोहम्मद (अध्यापक)", pMob: "9602959723" },
  { b: 19, z: 3, w: 18, part: 1, name: "सरदार वल्लभ भाई पटेल विवाह स्थल,आदर्श काॅलोनी,सुमेरपुर", el: 920, male_el: 482, female_el: 438, tg_el: 0, op: "OP3", pName: "श्री सुरेश कुमार (अध्यापक)", pMob: "9982935583" },
  { b: 20, z: 3, w: 19, part: 1, name: "कृषि उपज मण्डी श्रमिक विश्राम गृह,सुमेरपुर", el: 944, male_el: 492, female_el: 452, tg_el: 0, op: "OP3", pName: "श्री पुकाराम (वरिष्ठ सहायक)", pMob: "8619885001" },
  { b: 21, z: 3, w: 20, part: 1, name: "राजकीय उच्च प्राथमिक विद्यालय नं.1,वासू पूज्य काॅलोनी,सुमेरपुर (बांया भाग)", el: 406, male_el: 203, female_el: 203, tg_el: 0, op: "OP3", pName: "श्री दिनेश कुमार बगठिया (वरिष्ठ सहा.)", pMob: "9929884975" },
  { b: 22, z: 3, w: 21, part: 1, name: "राजकीय उच्च प्राथमिक विद्यालय नं.1,वासू पूज्य काॅलोनी,सुमेरपुर(दांया भाग)", el: 717, male_el: 361, female_el: 356, tg_el: 0, op: "OP3", pName: "श्री छोगाराम देवासी (अध्यापक)", pMob: "7742747519" },
  { b: 23, z: 5, w: 22, part: 1, name: "कार्यालय अधिशाषी अभियंता,जवाई नहर खण्ड,भैरू चौक,सुमेरपुर(बांया भाग)", el: 835, male_el: 433, female_el: 402, tg_el: 0, op: "OP5", pName: "श्री हनुवन्तसिंह (कनिष्ठ लिपिक)", pMob: "8233193295" },
  { b: 24, z: 4, w: 23, part: 1, name: "राजकीय बालिका उच्च माध्यमिक विद्यालय,सुमेरपुर, कमरा नं. 11", el: 744, male_el: 388, female_el: 356, tg_el: 0, op: "OP4", pName: "श्री प्रधान बैरवा (अध्यापक)", pMob: "9602328272" },
  { b: 25, z: 4, w: 24, part: 1, name: "सुमेरपुर क्रय-विक्रय सहकारी समिति लि., नगरपालिका रोड,सुमेरपुर", el: 813, male_el: 409, female_el: 404, tg_el: 0, op: "OP4", pName: "श्री मनीष कुमार (अध्यापक)", pMob: "8432470870" },
  { b: 26, z: 4, w: 25, part: 1, name: "महावीर जीवावत वाचनालय, नगरपालिका रोड,सुमेरपुर", el: 776, male_el: 385, female_el: 391, tg_el: 0, op: "OP4", pName: "श्री धर्मेन्द्र सिंह (प्रयोगशाला सहायक)", pMob: "8619796516" },
  { b: 27, z: 4, w: 26, part: 1, name: "कार्यालय अधिशाषी अभियंता,जवाई नहर खण्ड,भैरू चौक,सुमेरपुर (दायां भाग)", el: 841, male_el: 429, female_el: 412, tg_el: 0, op: "OP4", pName: "निर्विरोध निर्वाचित (वीणा देवड़ा - BJP)", pMob: "-", isNirvirodh: 1 },
  { b: 28, z: 4, w: 27, part: 1, name: "लालबहादुर शास्त्री वाचनालय,भैरू चौक, सुमेरपुर", el: 906, male_el: 471, female_el: 435, tg_el: 0, op: "OP4", pName: "श्री कृष्णपाल सिंह (कनिष्ठ लिपिक)", pMob: "9950565481" },
  { b: 29, z: 5, w: 28, part: 1, name: "राजकीय उच्च प्राथमिक विद्यालय नं.1,वासू पूज्य काॅलोनी,सुमेरपुर(मध्य भाग)", el: 880, male_el: 464, female_el: 416, tg_el: 0, op: "OP5", pName: "श्री जोगाराम मीणा (वरिष्ठ सहायक)", pMob: "6377310993" },
  { b: 30, z: 5, w: 29, part: 1, name: "डाॅ. श्यामा प्रसाद मुखर्जी सामुदायिक भवन, शनि महाराज मन्दिर के सामने, नहर के पास,सुमेर", el: 951, male_el: 477, female_el: 474, tg_el: 0, op: "OP5", pName: "श्री मनीष कुमार (कनिष्ठ लिपिक)", pMob: "9772309165" },
  { b: 31, z: 5, w: 30, part: 1, name: "सामुदायिक सभा भवन, बाणमाता मन्दिर के पास, सुमेरपुर", el: 652, male_el: 347, female_el: 305, tg_el: 0, op: "OP5", pName: "श्री मनीष सांखला (कनिष्ठ लिपिक)", pMob: "9358693913" },
  { b: 32, z: 5, w: 31, part: 1, name: "राजकीय उच्च प्राथमिक विद्यालय नं.5,जूना जाखोडा रोड,सुमेरपुर(बाँया भाग)", el: 746, male_el: 408, female_el: 338, tg_el: 0, op: "OP5", pName: "श्री अश्विन सिंह राव (कनिष्ठ लिपिक)", pMob: "9667161210" },
  { b: 33, z: 6, w: 32, part: 1, name: "राजकीय उच्च प्राथमिक विद्यालय नं.5,जूना जाखोडा रोड,सुमेरपुर(दांया भाग)", el: 941, male_el: 471, female_el: 470, tg_el: 0, op: "OP6", pName: "श्री देवेन्द्र सिंह (वरिष्ठ लिपिक)", pMob: "8094145551" },
  { b: 34, z: 6, w: 33, part: 1, name: "राजकीय उच्च प्राथमिक विद्यालय, जाखानगर दाया भाग,सुमेरपुर", el: 1071, male_el: 542, female_el: 529, tg_el: 0, op: "OP6", pName: "श्री हस्तीमल (प्रयोगशाला सहायक)", pMob: "8442047725" },
  { b: 35, z: 6, w: 34, part: 1, name: "राजकीय उच्च प्राथमिक विद्यालय, जाखानगर बांया भाग,सुमेरपुर", el: 1234, male_el: 626, female_el: 599, tg_el: 9, op: "OP6", pName: "श्री राहुल राज (प्रयोगशाला सहायक)", pMob: "8290269639" },
  { b: 36, z: 6, w: 35, part: 1, name: "कार्यालय सहायक अभियंता जलदाय विभाग तखतगढ रोड ,सुमेरपुर", el: 876, male_el: 453, female_el: 423, tg_el: 0, op: "OP6", pName: "श्री जितेन्द्र सिंह (सहा. प्रशा. अधि.)", pMob: "7726017808" }
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
                ward_part INTEGER DEFAULT 1,
                name TEXT NOT NULL,
                electors INTEGER NOT NULL,
                male_electors INTEGER DEFAULT 0,
                female_electors INTEGER DEFAULT 0,
                tg_electors INTEGER DEFAULT 0,
                operator_role TEXT NOT NULL,
                praganak_name TEXT,
                praganak_mob TEXT,
                is_nirvirodh INTEGER DEFAULT 0
            )`);

            // Safe column additions for existing db
            db.run(`ALTER TABLE booths ADD COLUMN ward_part INTEGER DEFAULT 1`, () => {});
            db.run(`ALTER TABLE booths ADD COLUMN male_electors INTEGER DEFAULT 0`, () => {});
            db.run(`ALTER TABLE booths ADD COLUMN female_electors INTEGER DEFAULT 0`, () => {});
            db.run(`ALTER TABLE booths ADD COLUMN tg_electors INTEGER DEFAULT 0`, () => {});

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
                status TEXT DEFAULT 'APPROVED',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME
            )`);

            // Safe column additions for existing users table
            db.run(`ALTER TABLE users ADD COLUMN mobile TEXT DEFAULT ''`, () => {});
            db.run(`ALTER TABLE users ADD COLUMN designation TEXT DEFAULT ''`, () => {});
            db.run(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'APPROVED'`, () => {});
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

            // Always update/synchronize master booths data (electors, names, male/female/tg, etc.)
            const bStmt = db.prepare(`INSERT OR REPLACE INTO booths (id, zone, ward, ward_part, name, electors, male_electors, female_electors, tg_electors, operator_role, praganak_name, praganak_mob, is_nirvirodh) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            const sStmt = db.prepare(`INSERT OR IGNORE INTO polling_stats (booth_id, mock_done, started, v10, v13, v15, v18, v_queue, v_final, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

            // Official Polling Data from Returning Officer Master Report (21,325 votes, 71.66%)
            const masterOfficialStats = {
                1: { mock: 'Yes', started: 'Yes', v10: '217', v13: '493', v15: '564', v18: '663', v_final: '663', remark: 'शांतिपूर्ण' },
                2: { mock: 'Yes', started: 'Yes', v10: '261', v13: '490', v15: '590', v18: '692', v_final: '692', remark: 'शांतिपूर्ण' },
                3: { mock: 'Yes', started: 'Yes', v10: '158', v13: '320', v15: '374', v18: '437', v_final: '437', remark: 'शांतिपूर्ण' },
                4: { mock: 'Yes', started: 'Yes', v10: '227', v13: '461', v15: '512', v18: '555', v_final: '555', remark: 'शांतिपूर्ण' },
                5: { mock: 'Yes', started: 'Yes', v10: '145', v13: '218', v15: '253', v18: '289', v_final: '289', remark: 'शांतिपूर्ण' },
                6: { mock: 'Yes', started: 'Yes', v10: '200', v13: '400', v15: '499', v18: '590', v_final: '590', remark: 'शांतिपूर्ण' },
                7: { mock: 'Yes', started: 'Yes', v10: '245', v13: '485', v15: '660', v18: '786', v_final: '786', remark: 'शांतिपूर्ण' },
                8: { mock: 'Yes', started: 'Yes', v10: '293', v13: '583', v15: '715', v18: '791', v_final: '791', remark: 'शांतिपूर्ण' },
                9: { mock: 'Yes', started: 'Yes', v10: '255', v13: '545', v15: '724', v18: '845', v_final: '845', remark: 'शांतिपूर्ण' },
                10: { mock: 'Yes', started: 'Yes', v10: '270', v13: '466', v15: '528', v18: '588', v_final: '588', remark: 'शांतिपूर्ण' },
                11: { mock: 'Yes', started: 'Yes', v10: '216', v13: '440', v15: '503', v18: '581', v_final: '581', remark: 'शांतिपूर्ण' },
                12: { mock: 'Yes', started: 'Yes', v10: '257', v13: '535', v15: '648', v18: '690', v_final: '690', remark: 'शांतिपूर्ण' },
                13: { mock: 'Yes', started: 'Yes', v10: '210', v13: '408', v15: '524', v18: '627', v_final: '627', remark: 'शांतिपूर्ण' },
                14: { mock: 'Yes', started: 'Yes', v10: '200', v13: '441', v15: '516', v18: '578', v_final: '578', remark: 'शांतिपूर्ण' },
                15: { mock: 'Yes', started: 'Yes', v10: '243', v13: '465', v15: '553', v18: '600', v_final: '600', remark: 'शांतिपूर्ण' },
                16: { mock: 'Yes', started: 'Yes', v10: '256', v13: '493', v15: '552', v18: '609', v_final: '609', remark: 'शांतिपूर्ण' },
                17: { mock: 'Yes', started: 'Yes', v10: '185', v13: '395', v15: '465', v18: '506', v_final: '506', remark: 'शांतिपूर्ण' },
                18: { mock: 'Yes', started: 'Yes', v10: '190', v13: '454', v15: '563', v18: '709', v_final: '710', remark: 'शांतिपूर्ण' },
                19: { mock: 'Yes', started: 'Yes', v10: '220', v13: '477', v15: '600', v18: '656', v_final: '656', remark: 'शांतिपूर्ण' },
                20: { mock: 'Yes', started: 'Yes', v10: '200', v13: '430', v15: '519', v18: '612', v_final: '612', remark: 'शांतिपूर्ण' },
                21: { mock: 'Yes', started: 'Yes', v10: '170', v13: '276', v15: '309', v18: '324', v_final: '324', remark: 'शांतिपूर्ण' },
                22: { mock: 'Yes', started: 'Yes', v10: '180', v13: '352', v15: '420', v18: '483', v_final: '483', remark: 'शांतिपूर्ण' },
                23: { mock: 'Yes', started: 'Yes', v10: '247', v13: '448', v15: '534', v18: '614', v_final: '614', remark: 'शांतिपूर्ण' },
                24: { mock: 'Yes', started: 'Yes', v10: '111', v13: '285', v15: '429', v18: '482', v_final: '482', remark: 'शांतिपूर्ण' },
                25: { mock: 'Yes', started: 'Yes', v10: '217', v13: '432', v15: '495', v18: '548', v_final: '548', remark: 'शांतिपूर्ण' },
                26: { mock: 'Yes', started: 'Yes', v10: '212', v13: '411', v15: '472', v18: '514', v_final: '514', remark: 'शांतिपूर्ण' },
                27: { mock: 'No', started: 'No', v10: '', v13: '', v15: '', v18: '', v_final: '', remark: 'वार्ड 26 निर्विरोध निर्वाचित (No Election)' },
                28: { mock: 'Yes', started: 'Yes', v10: '255', v13: '512', v15: '593', v18: '658', v_final: '658', remark: 'शांतिपूर्ण' },
                29: { mock: 'Yes', started: 'Yes', v10: '313', v13: '486', v15: '557', v18: '611', v_final: '611', remark: 'शांतिपूर्ण' },
                30: { mock: 'Yes', started: 'Yes', v10: '294', v13: '523', v15: '618', v18: '674', v_final: '674', remark: 'शांतिपूर्ण' },
                31: { mock: 'Yes', started: 'Yes', v10: '186', v13: '397', v15: '457', v18: '510', v_final: '510', remark: 'शांतिपूर्ण' },
                32: { mock: 'Yes', started: 'Yes', v10: '193', v13: '400', v15: '472', v18: '502', v_final: '502', remark: 'शांतिपूर्ण' },
                33: { mock: 'Yes', started: 'Yes', v10: '297', v13: '580', v15: '680', v18: '721', v_final: '721', remark: 'शांतिपूर्ण' },
                34: { mock: 'Yes', started: 'Yes', v10: '188', v13: '404', v15: '556', v18: '759', v_final: '759', remark: 'शांतिपूर्ण' },
                35: { mock: 'Yes', started: 'Yes', v10: '251', v13: '525', v15: '710', v18: '911', v_final: '912', remark: 'शांतिपूर्ण' },
                36: { mock: 'Yes', started: 'Yes', v10: '242', v13: '490', v15: '550', v18: '608', v_final: '608', remark: 'शांतिपूर्ण' }
            };

            masterBooths.forEach(b => {
                bStmt.run(b.b, b.z, b.w, b.part || 1, b.name, b.el, b.male_el || 0, b.female_el || 0, b.tg_el || 0, b.op, b.pName, b.pMob, b.isNirvirodh ? 1 : 0);
                const s = masterOfficialStats[b.b];
                if (s) {
                    sStmt.run(b.b, s.mock, s.started, s.v10, s.v13, s.v15, s.v18, 0, s.v_final, s.remark);
                } else if (b.isNirvirodh) {
                    sStmt.run(b.b, 'No', 'No', '', '', '', '', 0, '', 'वार्ड 26 निर्विरोध निर्वाचित (No Election)');
                } else {
                    sStmt.run(b.b, 'No', 'No', '', '', '', '', 0, '', 'शांतिपूर्ण');
                }
            });

            bStmt.finalize();
            sStmt.finalize();
            console.log('✅ SQLite Database Synchronized with 36 Booths and 30,598 Electors!');
            resolve();
        });
    });
}

module.exports = {
    db,
    zonesMaster,
    masterBooths,
    initDatabase
};
