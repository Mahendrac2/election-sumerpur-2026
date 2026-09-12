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

        // Check if voting is locked for 11-09-2026 Archive
        db.get("SELECT value FROM system_config WHERE key = 'voting_locked'", [], (cfgErr, cfg) => {
            if (cfg && cfg.value === 'true' && userRole !== 'RO') {
                return res.status(403).json({ 
                    success: false, 
                    message: "⛔ 11-09-2026 मतदान संपन्न हो चुका है! डेटा आधिकारिक अभिलेख के रूप में सुरक्षित एवं लॉक (Frozen) है।" 
                });
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
});

// Bulk Update Booths (Entire Zone Batch Save)
app.post('/api/booths/bulk', (req, res) => {
    const { zone, entries, username, userRole } = req.body;
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ success: false, message: "कोई डेटा प्रविष्टि प्राप्त नहीं हुई।" });
    }

    const zoneNum = parseInt(zone);
    const roleStr = userRole ? String(userRole) : '';

    // Check if voting is locked for 11-09-2026 Archive
    db.get("SELECT value FROM system_config WHERE key = 'voting_locked'", [], (cfgErr, cfg) => {
        if (cfg && cfg.value === 'true' && roleStr !== 'RO') {
            return res.status(403).json({ 
                success: false, 
                message: "⛔ 11-09-2026 मतदान संपन्न हो चुका है! डेटा आधिकारिक अभिलेख के रूप में सुरक्षित एवं लॉक (Frozen) है।" 
            });
        }

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

// Admin API: Export Full Database Snapshot (JSON Backup)
app.get('/api/admin/backup-snapshot', (req, res) => {
    const isDownload = req.query.download === 'true';
    db.all('SELECT * FROM polling_stats ORDER BY booth_id ASC', [], (err1, stats) => {
        if (err1) return res.status(500).json({ success: false, error: err1.message });
        db.all('SELECT username, role, name, mobile, designation, status, last_login FROM users', [], (err2, users) => {
            db.all('SELECT * FROM system_config', [], (err3, config) => {
                db.all('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 500', [], (err4, logs) => {
                    db.all('SELECT * FROM candidates ORDER BY id ASC', [], (err5, cands) => {
                        db.all('SELECT * FROM ward_results ORDER BY ward ASC', [], (err6, wardRes) => {
                            const snapshot = {
                                version: "2.0",
                                timestamp: new Date().toISOString(),
                                system: "Sumerpur Municipal Election 2026 Control Room",
                                polling_stats: stats || [],
                                candidates: cands || [],
                                ward_results: wardRes || [],
                                users: users || [],
                                system_config: config || [],
                                activity_logs: logs || []
                            };
                            if (isDownload) {
                                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                                res.setHeader('Content-Disposition', `attachment; filename=Sumerpur_Backup_${Date.now()}.json`);
                                return res.send(JSON.stringify(snapshot, null, 2));
                            }
                            res.json({ success: true, snapshot });
                        });
                    });
                });
            });
        });
    });
});

// Admin API: Restore Database Snapshot
app.post('/api/admin/restore-snapshot', (req, res) => {
    const { snapshot, syncKey, roUsername, roPassword } = req.body;
    
    // Authenticate via master sync key OR RO credentials
    const isMasterSync = (syncKey === 'SUMERPUR_SECURE_SYNC_2026');
    
    const executeRestore = (restoredBy) => {
        if (!snapshot || !snapshot.polling_stats || !Array.isArray(snapshot.polling_stats)) {
            return res.status(400).json({ success: false, message: "अमान्य बैकअप फ़ाइल: 'polling_stats' डेटा अनुपलब्ध है।" });
        }

        db.serialize(() => {
            const updateStmt = db.prepare(`
                UPDATE polling_stats 
                SET mock_done = ?, started = ?, v10 = ?, v13 = ?, v15 = ?, v18 = ?, v_queue = ?, v_final = ?, remark = ?, updated_at = ?, updated_by = ?
                WHERE booth_id = ?
            `);

            let restoredCount = 0;
            snapshot.polling_stats.forEach(r => {
                if (r && r.booth_id) {
                    updateStmt.run(
                        r.mock_done || 'No',
                        r.started || 'No',
                        r.v10 || '',
                        r.v13 || '',
                        r.v15 || '',
                        r.v18 || '',
                        parseInt(r.v_queue) || 0,
                        r.v_final || '',
                        r.remark || 'शांतिपूर्ण',
                        r.updated_at || new Date().toISOString(),
                        r.updated_by || 'Auto-Sync Restore',
                        r.booth_id
                    );
                    restoredCount++;
                }
            });
            updateStmt.finalize();

            // Log activity
            db.run(`INSERT INTO activity_logs (username, action, details) VALUES (?, ?, ?)`, [
                restoredBy,
                'DATABASE_RESTORED',
                `डेटाबेस बैकअप से रीस्टोर किया गया (${restoredCount} बूथ सफलतापूर्वक अपडेट)`
            ]);

            // Broadcast real-time update to all live displays
            broadcastUpdate('data_reset', { message: "Database Restored from Backup Snapshot" });

            res.json({
                success: true,
                message: `सफलतापूर्वक रीस्टोर किया गया: ${restoredCount} मतदान बूथों का डेटा सफलतापूर्वक लोड हो गया है!`,
                restoredBooths: restoredCount,
                timestamp: new Date().toISOString()
            });
        });
    };

    if (isMasterSync) {
        return executeRestore('Auto-Sync Engine');
    }

    verifyRoCredentials(roUsername, roPassword, (isAuth, errMsg, roUser) => {
        if (!isAuth) {
            return res.status(401).json({ success: false, message: errMsg || "अनधिकृत: रीस्टोर के लिए RO क्रेडेंशियल आवश्यक हैं।" });
        }
        executeRestore(roUser.name || 'RO SDM');
    });
});

// =========================================================================
// 14-09-2026 COUNTING & ELECTION RESULTS MODULE
// =========================================================================

// Admin: Toggle Voting Lock
app.post('/api/admin/toggle-voting-lock', (req, res) => {
    const { roUsername, roPassword, locked } = req.body;
    verifyRoCredentials(roUsername, roPassword, (isAuth, errMsg) => {
        if (!isAuth) {
            return res.status(401).json({ success: false, message: errMsg || "अनधिकृत: केवल RO एडमिन ही लॉक टॉगल कर सकते हैं।" });
        }
        const val = (locked === true || locked === 'true') ? 'true' : 'false';
        db.run("INSERT OR REPLACE INTO system_config (key, value) VALUES ('voting_locked', ?)", [val], (err) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            broadcastUpdate('system_config_updated', { key: 'voting_locked', value: val });
            res.json({
                success: true,
                message: val === 'true' ? "🔒 मतदान इनपुट सफलतापूर्वक लॉक (Frozen) कर दिए गए हैं।" : "🔓 मतदान इनपुट अनलॉक कर दिए गए हैं।",
                voting_locked: val === 'true'
            });
        });
    });
});

// 1. Get Complete Results & Tally Data
app.get('/api/results/data', (req, res) => {
    db.all('SELECT * FROM ward_results ORDER BY ward ASC', [], (err1, wardRows) => {
        if (err1) return res.status(500).json({ success: false, error: err1.message });

        db.all('SELECT * FROM candidates ORDER BY ward ASC, candidate_no ASC', [], (err2, candidateRows) => {
            if (err2) return res.status(500).json({ success: false, error: err2.message });

            db.all(`
                SELECT b.id AS booth_no, b.ward, b.ward_part, b.name, b.electors, p.v_final AS polled_votes
                FROM booths b
                LEFT JOIN polling_stats p ON b.id = p.booth_id
                ORDER BY b.ward ASC, b.ward_part ASC
            `, [], (err3, boothRows) => {
                const boothsByWard = {};
                (boothRows || []).forEach(b => {
                    if (!boothsByWard[b.ward]) boothsByWard[b.ward] = [];
                    boothsByWard[b.ward].push({
                        part: b.ward_part || (boothsByWard[b.ward].length + 1),
                        booth_no: b.booth_no,
                        name: b.name,
                        electors: b.electors,
                        polled_votes: parseInt(b.polled_votes) || 0
                    });
                });

                const safeParseArray = (val, fallback) => {
                    if (!val) return fallback;
                    try {
                        const p = JSON.parse(val);
                        return Array.isArray(p) ? p : fallback;
                    } catch(e) {
                        return fallback;
                    }
                };

                const getRoundsArray = (roundsJson, count, evm1, evm2) => {
                    let arr = safeParseArray(roundsJson, null);
                    if (!arr) {
                        arr = [];
                        for (let i = 0; i < count; i++) {
                            if (i === 0) arr.push(evm1 || 0);
                            else if (i === 1) arr.push(evm2 || 0);
                            else arr.push(0);
                        }
                    }
                    while (arr.length < count) arr.push(0);
                    return arr;
                };

                // Group candidates by ward
                const candidatesByWard = {};
                (candidateRows || []).forEach(c => {
                    if (!candidatesByWard[c.ward]) candidatesByWard[c.ward] = [];
                    candidatesByWard[c.ward].push(c);
                });

                // Calculate party tally and summary
                const partyTally = {
                    'BJP': { code: 'BJP', name: 'भारतीय जनता पार्टी', won: 0, leading: 0, total: 0, color: '#f97316' },
                    'INC': { code: 'INC', name: 'इण्डियन नेशनल कांग्रेस', won: 0, leading: 0, total: 0, color: '#0ea5e9' },
                    'IND': { code: 'IND', name: 'निर्दलीय', won: 0, leading: 0, total: 0, color: '#8b5cf6' },
                    'AAP': { code: 'AAP', name: 'आम आदमी पार्टी', won: 0, leading: 0, total: 0, color: '#eab308' },
                    'OTH': { code: 'OTH', name: 'अन्य', won: 0, leading: 0, total: 0, color: '#64748b' }
                };

                const getPartyKey = (partyName) => {
                    if (!partyName) return 'OTH';
                    if (partyName.includes('भारतीय जनता') || partyName.includes('BJP')) return 'BJP';
                    if (partyName.includes('कांग्रेस') || partyName.includes('INC')) return 'INC';
                    if (partyName.includes('निर्दलीय') || partyName.includes('IND')) return 'IND';
                    if (partyName.includes('आम आदमी') || partyName.includes('AAP')) return 'AAP';
                    return 'OTH';
                };

                let declaredWards = 0;
                let countingWards = 0;
                let pendingWards = 0;
                let totalCountedVotes = 0;
                let totalElectors = 30598;
                let totalPolledVotes = 21325;

                const wards = (wardRows || []).map(w => {
                    const cList = candidatesByWard[w.ward] || [];
                    const counted = (w.total_counted_votes || 0);
                    totalCountedVotes += counted;

                    const wardParts = boothsByWard[w.ward] || [{
                        part: 1,
                        booth_no: w.ward,
                        name: `वार्ड ${w.ward} मतदान केंद्र`,
                        electors: w.total_electors,
                        polled_votes: w.total_polled_votes
                    }];
                    const partCount = wardParts.length;

                    // Sort candidates by total_votes desc
                    const sortedCands = [...cList].sort((a, b) => (b.total_votes || 0) - (a.total_votes || 0));

                    let leader = null;
                    let runnerUp = null;
                    let margin = w.margin || 0;

                    if (sortedCands.length > 0) {
                        leader = sortedCands[0];
                        if (sortedCands.length > 1) {
                            runnerUp = sortedCands[1];
                            if (w.status !== 'Declared' || margin === 0) {
                                margin = Math.max(0, (leader.total_votes || 0) - (runnerUp.total_votes || 0));
                            }
                        } else {
                            margin = leader.total_votes || 0;
                        }
                    }

                    if (w.status === 'Declared') {
                        declaredWards++;
                        const pKey = getPartyKey(w.winner_party || (leader ? leader.party : ''));
                        partyTally[pKey].won++;
                        partyTally[pKey].total++;
                    } else if (w.status === 'Counting') {
                        countingWards++;
                        if (leader && leader.total_votes > 0) {
                            const pKey = getPartyKey(leader.party);
                            partyTally[pKey].leading++;
                            partyTally[pKey].total++;
                        }
                    } else {
                        pendingWards++;
                    }

                    return {
                        ward: w.ward,
                        totalElectors: w.total_electors,
                        total_electors: w.total_electors,
                        totalPolledVotes: w.total_polled_votes,
                        total_polled_votes: w.total_polled_votes,
                        totalCountedVotes: w.total_counted_votes,
                        total_counted_votes: w.total_counted_votes,
                        notaVotes: w.nota_votes,
                        nota_votes: w.nota_votes,
                        nota_votes_evm1: w.nota_votes_evm1 || 0,
                        nota_votes_evm2: w.nota_votes_evm2 || 0,
                        nota_rounds: getRoundsArray(w.nota_rounds, partCount, w.nota_votes_evm1 || w.nota_votes, w.nota_votes_evm2),
                        parts: wardParts,
                        part_count: partCount,
                        round_count: partCount,
                        evm_count: partCount,
                        tenderedVotes: w.tendered_votes,
                        tendered_votes: w.tendered_votes,
                        rejectedVotes: w.rejected_votes,
                        rejected_votes: w.rejected_votes,
                        status: w.status,
                        winnerName: w.winner_name,
                        winner_name: w.winner_name,
                        winnerParty: w.winner_party,
                        winner_party: w.winner_party,
                        winnerId: w.winner_id,
                        winner_id: w.winner_id,
                        margin: margin,
                        tableNo: w.counting_table_no,
                        counting_table_no: w.counting_table_no,
                        updatedAt: w.updated_at,
                        updated_at: w.updated_at,
                        leader: leader ? {
                            id: leader.id,
                            name: leader.name,
                            party: leader.party,
                            symbol: leader.symbol,
                            totalVotes: leader.total_votes,
                            total_votes: leader.total_votes,
                            votesEvm: leader.votes_evm,
                            votes_evm: leader.votes_evm,
                            votesEvm2: leader.votes_evm2 || 0,
                            votes_evm2: leader.votes_evm2 || 0,
                            votes_rounds: getRoundsArray(leader.votes_rounds, partCount, leader.votes_evm, leader.votes_evm2),
                            votesPostal: leader.votes_postal,
                            votes_postal: leader.votes_postal
                        } : null,
                        runnerUp: runnerUp ? {
                            id: runnerUp.id,
                            name: runnerUp.name,
                            party: runnerUp.party,
                            symbol: runnerUp.symbol,
                            totalVotes: runnerUp.total_votes,
                            total_votes: runnerUp.total_votes
                        } : null,
                        candidates: cList.map(c => ({
                            id: c.id,
                            cNo: c.candidate_no,
                            candidate_no: c.candidate_no,
                            candidateNo: c.candidate_no,
                            name: c.name,
                            address: c.address,
                            party: c.party,
                            symbol: c.symbol,
                            votesEvm: c.votes_evm || 0,
                            votes_evm: c.votes_evm || 0,
                            votesEvm2: c.votes_evm2 || 0,
                            votes_evm2: c.votes_evm2 || 0,
                            votes_rounds: getRoundsArray(c.votes_rounds, partCount, c.votes_evm, c.votes_evm2),
                            votesPostal: c.votes_postal || 0,
                            votes_postal: c.votes_postal || 0,
                            totalVotes: c.total_votes || 0,
                            total_votes: c.total_votes || 0,
                            isWinner: Boolean(c.is_winner),
                            is_winner: Boolean(c.is_winner),
                            isDeclared: Boolean(c.is_declared),
                            is_declared: Boolean(c.is_declared),
                            pct: counted > 0 ? Number((((c.total_votes || 0) / counted) * 100).toFixed(1)) : 0
                        }))
                    };
                });

            // Check majority (18 out of 35)
            let majorityAchievedBy = null;
            Object.keys(partyTally).forEach(k => {
                if (partyTally[k].won >= 18) {
                    majorityAchievedBy = k;
                }
            });

            res.json({
                success: true,
                timestamp: new Date().toISOString(),
                tally: partyTally,
                majority_mark: 18,
                total_wards: 35,
                declared_count: declaredWards,
                counting_count: countingWards,
                pending_count: pendingWards,
                total_counted_votes: totalCountedVotes,
                total_polled_votes: totalPolledVotes,
                summary: {
                    totalWards: 35,
                    declaredWards,
                    countingWards,
                    pendingWards,
                    totalElectors,
                    totalPolledVotes,
                    totalCountedVotes,
                    countedPercentage: totalPolledVotes > 0 ? Number(((totalCountedVotes / totalPolledVotes) * 100).toFixed(2)) : 0,
                    majorityMark: 18,
                    majorityAchievedBy,
                    partyTally
                },
                wards
            });
        });
    });
});
});

// 2. Update Ward Counting Data (EVM + Postal + NOTA)
app.post('/api/counting/update-ward', (req, res) => {
    const { ward, candidatesVotes, candidateVotes, nota_votes, nota_votes_evm1, nota_votes_evm2, tendered_votes, rejected_votes, status, table_no, counting_table_no, username, operator_username } = req.body;
    const wardNum = parseInt(ward);
    const votesArray = candidateVotes || candidatesVotes;
    const tableNum = counting_table_no || table_no || 1;
    const opUser = operator_username || username || 'Operator';

    if (!wardNum || wardNum < 1 || wardNum > 35) {
        return res.status(400).json({ success: false, message: "अमान्य वार्ड संख्या (1 से 35)" });
    }

    if (wardNum === 26) {
        return res.status(400).json({ success: false, message: "वार्ड 26 निर्विरोध निर्वाचित है। इसकी मतगणना आवश्यक नहीं है।" });
    }

    if (!votesArray || !Array.isArray(votesArray)) {
        return res.status(400).json({ success: false, message: "प्रत्याशियों के मतों का विवरण आवश्यक है।" });
    }

    db.serialize(() => {
        const updateCandStmt = db.prepare(`
            UPDATE candidates 
            SET votes_evm = ?, votes_evm2 = ?, votes_rounds = ?, votes_postal = ?, total_votes = ?
            WHERE id = ? AND ward = ?
        `);

        let sumCandVotes = 0;
        votesArray.forEach(cv => {
            let rounds = [];
            if (Array.isArray(cv.votes_rounds)) {
                rounds = cv.votes_rounds.map(v => parseInt(v) || 0);
            } else {
                const evm = parseInt(cv.votes_evm) || 0;
                const evm2 = parseInt(cv.votes_evm2) || 0;
                rounds = [evm];
                if (evm2 > 0 || wardNum === 1) rounds.push(evm2);
            }
            const sumRounds = rounds.reduce((a, b) => a + b, 0);
            const postal = parseInt(cv.votes_postal) || 0;
            const tot = sumRounds + postal;
            sumCandVotes += tot;
            const r1 = rounds[0] || 0;
            const r2 = rounds[1] || 0;
            updateCandStmt.run(r1, r2, JSON.stringify(rounds), postal, tot, cv.id, wardNum);
        });
        updateCandStmt.finalize();

        let notaRounds = [];
        if (Array.isArray(req.body.nota_rounds)) {
            notaRounds = req.body.nota_rounds.map(v => parseInt(v) || 0);
        } else if (typeof req.body.nota_rounds === 'string') {
            try {
                const p = JSON.parse(req.body.nota_rounds);
                if (Array.isArray(p)) notaRounds = p.map(v => parseInt(v) || 0);
            } catch(e) {}
        }

        let nNota = 0;
        let nNota1 = parseInt(nota_votes_evm1) || 0;
        let nNota2 = parseInt(nota_votes_evm2) || 0;

        if (notaRounds.length > 0) {
            nNota = notaRounds.reduce((a, b) => a + b, 0);
            nNota1 = notaRounds[0] || 0;
            nNota2 = notaRounds[1] || 0;
        } else {
            nNota = (wardNum === 1 && (nNota1 > 0 || nNota2 > 0)) ? (nNota1 + nNota2) : (parseInt(nota_votes) || 0);
            notaRounds = [nNota1];
            if (nNota2 > 0 || wardNum === 1) notaRounds.push(nNota2);
        }

        const nTendered = parseInt(tendered_votes) || 0;
        const nRejected = parseInt(rejected_votes) || 0;
        const totalCounted = sumCandVotes + nNota;

        // Fetch updated candidates of this ward to find leader and margin
        db.all('SELECT * FROM candidates WHERE ward = ? ORDER BY total_votes DESC', [wardNum], (err, sortedCands) => {
            if (err || !sortedCands || sortedCands.length === 0) {
                return res.status(500).json({ success: false, message: "प्रत्याशी डेटा प्राप्त करने में त्रुटि।" });
            }

            const leader = sortedCands[0];
            const runnerUp = sortedCands.length > 1 ? sortedCands[1] : null;
            const margin = runnerUp ? Math.max(0, leader.total_votes - runnerUp.total_votes) : leader.total_votes;
            const newStatus = status || 'Counting';

            let winnerId = null;
            let winnerName = leader.name;
            let winnerParty = leader.party;

            if (newStatus === 'Declared') {
                winnerId = leader.id;
                // Mark winner in candidates table
                db.run('UPDATE candidates SET is_winner = 0, is_declared = 0 WHERE ward = ?', [wardNum], () => {
                    db.run('UPDATE candidates SET is_winner = 1, is_declared = 1, declared_at = CURRENT_TIMESTAMP WHERE id = ?', [winnerId]);
                });
            }

            const updateWardSql = `
                UPDATE ward_results 
                SET nota_votes = ?,
                    nota_votes_evm1 = ?,
                    nota_votes_evm2 = ?,
                    nota_rounds = ?,
                    tendered_votes = ?,
                    rejected_votes = ?,
                    total_counted_votes = ?,
                    status = ?,
                    winner_id = ?,
                    winner_name = ?,
                    winner_party = ?,
                    margin = ?,
                    counting_table_no = COALESCE(?, counting_table_no),
                    updated_at = CURRENT_TIMESTAMP
                WHERE ward = ?
            `;

            db.run(updateWardSql, [
                nNota, nNota1, nNota2, JSON.stringify(notaRounds), nTendered, nRejected, totalCounted, newStatus, winnerId, winnerName, winnerParty, margin, tableNum, wardNum
            ], function(wErr) {
                if (wErr) return res.status(500).json({ success: false, message: wErr.message });

                // Log counting activity
                db.run('INSERT INTO activity_logs (username, action, details) VALUES (?, ?, ?)', [
                    username || 'Counting Supervisor',
                    'COUNTING_UPDATE',
                    `वार्ड ${wardNum} मतगणना अपडेट: ${totalCounted} मत गिने गए | स्थिति: ${newStatus} | बढ़त/विजेता: ${winnerName} (${winnerParty}, +${margin})`
                ]);

                // Broadcast live update to all screens
                broadcastUpdate('counting_update', {
                    ward: wardNum,
                    status: newStatus,
                    leader: winnerName,
                    party: winnerParty,
                    margin,
                    totalCounted
                });

                res.json({
                    success: true,
                    message: `वार्ड ${wardNum} का मतगणना डेटा सफलतापूर्वक सहेजा गया!`,
                    ward: wardNum,
                    totalCounted,
                    leader: winnerName,
                    margin,
                    status: newStatus
                });
            });
        });
    });
});

// 3. Declare Winner Endpoint (RO Official Declaration)
app.post('/api/counting/declare-winner', (req, res) => {
    const { ward, winner_id, roUsername, roPassword } = req.body;
    const wardNum = parseInt(ward);

    if (!wardNum || wardNum < 1 || wardNum > 35) {
        return res.status(400).json({ success: false, message: "अमान्य वार्ड" });
    }

    verifyRoCredentials(roUsername, roPassword, (isAuth, errMsg, roUser) => {
        if (!isAuth) {
            return res.status(401).json({ success: false, message: errMsg || "अनधिकृत: परिणाम घोषित करने के लिए RO क्रेडेंशियल आवश्यक हैं।" });
        }

        db.get('SELECT * FROM candidates WHERE id = ? AND ward = ?', [winner_id, wardNum], (cErr, winnerCand) => {
            if (cErr || !winnerCand) {
                return res.status(404).json({ success: false, message: "प्रत्याशी नहीं मिला" });
            }

            db.all('SELECT * FROM candidates WHERE ward = ? ORDER BY total_votes DESC', [wardNum], (err, allCands) => {
                const runnerUp = (allCands || []).find(c => c.id !== winnerCand.id);
                const margin = runnerUp ? Math.max(0, winnerCand.total_votes - runnerUp.total_votes) : winnerCand.total_votes;

                db.serialize(() => {
                    db.run('UPDATE candidates SET is_winner = 0, is_declared = 0 WHERE ward = ?', [wardNum]);
                    db.run('UPDATE candidates SET is_winner = 1, is_declared = 1, declared_at = CURRENT_TIMESTAMP WHERE id = ?', [winnerCand.id]);
                    db.run(`
                        UPDATE ward_results 
                        SET status = 'Declared', winner_id = ?, winner_name = ?, winner_party = ?, margin = ?, updated_at = CURRENT_TIMESTAMP 
                        WHERE ward = ?
                    `, [winnerCand.id, winnerCand.name, winnerCand.party, margin, wardNum]);

                    db.run('INSERT INTO activity_logs (username, action, details) VALUES (?, ?, ?)', [
                        roUser.name || 'RO SDM',
                        'WINNER_DECLARED',
                        `वार्ड ${wardNum} आधिकारिक परिणाम घोषित: ${winnerCand.name} (${winnerCand.party}) निर्वाचित (+${margin} मतों से)`
                    ]);

                    broadcastUpdate('winner_declared', {
                        ward: wardNum,
                        winner: winnerCand.name,
                        party: winnerCand.party,
                        margin
                    });

                    res.json({
                        success: true,
                        message: `वार्ड ${wardNum} का परिणाम औपचारिक रूप से घोषित: ${winnerCand.name} (${winnerCand.party}) निर्वाचित (+${margin} मत)!`
                    });
                });
            });
        });
    });
});

// 4. Form 21 / Certificate of Election Data API
app.get('/api/results/certificate/:ward', (req, res) => {
    const wardNum = parseInt(req.params.ward);
    if (!wardNum || wardNum < 1 || wardNum > 35) {
        return res.status(400).json({ success: false, message: "अमान्य वार्ड" });
    }

    db.get('SELECT * FROM ward_results WHERE ward = ?', [wardNum], (wErr, ward) => {
        if (wErr || !ward) return res.status(404).json({ success: false, message: "वार्ड नहीं मिला" });

        db.all('SELECT * FROM candidates WHERE ward = ? ORDER BY total_votes DESC', [wardNum], (cErr, cands) => {
            if (cErr) return res.status(500).json({ success: false, message: cErr.message });

            const winner = (cands || []).find(c => c.is_winner || c.id === ward.winner_id) || (cands ? cands[0] : null);
            const runnerUp = (cands || []).find(c => winner && c.id !== winner.id);

            res.json({
                success: true,
                certificate: {
                    form: "प्ररूप - 21 (Form 21)",
                    title: "निर्वाचन प्रमाण-पत्र (Certificate of Election)",
                    rule: "राजस्थान नगर पालिका (निर्वाचन) नियम",
                    municipality: "नगर पालिका सुमेरपुर (जिला पाली, राजस्थान)",
                    ward: wardNum,
                    totalElectors: ward.total_electors,
                    totalPolled: ward.total_polled_votes,
                    totalCounted: ward.total_counted_votes,
                    total_electors: ward.total_electors,
                    total_polled_votes: ward.total_polled_votes,
                    total_counted_votes: ward.total_counted_votes,
                    winner_name: winner ? winner.name : ward.winner_name,
                    winner_address: winner ? winner.address : '',
                    winner_party: winner ? winner.party : ward.winner_party,
                    winner_symbol: winner ? winner.symbol : '',
                    total_votes: winner ? winner.total_votes : 0,
                    winner: {
                        name: winner ? winner.name : ward.winner_name,
                        address: winner ? winner.address : '',
                        party: winner ? winner.party : ward.winner_party,
                        symbol: winner ? winner.symbol : '',
                        votes: winner ? winner.total_votes : 0
                    },
                    runnerUp: runnerUp ? {
                        name: runnerUp.name,
                        party: runnerUp.party,
                        votes: runnerUp.total_votes
                    } : null,
                    margin: ward.margin || 0,
                    isNirvirodh: (wardNum === 26),
                    status: ward.status,
                    date: "14.09.2026",
                    place: "सुमेरपुर",
                    ro_name: "कालुराम कुम्हार (आर.ए.एस.)",
                    ro_title: "रिटर्निंग अधिकारी (उपखण्ड मजिस्ट्रेट), नगर पालिका सुमेरपुर (पाली)",
                    returningOfficer: {
                        name: "कालुराम कुम्हार",
                        service: "आर.ए.एस.",
                        designation: "रिटर्निंग अधिकारी (उपखण्ड मजिस्ट्रेट)",
                        office: "नगर पालिका सुमेरपुर (पाली)"
                    }
                }
            });
        });
    });
});

// 14-09-2026 Counting Results CSV Export Endpoint
app.get('/api/results/export/csv', (req, res) => {
    const qWards = 'SELECT * FROM ward_results ORDER BY ward ASC';
    const qCands = 'SELECT * FROM candidates ORDER BY ward ASC, candidate_no ASC';

    db.all(qWards, [], (err1, wards) => {
        if (err1) return res.status(500).send("त्रुटि: " + err1.message);
        db.all(qCands, [], (err2, cands) => {
            if (err2) return res.status(500).send("त्रुटि: " + err2.message);

            const candsByWard = {};
            cands.forEach(c => {
                if (!candsByWard[c.ward]) candsByWard[c.ward] = [];
                candsByWard[c.ward].push(c);
            });

            const rows = wards.map(w => {
                const wc = candsByWard[w.ward] || [];
                const cDetail = wc.map(c => `${c.name} (${c.party}): ${c.total_votes || 0}`).join(' | ');
                return {
                    "वार्ड सं": w.ward,
                    "कुल मतदाता": w.total_electors,
                    "मतदान दिवस मत (Polled)": w.total_polled_votes,
                    "स्थिति": w.status,
                    "गिने गए मत (Counted)": w.total_counted_votes || 0,
                    "NOTA मत": w.nota_votes || 0,
                    "विजयी प्रत्याशी": w.winner_name || (w.ward === 26 ? 'निर्विरोध' : 'प्रतीक्षारत'),
                    "विजयी दल": w.winner_party || (w.ward === 26 ? 'BJP' : '-'),
                    "जीत का अंतर": w.margin || 0,
                    "टेबल सं": w.counting_table_no || 1,
                    "प्रत्याशीवार मत": cDetail
                };
            });

            const headers = Object.keys(rows[0]).join(',');
            const csvRows = rows.map(r => Object.values(r).map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','));
            const csvContent = '\uFEFF' + [headers, ...csvRows].join('\r\n');

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename=Sumerpur_Counting_Results_14_09_2026.csv`);
            res.send(csvContent);
        });
    });
});

// Multi-page dedicated administrative routes
app.get('/results', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'results.html'));
});

app.get('/counting', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'results.html'));
});

app.get('/polling', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/voting', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
        console.log(` 🏛️  सुमेरपुर नगर पालिका आम चुनाव 2026 — आधिकारिक पोर्टल`);
        console.log(`=============================================================`);
        console.log(` 🗳️  मतदान नियंत्रण:    http://${localIP}:${PORT}/`);
        console.log(` 🏆  मतगणना एवं परिणाम:  http://${localIP}:${PORT}/results`);
        console.log(` 📄  शासकीय रिपोर्ट्स:   http://${localIP}:${PORT}/report.html`);
        console.log(` 💾  डेटाबेस:           SQLite (election_sumerpur.db)`);
        console.log(` ⚡  रियल-टाइम सिंक:   सक्रिय (Server-Sent Events)`);
        console.log(`=============================================================\n`);
    });
}).catch(err => {
    console.error("❌ Failed to initialize database:", err);
});
