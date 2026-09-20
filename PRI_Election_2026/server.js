const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const { db, initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Server-Sent Events (SSE) लाइव स्ट्रीम
let sseClients = [];
function broadcastUpdate(eventType, data) {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    sseClients.forEach(client => {
        try { client.res.write(payload); } catch(e) {}
    });
}

app.get('/api/live-stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const clientId = Date.now();
    sseClients.push({ id: clientId, res });
    req.on('close', () => { sseClients = sseClients.filter(c => c.id !== clientId); });
});

// 1. ग्राम पंचायतों की सूची API
app.get('/api/pri/gram-panchayats', (req, res) => {
    db.all(`SELECT * FROM gram_panchayats ORDER BY id ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, gram_panchayats: rows });
    });
});

// 2. पंचायत समिति वार्डों की सूची API
app.get('/api/pri/ps-wards', (req, res) => {
    db.all(`SELECT * FROM ps_wards ORDER BY ward ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, ps_wards: rows });
    });
});

// 3. मतदान सांख्यिकी एवं KPI API
app.get('/api/pri/data', (req, res) => {
    const { gp_id, ps_ward } = req.query;
    let query = `
        SELECT b.*, ps.v10, ps.v13, ps.v15, ps.v17, ps.v_queue, ps.v_final, ps.remark, gp.name as gp_name
        FROM booths b
        LEFT JOIN polling_stats ps ON b.id = ps.booth_id
        LEFT JOIN gram_panchayats gp ON b.gp_id = gp.id
    `;
    const params = [];
    if (gp_id) {
        query += ` WHERE b.gp_id = ?`;
        params.push(gp_id);
    } else if (ps_ward) {
        query += ` WHERE b.ps_ward = ?`;
        params.push(ps_ward);
    }
    query += ` ORDER BY b.id ASC`;

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, booths: rows || [] });
    });
});

// 4. यूज़र लॉगिन API
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT username, role, name, assigned_id FROM users WHERE username = ? AND password = ?`, [username, password], (err, user) => {
        if (err || !user) return res.status(401).json({ success: false, message: "गलत यूज़रनेम या पासवर्ड!" });
        res.json({ success: true, user });
    });
});

// पेज राउट्स
app.get('/results', (req, res) => res.sendFile(path.join(__dirname, 'public', 'results.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// सर्वर स्टार्ट
initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log("\n=============================================================");
        console.log(" 🌾  पंचायती राज आम चुनाव 2026 — कंट्रोल रूम एवं परिणाम पोर्टल");
        console.log("=============================================================");
        console.log(` 🖥️  लोकल सर्वर:        http://localhost:${PORT}`);
        console.log(` 🏆  परिणाम पोर्टल:     http://localhost:${PORT}/results`);
        console.log(" 💾  डेटाबेस:           SQLite (pri_election.db)");
        console.log(" ⚡  रियल-टाइम सिंक:   सक्रिय (SSE)");
        console.log("=============================================================\n");
    });
}).catch(err => {
    console.error("Database initialization failed:", err);
});
