const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const { db, zonesMaster, initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), {
    etag: false,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// Server-Sent Events (SSE) clients registry for instant live sync
let sseClients = [];

function broadcastUpdate(eventType, data) {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    sseClients.forEach(client => {
        try {
            client.res.write(payload);
        } catch (e) {
            // client disconnected
        }
    });
}

// Keep SSE connections alive (15s interval)
setInterval(() => {
    sseClients.forEach(client => {
        try {
            client.res.write(': keep-alive\n\n');
        } catch (e) {}
    });
}, 15000);

// SSE Stream Endpoint
app.get('/api/live-stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering (Nginx, Render)
    res.flushHeaders();

    const clientId = Date.now() + Math.random();
    const newClient = { id: clientId, res };
    sseClients.push(newClient);

    // Send initial ping
    res.write(`event: connected\ndata: ${JSON.stringify({ message: "Live Sync Active" })}\n\n`);

    req.on('close', () => {
        sseClients = sseClients.filter(c => c.id !== clientId);
    });
});

// Authentication Endpoint (Login)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: "यूज़रनेम और पासवर्ड आवश्यक हैं।" });
    }

    db.get('SELECT username, role, name, mobile, designation, status, last_login FROM users WHERE username = ? AND password = ?', [username.trim().toLowerCase(), password.trim()], (err, user) => {
        if (err) return res.status(500).json({ success: false, message: "डेटाबेस त्रुटि" });
        if (!user) {
            return res.status(401).json({ success: false, message: "गलत यूज़रनेम या पासवर्ड!" });
        }

        const userStatus = user.status || 'APPROVED';
        if (userStatus === 'PENDING') {
            return res.status(403).json({ 
                success: false, 
                message: "⏳ आपका खाता अनुमोदन हेतु लंबित है! कृपया रिटर्निंग ऑफिसर (SDM) द्वारा एक्सेस स्वीकृत किए जाने की प्रतीक्षा करें।" 
            });
        }
        if (userStatus === 'BLOCKED' || userStatus === 'REJECTED') {
            return res.status(403).json({ 
                success: false, 
                message: "⛔ आपका खाता निष्क्रिय / ब्लॉक कर दिया गया है। कृपया रिटर्निंग ऑफिसर (SDM) से संपर्क करें।" 
            });
        }

        // Update last login timestamp
        db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE username = ?', [user.username]);

        // Log login
        db.run('INSERT INTO activity_logs (username, action, details) VALUES (?, ?, ?)', 
            [user.username, 'LOGIN', `${user.name} (${user.designation || user.role}) logged in successfully`]);

        res.json({
            success: true,
            user: {
                username: user.username,
                role: user.role,
                name: user.name,
                mobile: user.mobile || '',
                designation: user.designation || '',
                status: userStatus
            }
        });
    });
});

// Operator Registration Endpoint
app.post('/api/register', (req, res) => {
    const { name, mobile, designation, role, username, password } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: "कृपया ऑपरेटर का पूरा नाम दर्ज करें।" });
    }
    if (!username || !username.trim()) {
        return res.status(400).json({ success: false, message: "कृपया एक यूज़रनेम दर्ज करें।" });
    }
    if (!password || !password.trim() || password.trim().length < 4) {
        return res.status(400).json({ success: false, message: "पासवर्ड कम से कम 4 अक्षरों का होना चाहिए।" });
    }
    if (!role) {
        return res.status(400).json({ success: false, message: "कृपया ऑपरेटर का अधिकार / ज़ोन चुनें।" });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanName = name.trim();
    const cleanMobile = (mobile || '').trim();
    const cleanDesig = (designation || '').trim();

    // Check if username already exists
    db.get('SELECT username FROM users WHERE username = ?', [cleanUsername], (err, existing) => {
        if (err) return res.status(500).json({ success: false, message: "डेटाबेस त्रुटि: " + err.message });
        if (existing) {
            return res.status(400).json({ success: false, message: `यूज़रनेम '${cleanUsername}' पहले से पंजीकृत है! कृपया दूसरा यूज़रनेम चुनें।` });
        }

        const insertSql = `
            INSERT INTO users (username, password, role, name, mobile, designation, status, created_at, last_login)
            VALUES (?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, NULL)
        `;

        db.run(insertSql, [cleanUsername, password.trim(), role, cleanName, cleanMobile, cleanDesig], function(insertErr) {
            if (insertErr) {
                return res.status(500).json({ success: false, message: "पंजीयन में त्रुटि: " + insertErr.message });
            }

            // Log activity
            db.run('INSERT INTO activity_logs (username, action, details) VALUES (?, ?, ?)', [
                cleanUsername,
                'USER_REGISTERED',
                `नया ऑपरेटर पंजीकृत (अनुमोदन प्रतीक्षारत): ${cleanName} (${cleanDesig || 'ऑपरेटर'}), रोल: ${role}, मो: ${cleanMobile}`
            ]);

            // Notify connected RO screens via SSE
            broadcastUpdate('user_registered', {
                username: cleanUsername,
                name: cleanName,
                role: role,
                mobile: cleanMobile,
                designation: cleanDesig
            });

            res.json({
                success: true,
                message: `✅ पंजीयन सफल! सुरक्षा कारणों से आपका खाता रिटर्निंग ऑफिसर (SDM) के अनुमोदन हेतु भेजा गया है। SDM द्वारा एक्सेस स्वीकृत होने के पश्चात ही आप लॉगिन कर सकेंगे।`,
                user: {
                    username: cleanUsername,
                    role: role,
                    name: cleanName,
                    mobile: cleanMobile,
                    designation: cleanDesig,
                    status: 'PENDING'
                }
            });
        });
    });
});

// Admin Users List Endpoint
app.get('/api/admin/users', (req, res) => {
    db.all('SELECT username, role, name, mobile, designation, status, created_at, last_login FROM users ORDER BY created_at DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        const users = (rows || []).map(u => {
            let created = u.created_at;
            if (created && typeof created === 'string' && !created.endsWith('Z') && !created.includes('+')) {
                created = created.replace(' ', 'T') + 'Z';
            }
            let lastLogin = u.last_login;
            if (lastLogin && typeof lastLogin === 'string' && !lastLogin.endsWith('Z') && !lastLogin.includes('+')) {
                lastLogin = lastLogin.replace(' ', 'T') + 'Z';
            }
            return { ...u, status: u.status || 'APPROVED', created_at: created, last_login: lastLogin };
        });
        res.json({ success: true, users });
    });
});

// Admin User Authorization Status Toggle (Approve / Block / Pending)
app.post('/api/admin/user/toggle-status', (req, res) => {
    const { targetUsername, status, adminUsername } = req.body;

    if (!targetUsername || !status) {
        return res.status(400).json({ success: false, message: "यूज़रनेम एवं स्टेटस आवश्यक हैं।" });
    }

    const cleanUsername = targetUsername.trim().toLowerCase();
    if (cleanUsername === 'ro_sumerpur') {
        return res.status(400).json({ success: false, message: "मुख्य RO खाते की स्थिति नहीं बदली जा सकती।" });
    }

    const validStatuses = ['APPROVED', 'PENDING', 'BLOCKED'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: "अमान्य स्टेटस!" });
    }

    db.get('SELECT username, name, role FROM users WHERE username = ?', [cleanUsername], (err, user) => {
        if (err || !user) return res.status(404).json({ success: false, message: "उपयोगकर्ता नहीं मिला!" });

        db.run('UPDATE users SET status = ? WHERE username = ?', [status, cleanUsername], function(updateErr) {
            if (updateErr) return res.status(500).json({ success: false, message: "डेटाबेस त्रुटि: " + updateErr.message });

            const statusText = status === 'APPROVED' ? 'सक्रिय (Approved)' : (status === 'BLOCKED' ? 'ब्लॉक (Blocked)' : 'लंबित (Pending)');
            const actionMsg = `RO (${adminUsername || 'SDM'}) ने उपयोगकर्ता '${user.name}' (${cleanUsername}) का एक्सेस '${statusText}' किया।`;

            db.run('INSERT INTO activity_logs (username, action, details) VALUES (?, ?, ?)', [
                adminUsername || 'RO',
                'USER_STATUS_CHANGE',
                actionMsg
            ]);

            broadcastUpdate('user_status_changed', { username: cleanUsername, status });

            res.json({
                success: true,
                message: `सफलतापूर्वक अपडेट: उपयोगकर्ता '${user.name}' को '${statusText}' कर दिया गया है।`
            });
        });
    });
});

// Admin Change Operator Assigned Zone Endpoint
app.post('/api/admin/user/change-zone', (req, res) => {
    const { targetUsername, newRole, adminUsername } = req.body;

    if (!targetUsername || !newRole) {
        return res.status(400).json({ success: false, message: "यूज़रनेम एवं नवीन ज़ोन आवश्यक हैं।" });
    }

    const cleanUsername = targetUsername.trim().toLowerCase();
    if (cleanUsername === 'ro_sumerpur') {
        return res.status(400).json({ success: false, message: "मुख्य RO खाते का ज़ोन नहीं बदला जा सकता।" });
    }

    db.get('SELECT username, name, role FROM users WHERE username = ?', [cleanUsername], (err, user) => {
        if (err || !user) return res.status(404).json({ success: false, message: "उपयोगकर्ता नहीं मिला!" });

        db.run('UPDATE users SET role = ? WHERE username = ?', [newRole, cleanUsername], function(updateErr) {
            if (updateErr) return res.status(500).json({ success: false, message: "डेटाबेस त्रुटि: " + updateErr.message });

            const actionMsg = `RO (${adminUsername || 'SDM'}) ने ऑपरेटर '${user.name}' का ज़ोन ${user.role} से बदलकर ${newRole} किया।`;

            db.run('INSERT INTO activity_logs (username, action, details) VALUES (?, ?, ?)', [
                adminUsername || 'RO',
                'USER_ZONE_CHANGE',
                actionMsg
            ]);

            res.json({
                success: true,
                message: `सफलतापूर्वक अपडेट: ऑपरेटर '${user.name}' को अब '${newRole}' आवंटित किया गया है।`
            });
        });
    });
});

// Self-Service Forgot / Reset Password Endpoint
app.post('/api/user/forgot-password', (req, res) => {
    const { username, mobile, newPassword } = req.body;

    if (!username || !newPassword) {
        return res.status(400).json({ success: false, message: "यूज़रनेम एवं नया पासवर्ड आवश्यक हैं।" });
    }
    if (newPassword.trim().length < 4) {
        return res.status(400).json({ success: false, message: "नया पासवर्ड कम से कम 4 अक्षरों का होना चाहिए।" });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanMobile = (mobile || '').trim();

    db.get('SELECT username, mobile, name FROM users WHERE username = ?', [cleanUsername], (err, user) => {
        if (err) return res.status(500).json({ success: false, message: "डेटाबेस त्रुटि" });
        if (!user) {
            return res.status(404).json({ success: false, message: "यह यूज़रनेम डेटाबेस में नहीं मिला!" });
        }

        // If mobile is provided in registration, verify mobile match
        if (user.mobile && user.mobile.trim() !== '' && cleanMobile) {
            if (user.mobile.trim() !== cleanMobile) {
                return res.status(400).json({ success: false, message: "पंजीकृत मोबाइल नंबर मेल नहीं खाता है!" });
            }
        }

        db.run('UPDATE users SET password = ? WHERE username = ?', [newPassword.trim(), cleanUsername], function(updateErr) {
            if (updateErr) return res.status(500).json({ success: false, message: "पासवर्ड अपडेट में त्रुटि: " + updateErr.message });

            db.run('INSERT INTO activity_logs (username, action, details) VALUES (?, ?, ?)', [
                cleanUsername,
                'PASSWORD_RESET',
                `User ${cleanUsername} (${user.name}) reset their password`
            ]);

            res.json({ success: true, message: `यूज़र '${user.name}' का पासवर्ड सफलतापूर्वक बदल दिया गया है! अब नए पासवर्ड से लॉगिन करें।` });
        });
    });
});

// Admin Direct Password Reset Endpoint
app.post('/api/admin/user/reset-password', (req, res) => {
    const { targetUsername, newPassword, adminUsername } = req.body;

    if (!targetUsername || !newPassword) {
        return res.status(400).json({ success: false, message: "यूज़रनेम एवं नया पासवर्ड आवश्यक हैं।" });
    }
    if (newPassword.trim().length < 4) {
        return res.status(400).json({ success: false, message: "पासवर्ड कम से कम 4 अक्षरों का होना चाहिए।" });
    }

    const cleanUsername = targetUsername.trim().toLowerCase();

    db.get('SELECT username, name FROM users WHERE username = ?', [cleanUsername], (err, user) => {
        if (err || !user) return res.status(404).json({ success: false, message: "यूज़र नहीं मिला!" });

        db.run('UPDATE users SET password = ? WHERE username = ?', [newPassword.trim(), cleanUsername], function(updateErr) {
            if (updateErr) return res.status(500).json({ success: false, message: "अपडेट त्रुटि: " + updateErr.message });

            db.run('INSERT INTO activity_logs (username, action, details) VALUES (?, ?, ?)', [
                adminUsername || 'RO',
                'ADMIN_PASSWORD_RESET',
                `Admin reset password for user ${cleanUsername} (${user.name})`
            ]);

            res.json({ success: true, message: `यूज़र '${user.name}' (${cleanUsername}) का पासवर्ड सफलतापूर्वक अपडेट कर दिया गया!` });
        });
    });
});

// Admin Delete User Endpoint
app.post('/api/admin/user/delete', (req, res) => {
    const { targetUsername, adminUsername } = req.body;

    if (!targetUsername) return res.status(400).json({ success: false, message: "अमान्य यूज़रनेम" });
    if (targetUsername === 'ro_sumerpur') {
        return res.status(400).json({ success: false, message: "मुख्य RO खाते को हटाया नहीं जा सकता!" });
    }

    db.run('DELETE FROM users WHERE username = ?', [targetUsername.trim().toLowerCase()], function(err) {
        if (err) return res.status(500).json({ success: false, message: "हटाने में त्रुटि" });

        db.run('INSERT INTO activity_logs (username, action, details) VALUES (?, ?, ?)', [
            adminUsername || 'RO',
            'ADMIN_USER_DELETE',
            `Admin deleted user ${targetUsername}`
        ]);

        res.json({ success: true, message: `यूज़र '${targetUsername}' को सफलतापूर्वक हटा दिया गया!` });
    });
});

// Comprehensive Data API (Booths, Stats, Aggregates, System Settings)
app.get('/api/data', (req, res) => {
    const query = `
        SELECT 
            b.id, b.zone, b.ward, b.ward_part, b.name, b.electors, b.male_electors, b.female_electors, b.tg_electors, b.operator_role, b.praganak_name, b.praganak_mob, b.is_nirvirodh,
            s.mock_done, s.started, s.v10, s.v13, s.v15, s.v18, s.v_queue, s.v_final, s.remark, s.updated_at, s.updated_by
        FROM booths b
        JOIN polling_stats s ON b.id = s.booth_id
        ORDER BY b.id ASC
    `;

    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        db.all('SELECT key, value FROM system_config', [], (cfgErr, cfgRows) => {
            const config = {};
            if (!cfgErr && cfgRows) {
                cfgRows.forEach(c => config[c.key] = c.value);
            }

            // Perform analytical calculations dynamically from database
            let totalElectors = 0;
            let totalMale = 0;
            let totalFemale = 0;
            let totalTG = 0;
            let votingElectors = 0; // 35 voting booths, excluding nirvirodh

            rows.forEach(r => {
                totalElectors += Number(r.electors) || 0;
                totalMale += Number(r.male_electors) || 0;
                totalFemale += Number(r.female_electors) || 0;
                totalTG += Number(r.tg_electors) || 0;
                if (!r.is_nirvirodh) {
                    votingElectors += Number(r.electors) || 0;
                }
            });

            let sum10 = 0, sum13 = 0, sum15 = 0, sum18 = 0, sumQueue = 0, sumFinal = 0;
            let mockDoneCount = 0, startedCount = 0, totalLatestVotes = 0;

            let highestBooth = null, lowestBooth = null;
            let maxPct = -1, minPct = 999;

            const processedRows = rows.map(r => {
                const isNirv = Boolean(r.is_nirvirodh);
                const v10 = Number(r.v10) || 0;
                const v13 = Number(r.v13) || 0;
                const v15 = Number(r.v15) || 0;
                const v18 = Number(r.v18) || 0;
                const vQueue = Number(r.v_queue) || 0;
                const vFinal = Number(r.v_final) || 0;

                if (!isNirv) {
                    sum10 += v10;
                    sum13 += v13;
                    sum15 += v15;
                    sum18 += v18;
                    sumQueue += vQueue;
                    sumFinal += vFinal;

                    if (r.mock_done === 'Yes') mockDoneCount++;
                    if (r.started === 'Yes') startedCount++;

                    const latest = vFinal || v18 || v15 || v13 || v10 || 0;
                    totalLatestVotes += latest;
                    const pct = r.electors > 0 ? Number(((latest / r.electors) * 100).toFixed(2)) : 0;

                    if (pct > maxPct) {
                        maxPct = pct;
                        highestBooth = { booth: r.id, ward: r.ward, ward_part: r.ward_part || 1, name: r.name, pct, votes: latest, electors: r.electors };
                    }
                    if (pct < minPct) {
                        minPct = pct;
                        lowestBooth = { booth: r.id, ward: r.ward, ward_part: r.ward_part || 1, name: r.name, pct, votes: latest, electors: r.electors };
                    }

                    return { ...r, latestVotes: latest, turnoutPct: pct };
                } else {
                    return { ...r, latestVotes: 0, turnoutPct: 0 };
                }
            });

            const overallPct = votingElectors > 0 ? Number(((totalLatestVotes / votingElectors) * 100).toFixed(2)) : 0;

            const activeBooths = processedRows.filter(r => !r.is_nirvirodh);
            const sortedDesc = [...activeBooths].sort((a, b) => b.turnoutPct - a.turnoutPct);
            const sortedAsc = [...activeBooths].sort((a, b) => a.turnoutPct - b.turnoutPct);

            const topHighBooths = sortedDesc.slice(0, 5).map((r, idx) => ({
                rank: idx + 1,
                id: r.id,
                zone: r.zone,
                ward: r.ward,
                ward_part: r.ward_part || 1,
                name: r.name,
                electors: r.electors,
                votes: r.latestVotes,
                turnoutPct: r.turnoutPct,
                praganak_name: r.praganak_name,
                praganak_mob: r.praganak_mob
            }));

            const topLowBooths = sortedAsc.slice(0, 5).map((r, idx) => ({
                rank: idx + 1,
                id: r.id,
                zone: r.zone,
                ward: r.ward,
                ward_part: r.ward_part || 1,
                name: r.name,
                electors: r.electors,
                votes: r.latestVotes,
                turnoutPct: r.turnoutPct,
                praganak_name: r.praganak_name,
                praganak_mob: r.praganak_mob
            }));

            res.json({
                success: true,
                timestamp: new Date().toISOString(),
                config,
                zones: zonesMaster,
                booths: processedRows,
                kpi: {
                    totalElectors,
                    totalMale,
                    totalFemale,
                    totalTG,
                    votingElectors,
                    mockDoneCount,
                    startedCount,
                    totalVotingBooths: 35,
                    totalBooths: 36,
                    totalLatestVotes,
                    overallPct,
                    topHighBooths,
                    topLowBooths,
                    allRankedDesc: sortedDesc,
                    allRankedAsc: sortedAsc,
                    slotSums: {
                        s10: sum10,
                        s10Pct: votingElectors > 0 ? Number(((sum10 / votingElectors) * 100).toFixed(2)) : 0,
                        s13: sum13,
                        s13Pct: votingElectors > 0 ? Number(((sum13 / votingElectors) * 100).toFixed(2)) : 0,
                        s15: sum15,
                        s15Pct: votingElectors > 0 ? Number(((sum15 / votingElectors) * 100).toFixed(2)) : 0,
                        s18: sum18,
                        s18Pct: votingElectors > 0 ? Number(((sum18 / votingElectors) * 100).toFixed(2)) : 0,
                        sQueue: sumQueue,
                        sFinal: sumFinal,
                        sFinalPct: votingElectors > 0 ? Number(((sumFinal / votingElectors) * 100).toFixed(2)) : 0
                    },
                    highestBooth: highestBooth || { booth: '-', ward: '-', pct: 0, votes: 0, electors: 0 },
                    lowestBooth: lowestBooth || { booth: '-', ward: '-', pct: 0, votes: 0, electors: 0 }
                }
            });
        });
    });
});

// Reusable Validation Helper for Polling Stats
function validateBoothStats(data, electors, boothId) {
    const mock_done = data.mock_done || 'No';
    const started = data.started || 'No';
    const v10 = data.v10;
    const v13 = data.v13;
    const v15 = data.v15;
    const v18 = data.v18;
    const v_queue = data.v_queue;
    const v_final = data.v_final;

    const bLabel = boothId ? `बूथ संख्या ${boothId}` : 'बूथ';

    const hasVoteData = (v10 !== undefined && v10 !== '' && v10 !== null) ||
                        (v13 !== undefined && v13 !== '' && v13 !== null) ||
                        (v15 !== undefined && v15 !== '' && v15 !== null) ||
                        (v18 !== undefined && v18 !== '' && v18 !== null) ||
                        (v_final !== undefined && v_final !== '' && v_final !== null);

    // 1. Mock Poll & 7:15 Start prerequisite
    if (hasVoteData) {
        if (mock_done !== 'Yes' || started !== 'Yes') {
            return {
                valid: false,
                message: `⛔ त्रुटि (${bLabel}): जब तक 'मॉक पोल' (Mock Poll) एवं '7:15 प्रारंभ' दोनों 'Yes' नहीं होते, तब तक आगे के समय स्लॉट का मतदान डेटा दर्ज नहीं किया जा सकता!`
            };
        }
    }

    // Parse values
    const num10 = v10 !== undefined && v10 !== '' && v10 !== null ? parseInt(v10) : null;
    const num13 = v13 !== undefined && v13 !== '' && v13 !== null ? parseInt(v13) : null;
    const num15 = v15 !== undefined && v15 !== '' && v15 !== null ? parseInt(v15) : null;
    const num18 = v18 !== undefined && v18 !== '' && v18 !== null ? parseInt(v18) : null;
    const numQueue = v_queue !== undefined && v_queue !== '' && v_queue !== null ? parseInt(v_queue) : 0;
    let numFinal = v_final !== undefined && v_final !== '' && v_final !== null ? parseInt(v_final) : null;

    if (numFinal === null && num18 !== null) {
        numFinal = num18 + numQueue;
    }

    const slotList = [
        { key: 'v10', name: '10:00 AM', val: num10 },
        { key: 'v13', name: '01:00 PM', val: num13 },
        { key: 'v15', name: '03:00 PM', val: num15 },
        { key: 'v18', name: '06:00 PM', val: num18 },
        { key: 'vFinal', name: 'अंतिम मत', val: numFinal }
    ];

    // 2. Ceiling check (Total Electors limit)
    for (const slot of slotList) {
        if (slot.val !== null) {
            if (isNaN(slot.val) || slot.val < 0) {
                return { valid: false, message: `⛔ त्रुटि (${bLabel}): ${slot.name} में मतों की संख्या अमान्य है!` };
            }
            if (slot.val > electors) {
                return {
                    valid: false,
                    message: `⛔ त्रुटि (${bLabel}): ${slot.name} के मत (${slot.val}) कुल मतदाताओं (${electors}) से अधिक नहीं हो सकते!`
                };
            }
        }
    }

    if (numQueue < 0) {
        return { valid: false, message: `⛔ त्रुटि (${bLabel}): 06:00 PM कतारबद्ध मतदाताओं की संख्या ऋणात्मक नहीं हो सकती!` };
    }
    if (num18 !== null && (num18 + numQueue) > electors) {
        return {
            valid: false,
            message: `⛔ त्रुटि (${bLabel}): 06:00 PM मत (${num18}) + कतारबद्ध मत (${numQueue}) का योग (${num18 + numQueue}) कुल मतदाताओं (${electors}) से अधिक नहीं हो सकता!`
        };
    }

    // 3. Monotonic sequence check (10 AM <= 1 PM <= 3 PM <= 6 PM <= Final)
    let lastFilledSlot = null;
    for (const slot of slotList) {
        if (slot.val !== null) {
            if (lastFilledSlot !== null && slot.val < lastFilledSlot.val) {
                return {
                    valid: false,
                    message: `⛔ त्रुटि (${bLabel}): ${slot.name} के मत (${slot.val}) पिछले स्लॉट ${lastFilledSlot.name} के मतों (${lastFilledSlot.val}) से कम नहीं हो सकते! मतदान के आंकड़े बराबर या बढ़ते क्रम में होने चाहिए।`
                };
            }
            lastFilledSlot = slot;
        }
    }

    return { valid: true, numFinal };
}

// Update Booth Polling Data Endpoint
app.post('/api/booth/:id', (req, res) => {
    const boothId = parseInt(req.params.id);
    const { mock_done, started, v10, v13, v15, v18, v_queue, v_final, remark, username, userRole } = req.body;

    if (!boothId || boothId < 1 || boothId > 36) {
        return res.status(400).json({ success: false, message: "अमान्य बूथ संख्या" });
    }

    db.get('SELECT * FROM booths WHERE id = ?', [boothId], (err, booth) => {
        if (err || !booth) return res.status(404).json({ success: false, message: "बूथ नहीं मिला" });

        if (booth.is_nirvirodh) {
            return res.status(400).json({ success: false, message: "वार्ड 26 (बूथ 27) निर्विरोध है। इस पर मतदान प्रविष्टि आवश्यक नहीं है।" });
        }

        // Validate operator permission
        if (userRole !== 'RO' && booth.operator_role !== userRole) {
            return res.status(403).json({ success: false, message: "अनधिकृत: आप केवल अपने आवंटित बूथों का डेटा अपडेट कर सकते हैं।" });
        }

        const electors = booth.electors;
        const nV10 = v10 !== undefined && v10 !== '' ? String(v10) : '';
        const nV13 = v13 !== undefined && v13 !== '' ? String(v13) : '';
        const nV15 = v15 !== undefined && v15 !== '' ? String(v15) : '';
        const nV18 = v18 !== undefined && v18 !== '' ? String(v18) : '';
        const nQueue = parseInt(v_queue) || 0;
        let nFinal = v_final !== undefined && v_final !== '' ? String(v_final) : '';

        // Auto-calculate final if 6PM + Queue provided but final empty
        if (nFinal === '' && nV18 !== '') {
            nFinal = String(parseInt(nV18) + nQueue);
        }

        // Run thorough validation
        const validation = validateBoothStats({
            mock_done,
            started,
            v10: nV10,
            v13: nV13,
            v15: nV15,
            v18: nV18,
            v_queue: nQueue,
            v_final: nFinal
        }, electors, boothId);

        if (!validation.valid) {
            return res.status(400).json({ success: false, message: validation.message });
        }

        if (validation.numFinal !== null && validation.numFinal !== undefined) {
            nFinal = String(validation.numFinal);
        }

        const updateSql = `
            UPDATE polling_stats 
            SET mock_done = COALESCE(?, mock_done),
                started = COALESCE(?, started),
                v10 = ?,
                v13 = ?,
                v15 = ?,
                v18 = ?,
                v_queue = ?,
                v_final = ?,
                remark = COALESCE(?, remark),
                updated_at = CURRENT_TIMESTAMP,
                updated_by = ?
            WHERE booth_id = ?
        `;

        db.run(updateSql, [
            mock_done, started, nV10, nV13, nV15, nV18, nQueue, nFinal, remark, username || 'Operator', boothId
        ], function(updateErr) {
            if (updateErr) {
                return res.status(500).json({ success: false, message: "डेटाबेस अपडेट में त्रुटि: " + updateErr.message });
            }

            // Log activity
            db.run(`INSERT INTO activity_logs (username, action, booth_id, details) VALUES (?, ?, ?, ?)`, [
                username || 'Operator',
                'UPDATE_BOOTH',
                boothId,
                `Updated: 10AM=${nV10}, 1PM=${nV13}, 3PM=${nV15}, 6PM=${nV18}, Queue=${nQueue}, Final=${nFinal}`
            ]);

            // Broadcast SSE update to all connected screens immediately
            broadcastUpdate('booth_updated', {
                boothId,
                updatedBy: username,
                timestamp: new Date().toISOString()
            });

            res.json({
                success: true,
                message: `बूथ संख्या ${boothId} का डेटा सफलतापूर्वक सुरक्षित हो गया!`
            });
        });
    });
});

// Bulk Update Booths (Entire Zone Batch Save)
app.post('/api/booths/bulk', (req, res) => {
    const { zone, entries, username, userRole } = req.body;
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ success: false, message: "कोई डेटा प्रविष्टि प्राप्त नहीं हुई।" });
    }

    const zoneNum = parseInt(zone);
    const roleStr = userRole ? String(userRole) : '';
    if (roleStr !== 'RO' && roleStr !== `OP${zoneNum}`) {
        const allowedZone = roleStr.startsWith('OP') ? roleStr.replace('OP', '') : 'निर्धारित';
        return res.status(403).json({ success: false, message: `अनधिकृत: आप केवल ज़ोन ${allowedZone} के बूथों का डेटा अपडेट कर सकते हैं।` });
    }

    db.all('SELECT id, electors, is_nirvirodh, operator_role FROM booths WHERE zone = ?', [zoneNum], (err, zoneBooths) => {
        if (err || !zoneBooths) return res.status(500).json({ success: false, message: "डेटाबेस त्रुटि" });

        const boothMap = {};
        zoneBooths.forEach(b => boothMap[b.id] = b);

        // Pre-validate all entries in the batch
        for (const entry of entries) {
            const bId = parseInt(entry.boothId);
            const bInfo = boothMap[bId];
            if (!bInfo || bInfo.is_nirvirodh) continue;

            const validation = validateBoothStats(entry, bInfo.electors, bId);
            if (!validation.valid) {
                return res.status(400).json({ success: false, message: validation.message });
            }
        }

        const stmt = db.prepare(`
            UPDATE polling_stats 
            SET mock_done = COALESCE(?, mock_done),
                started = COALESCE(?, started),
                v10 = ?,
                v13 = ?,
                v15 = ?,
                v18 = ?,
                v_queue = ?,
                v_final = ?,
                remark = COALESCE(?, remark),
                updated_at = CURRENT_TIMESTAMP,
                updated_by = ?
            WHERE booth_id = ?
        `);

        db.serialize(() => {
            let updatedCount = 0;
            entries.forEach(entry => {
                const bId = parseInt(entry.boothId);
                const bInfo = boothMap[bId];
                if (!bInfo || bInfo.is_nirvirodh) return;

                const nV10 = entry.v10 !== undefined && entry.v10 !== '' ? String(entry.v10) : '';
                const nV13 = entry.v13 !== undefined && entry.v13 !== '' ? String(entry.v13) : '';
                const nV15 = entry.v15 !== undefined && entry.v15 !== '' ? String(entry.v15) : '';
                const nV18 = entry.v18 !== undefined && entry.v18 !== '' ? String(entry.v18) : '';
                const nQueue = parseInt(entry.v_queue) || 0;
                let nFinal = entry.v_final !== undefined && entry.v_final !== '' ? String(entry.v_final) : '';

                if (nFinal === '' && nV18 !== '') {
                    nFinal = String(parseInt(nV18) + nQueue);
                }

                stmt.run(
                    entry.mock_done,
                    entry.started,
                    nV10,
                    nV13,
                    nV15,
                    nV18,
                    nQueue,
                    nFinal,
                    entry.remark || 'शांतिपूर्ण',
                    username || 'Operator',
                    bId
                );
                updatedCount++;
            });

            stmt.finalize(() => {
                db.run(`INSERT INTO activity_logs (username, action, details) VALUES (?, ?, ?)`, [
                    username || 'Operator',
                    'BULK_UPDATE_ZONE',
                    `Zone ${zoneNum} bulk updated (${updatedCount} booths)`
                ]);

                broadcastUpdate('booth_updated', {
                    zone: zoneNum,
                    updatedBy: username,
                    timestamp: new Date().toISOString()
                });

                res.json({
                    success: true,
                    message: `जोन ${zoneNum} के समस्त ${updatedCount} बूथों का डेटा सफलतापूर्वक सुरक्षित हो गया!`
                });
            });
        });
    });
});

// RO Credential Verification Helper
function verifyRoCredentials(roUsername, roPassword, callback) {
    if (!roUsername || !roPassword) {
        return callback(false, "RO यूज़रनेम एवं पासवर्ड दर्ज करना अनिवार्य है।", null);
    }
    const cleanUser = roUsername.trim().toLowerCase();
    db.get('SELECT * FROM users WHERE username = ? AND password = ? AND role = "RO"', [cleanUser, roPassword.trim()], (err, user) => {
        if (err || !user) {
            return callback(false, "अमान्य RO क्रेडेंशियल्स! केवल अधिकृत रिटर्निंग ऑफिसर (SDM) को ही यह अधिकार है।", null);
        }
        callback(true, null, user);
    });
}

// Admin API: Toggle Global Time Lock Override
app.post('/api/admin/time-override', (req, res) => {
    const { override, simulatedTime, username, roPassword } = req.body;
    
    db.serialize(() => {
        if (override !== undefined) {
            db.run(`INSERT OR REPLACE INTO system_config (key, value) VALUES ('global_override', ?)`, [String(override)]);
        }
        if (simulatedTime !== undefined) {
            db.run(`INSERT OR REPLACE INTO system_config (key, value) VALUES ('simulated_time', ?)`, [String(simulatedTime)]);
        }

        db.run(`INSERT INTO activity_logs (username, action, details) VALUES (?, ?, ?)`, [
            username || 'RO',
            'ADMIN_CONFIG_CHANGE',
            `Global Override=${override}, Simulated Time=${simulatedTime}`
        ]);

        broadcastUpdate('config_updated', { override, simulatedTime });
        res.json({ success: true, message: "सिस्टम टाइम-लॉक सेटिंग्स अपडेट हुई।" });
    });
});

// Admin API: Toggle Live Election Freeze Lock for Data Reset
app.post('/api/admin/toggle-reset-lock', (req, res) => {
    const { roUsername, roPassword, locked } = req.body;

    verifyRoCredentials(roUsername, roPassword, (isAuth, errMsg, roUser) => {
        if (!isAuth) {
            return res.status(401).json({ success: false, message: errMsg });
        }

        const lockVal = (locked === true || locked === 'true') ? 'true' : 'false';
        db.run(`INSERT OR REPLACE INTO system_config (key, value) VALUES ('reset_locked', ?)`, [lockVal], (err) => {
            if (err) return res.status(500).json({ success: false, message: "डेटाबेस त्रुटि" });

            const isNowLocked = (lockVal === 'true');
            const actionMsg = isNowLocked 
                ? '🛡️ लाइव मतदान सुरक्षा लॉक सक्रिय किया गया (डेटा रीसेट पूर्ण रूप से ब्लॉक)' 
                : '🔓 लाइव मतदान सुरक्षा लॉक हटाया गया (रिहर्सल डेटा रीसेट अनुमत)';

            db.run(`INSERT INTO activity_logs (username, action, details) VALUES (?, ?, ?)`, [
                roUser.name || 'RO SDM',
                'RESET_LOCK_TOGGLE',
                actionMsg
            ]);

            broadcastUpdate('config_updated', { reset_locked: lockVal });
            res.json({ 
                success: true, 
                message: actionMsg, 
                reset_locked: lockVal 
            });
        });
    });
});

// Admin API: Reset Polling Data (Rehearsal clean - Highly Protected with RO Password & Freeze Mode)
app.post('/api/admin/reset', (req, res) => {
    const { roUsername, roPassword, confirm } = req.body;

    // 1. Check if Live Freeze Lock is enabled
    db.get('SELECT value FROM system_config WHERE key = "reset_locked"', [], (cfgErr, cfgRow) => {
        if (cfgRow && cfgRow.value === 'true') {
            return res.status(403).json({ 
                success: false, 
                message: "⛔ सुरक्षा निषेध: 'लाइव मतदान सुरक्षा लॉक' सक्रिय है! वास्तविक मतदान दिवस पर डेटा रीसेट की अनुमति नहीं है। यदि आप रिहर्सल कर रहे हैं, तो पहले लाइव लॉक निष्क्रिय करें।" 
            });
        }

        // 2. Check secret confirmation code
        if (confirm !== 'RESET_SUMERPUR_2026') {
            return res.status(400).json({ 
                success: false, 
                message: "पुष्टिकरण कोड अमान्य है! सही कोड 'RESET_SUMERPUR_2026' दर्ज करें।" 
            });
        }

        // 3. Authenticate RO Master Credentials
        verifyRoCredentials(roUsername, roPassword, (isAuth, errMsg, roUser) => {
            if (!isAuth) {
                return res.status(401).json({ success: false, message: errMsg });
            }

            db.serialize(() => {
                db.run(`UPDATE polling_stats SET mock_done='No', started='No', v10='', v13='', v15='', v18='', v_queue=0, v_final='', remark='शांतिपूर्ण' WHERE booth_id != 27`);
                db.run(`INSERT INTO activity_logs (username, action, details) VALUES (?, ?, ?)`, [
                    roUser.name || 'RO SDM',
                    'DATA_RESET_AUTHORIZED',
                    `Authorized Data Reset executed by RO (${roUser.name})`
                ]);

                broadcastUpdate('data_reset', { message: "Data Reset Triggered by Authorized RO" });
                res.json({ 
                    success: true, 
                    message: "सफलतापूर्वक संपन्न: सभी 35 मतदान बूथों का डेटा सुरक्षित रूप से रीसेट कर दिया गया है।" 
                });
            });
        });
    });
});

// Activity Logs API (For RO Admin review)
app.get('/api/logs', (req, res) => {
    db.all('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 100', [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        const logs = (rows || []).map(r => {
            let ts = r.timestamp;
            if (ts && typeof ts === 'string' && !ts.endsWith('Z') && !ts.includes('+')) {
                ts = ts.replace(' ', 'T') + 'Z';
            }
            return { ...r, timestamp: ts };
        });
        res.json({ success: true, logs });
    });
});

// CSV Export Endpoint
app.get('/api/export/csv', (req, res) => {
    const query = `
        SELECT 
            b.id as "बूथ संख्या", b.zone as "जोन", b.ward as "वार्ड", b.ward_part as "भाग संख्या", b.name as "मतदान केंद्र", 
            b.male_electors as "पुरुष वोटर", b.female_electors as "महिला वोटर", b.tg_electors as "TG वोटर", b.electors as "कुल वोटर",
            s.mock_done as "मॉक पोल", s.started as "7:15 प्रारंभ", s.v10 as "10:00 AM", s.v13 as "01:00 PM",
            s.v15 as "03:00 PM", s.v18 as "06:00 PM", s.v_queue as "06:00 PM कतारबद्ध", s.v_final as "अंतिम मत",
            s.remark as "रिमार्क", b.praganak_name as "प्रभारी", b.praganak_mob as "मोबाइल",
            datetime(s.updated_at, '+5 hours', '30 minutes') as "अंतिम अपडेट (IST)"
        FROM booths b
        JOIN polling_stats s ON b.id = s.booth_id
        ORDER BY b.id ASC
    `;

    db.all(query, [], (err, rows) => {
        if (err || !rows || rows.length === 0) {
            return res.status(500).send("डेटा निर्यात में त्रुटि");
        }

        const headers = Object.keys(rows[0]).join(',');
        const csvRows = rows.map(r => {
            return Object.values(r).map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(',');
        });

        const csvContent = '\uFEFF' + [headers, ...csvRows].join('\r\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=Sumerpur_Election_2026_${Date.now()}.csv`);
        res.send(csvContent);
    });
});

// SPA Fallback / Multi-page routing helpers
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Helper to get local network IP
function getLocalNetworkIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// Start Server
initDatabase().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        const localIP = getLocalNetworkIP();
        console.log(`\n=============================================================`);
        console.log(` 🏛️  सुमेरपुर नगर पालिका आम चुनाव 2026 — कंट्रोल रूम पोर्टल`);
        console.log(`=============================================================`);
        console.log(` 🖥️  कंट्रोल रूम सर्वर:  http://localhost:${PORT}`);
        console.log(` 📱  ऑफिस Wi-Fi / LAN: http://${localIP}:${PORT}`);
        console.log(` 🌐  पब्लिक लाइव डिस्प्ले: http://${localIP}:${PORT}/#livedisplay`);
        console.log(` 📄  शासकीय रिपोर्ट्स:   http://${localIP}:${PORT}/report.html`);
        console.log(` 💾  डेटाबेस:           SQLite (election_sumerpur.db)`);
        console.log(` ⚡  रियल-टाइम सिंक:   सक्रिय (Server-Sent Events)`);
        console.log(`=============================================================\n`);
    });
}).catch(err => {
    console.error("❌ Failed to initialize database:", err);
});
