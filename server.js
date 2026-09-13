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
app.use(express.static(path.join(__dirname, 'public')));

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

// Keep SSE connections alive
setInterval(() => {
    sseClients.forEach(client => {
        try {
            client.res.write(': keep-alive\n\n');
        } catch (e) {}
    });
}, 25000);

// SSE Stream Endpoint
app.get('/api/live-stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
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

    db.get('SELECT username, role, name, mobile, designation, last_login FROM users WHERE username = ? AND password = ?', [username.trim(), password.trim()], (err, user) => {
        if (err) return res.status(500).json({ success: false, message: "डेटाबेस त्रुटि" });
        if (!user) {
            return res.status(401).json({ success: false, message: "गलत यूज़रनेम या पासवर्ड!" });
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
                designation: user.designation || ''
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
            INSERT INTO users (username, password, role, name, mobile, designation, created_at, last_login)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `;

        db.run(insertSql, [cleanUsername, password.trim(), role, cleanName, cleanMobile, cleanDesig], function(insertErr) {
            if (insertErr) {
                return res.status(500).json({ success: false, message: "पंजीयन में त्रुटि: " + insertErr.message });
            }

            // Log activity
            db.run('INSERT INTO activity_logs (username, action, details) VALUES (?, ?, ?)', [
                cleanUsername,
                'USER_REGISTERED',
                `नया ऑपरेटर पंजीकृत: ${cleanName} (${cleanDesig || 'ऑपरेटर'}), रोल: ${role}, मो: ${cleanMobile}`
            ]);

            res.json({
                success: true,
                message: `ऑपरेटर '${cleanName}' का पंजीयन सफलतापूर्वक हो गया!`,
                user: {
                    username: cleanUsername,
                    role: role,
                    name: cleanName,
                    mobile: cleanMobile,
                    designation: cleanDesig
                }
            });
        });
    });
});

// Admin Users List Endpoint
app.get('/api/admin/users', (req, res) => {
    db.all('SELECT username, role, name, mobile, designation, created_at, last_login FROM users ORDER BY created_at DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, users: rows });
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
            b.id, b.zone, b.ward, b.name, b.electors, b.operator_role, b.praganak_name, b.praganak_mob, b.is_nirvirodh,
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

            // Perform analytical calculations
            const totalElectors = 30529;
            const votingElectors = 29696; // 35 voting booths, excluding booth 27
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
                    const pct = Number(((latest / r.electors) * 100).toFixed(2));

                    if (pct > maxPct) {
                        maxPct = pct;
                        highestBooth = { booth: r.id, ward: r.ward, name: r.name, pct, votes: latest, electors: r.electors };
                    }
                    if (pct < minPct) {
                        minPct = pct;
                        lowestBooth = { booth: r.id, ward: r.ward, name: r.name, pct, votes: latest, electors: r.electors };
                    }

                    return { ...r, latestVotes: latest, turnoutPct: pct };
                } else {
                    return { ...r, latestVotes: 0, turnoutPct: 0 };
                }
            });

            const overallPct = Number(((totalLatestVotes / votingElectors) * 100).toFixed(2));

            const activeBooths = processedRows.filter(r => !r.is_nirvirodh);
            const sortedDesc = [...activeBooths].sort((a, b) => b.turnoutPct - a.turnoutPct);
            const sortedAsc = [...activeBooths].sort((a, b) => a.turnoutPct - b.turnoutPct);

            const topHighBooths = sortedDesc.slice(0, 5).map((r, idx) => ({
                rank: idx + 1,
                id: r.id,
                zone: r.zone,
                ward: r.ward,
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
                        s10Pct: Number(((sum10 / votingElectors) * 100).toFixed(2)),
                        s13: sum13,
                        s13Pct: Number(((sum13 / votingElectors) * 100).toFixed(2)),
                        s15: sum15,
                        s15Pct: Number(((sum15 / votingElectors) * 100).toFixed(2)),
                        s18: sum18,
                        s18Pct: Number(((sum18 / votingElectors) * 100).toFixed(2)),
                        sQueue: sumQueue,
                        sFinal: sumFinal,
                        sFinalPct: Number(((sumFinal / votingElectors) * 100).toFixed(2))
                    },
                    highestBooth: highestBooth || { booth: '-', ward: '-', pct: 0, votes: 0, electors: 0 },
                    lowestBooth: lowestBooth || { booth: '-', ward: '-', pct: 0, votes: 0, electors: 0 }
                }
            });
        });
    });
});

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

        // Boundary checks
        const checkVal = parseInt(nFinal || nV18 || nV15 || nV13 || nV10 || 0);
        if (checkVal > electors) {
            return res.status(400).json({ success: false, message: `त्रुटि: मतों की संख्या कुल मतदाताओं (${electors}) से अधिक नहीं हो सकती!` });
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
        res.json({ success: true, logs: rows });
    });
});

// CSV Export Endpoint
app.get('/api/export/csv', (req, res) => {
    const query = `
        SELECT 
            b.id as "बूथ संख्या", b.zone as "जोन", b.ward as "वार्ड", b.name as "मतदान केंद्र", b.electors as "कुल वोटर",
            s.mock_done as "मॉक पोल", s.started as "7:15 प्रारंभ", s.v10 as "10:00 AM", s.v13 as "01:00 PM",
            s.v15 as "03:00 PM", s.v18 as "06:00 PM", s.v_queue as "6 PM कतार", s.v_final as "अंतिम मत",
            s.remark as "रिमार्क", b.praganak_name as "प्रभारी", b.praganak_mob as "मोबाइल", s.updated_at as "अंतिम अपडेट"
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
        db.all('SELECT username, role, name, mobile, designation, last_login FROM users', [], (err2, users) => {
            db.all('SELECT * FROM system_config', [], (err3, config) => {
                db.all('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 500', [], (err4, logs) => {
                    const snapshot = {
                        version: "2.0",
                        timestamp: new Date().toISOString(),
                        system: "Sumerpur Municipal Election 2026 Control Room",
                        polling_stats: stats || [],
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

// Admin API: Restore Database Snapshot (2-Way Cloud Sync Engine & RO Tool)
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
                if (r && (r.booth_id || r.id)) {
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
                        r.booth_id || r.id
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
                message: `डेटाबेस बैकअप से सफलतापूर्वक रीस्टोर किया गया (${restoredCount} बूथ अपडेट)।`,
                restoredBooths: restoredCount
            });
        });
    };

    if (isMasterSync) {
        return executeRestore('Auto-Sync Engine');
    }

    if (!roUsername || !roPassword) {
        return res.status(401).json({ success: false, message: "डेटाबेस रीस्टोर हेतु RO ऑथेंटिकेशन या Sync Key आवश्यक है।" });
    }

    db.get('SELECT * FROM users WHERE username = ? AND password = ? AND role = "RO"', [roUsername.trim(), roPassword.trim()], (err, ro) => {
        if (err || !ro) {
            return res.status(401).json({ success: false, message: "गलत RO क्रेडेंशियल्स! केवल रिटर्निंग ऑफिसर ही डेटाबेस रीस्टोर कर सकते हैं।" });
        }
        executeRestore(ro.username);
    });
});

// Admin: Toggle Voting Lock
app.post('/api/admin/toggle-voting-lock', (req, res) => {
    const { roUsername, roPassword, locked } = req.body;
    db.get('SELECT * FROM users WHERE username = ? AND password = ? AND role = "RO"', [roUsername && roUsername.trim(), roPassword && roPassword.trim()], (err, ro) => {
        if (err || !ro) {
            return res.status(401).json({ success: false, message: "अनधिकृत: केवल RO एडमिन ही लॉक टॉगल कर सकते हैं।" });
        }
        const val = (locked === true || locked === 'true') ? 'true' : 'false';
        db.run("INSERT OR REPLACE INTO system_config (key, value) VALUES ('voting_locked', ?)", [val], (e) => {
            if (e) return res.status(500).json({ success: false, message: e.message });
            broadcastUpdate('system_config_updated', { key: 'voting_locked', value: val });
            res.json({
                success: true,
                message: val === 'true' ? "🔒 मतदान इनपुट सफलतापूर्वक लॉक (Frozen) कर दिए गए हैं।" : "🔓 मतदान इनपुट अनलॉक कर दिए गए हैं।",
                voting_locked: val === 'true'
            });
        });
    });
});

// User friendly redirects
app.get('/counting', (req, res) => res.redirect('/results'));
app.get('/polling', (req, res) => res.redirect('/'));
app.get('/voting', (req, res) => res.redirect('/'));

// =========================================================================
// 🏆 COUNTING & RESULTS MODULE (मतगणना एवं परिणाम मॉड्यूल)
// =========================================================================
const fs = require('fs');
const resultsStorePath = path.join(__dirname, 'results_store.json');

function getResultsStore() {
    try {
        if (fs.existsSync(resultsStorePath)) {
            const data = fs.readFileSync(resultsStorePath, 'utf8');
            return JSON.parse(data);
        }
    } catch(e) {
        console.error("Error reading results store:", e);
    }
    return null;
}

function saveResultsStore(data) {
    try {
        if (fs.existsSync(resultsStorePath)) {
            fs.copyFileSync(resultsStorePath, resultsStorePath + '.bak');
        }
        fs.writeFileSync(resultsStorePath, JSON.stringify(data, null, 2), 'utf8');
    } catch(e) {
        console.error("Error saving results store:", e);
    }
}

// Page route for /results
app.get('/results', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'results.html'));
});

// Page route for /form21 (प्ररूप 21 अन्तिम परिणाम पत्र)
app.get('/form21', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'form21.html'));
});

// GET /api/results/data
app.get('/api/results/data', (req, res) => {
    const store = getResultsStore();
    if (!store) {
        return res.status(500).json({ success: false, message: "डेटा लोड करने में असमर्थ" });
    }
    res.json(store);
});

// POST /api/counting/update-ward
app.post('/api/counting/update-ward', (req, res) => {
    const {
        ward: wardNo,
        candidateVotes = [],
        nota_votes = 0,
        nota_votes_evm1 = 0,
        nota_votes_evm2 = 0,
        nota_rounds = [],
        tendered_votes = 0,
        rejected_votes = 0,
        status = 'Counting',
        counting_table_no = 1,
        operator_username = 'op_counting'
    } = req.body;

    const store = getResultsStore();
    if (!store || !store.wards) {
        return res.status(500).json({ success: false, message: "डेटाबेस अनुपलब्ध" });
    }

    const ward = store.wards.find(w => w.ward === parseInt(wardNo));
    if (!ward) {
        return res.status(404).json({ success: false, message: `वार्ड ${wardNo} नहीं मिला` });
    }

    // Update candidate votes
    let totalCountedVotes = 0;
    let candScores = [];

    ward.candidates.forEach(cand => {
        const input = candidateVotes.find(cv => cv.id === cand.id);
        if (input) {
            const rVotes = Array.isArray(input.votes_rounds) ? input.votes_rounds : [input.votes_evm || 0, input.votes_evm2 || 0];
            cand.votes_rounds = rVotes.map(v => parseInt(v) || 0);
            cand.votes_evm = cand.votes_rounds[0] || 0;
            cand.votes_evm2 = cand.votes_rounds[1] || 0;
            cand.votesEvm = cand.votes_evm;
            cand.votesEvm2 = cand.votes_evm2;
            cand.votes_postal = parseInt(input.votes_postal) || 0;
            cand.votesPostal = cand.votes_postal;
            const rSum = cand.votes_rounds.reduce((a, b) => a + b, 0);
            cand.total_votes = rSum + cand.votes_postal;
            cand.totalVotes = cand.total_votes;
        }
        totalCountedVotes += (cand.total_votes || 0);
        candScores.push({ id: cand.id, name: cand.name, party: cand.party, votes: cand.total_votes || 0 });
    });

    // Update NOTA
    ward.nota_rounds = Array.isArray(nota_rounds) ? nota_rounds.map(n => parseInt(n) || 0) : [parseInt(nota_votes_evm1) || 0, parseInt(nota_votes_evm2) || 0];
    ward.nota_votes_evm1 = ward.nota_rounds[0] || 0;
    ward.nota_votes_evm2 = ward.nota_rounds[1] || 0;
    ward.nota_votes = parseInt(nota_votes) || ward.nota_rounds.reduce((a, b) => a + b, 0);
    ward.notaVotes = ward.nota_votes;
    totalCountedVotes += ward.nota_votes;

    // Strict Validation: Cannot save empty data with 0 votes on non-nirvirodh wards
    if (totalCountedVotes === 0 && parseInt(wardNo) !== 26 && !ward.isNirvirodh) {
        return res.status(400).json({
            success: false,
            message: "शून्य मतों के साथ डेटा सुरक्षित नहीं किया जा सकता। कृपया पहले प्रत्याशियों के मत दर्ज करें।"
        });
    }

    if (status === 'Declared' && candScores.every(cs => cs.votes === 0) && parseInt(wardNo) !== 26 && !ward.isNirvirodh) {
        return res.status(400).json({
            success: false,
            message: "शून्य मतों के साथ परिणाम घोषित नहीं किया जा सकता। कृपया पहले प्रत्याशियों के मत दर्ज करें।"
        });
    }

    ward.total_counted_votes = totalCountedVotes;
    ward.totalCountedVotes = totalCountedVotes;
    ward.tendered_votes = parseInt(tendered_votes) || 0;
    ward.tenderedVotes = ward.tendered_votes;
    ward.rejected_votes = parseInt(rejected_votes) || 0;
    ward.rejectedVotes = ward.rejected_votes;
    ward.status = status;
    ward.counting_table_no = parseInt(counting_table_no) || 1;
    ward.tableNo = ward.counting_table_no;
    ward.updated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
    ward.updatedAt = ward.updated_at;

    // Determine Leader / Winner
    candScores.sort((a, b) => b.votes - a.votes);
    const leader = candScores[0] || { id: null, name: '', party: '', votes: 0 };
    const runnerUp = candScores[1] || { id: null, name: '', party: '', votes: 0 };
    const margin = (leader.votes || 0) - (runnerUp.votes || 0);

    ward.candidates.forEach(c => {
        c.isWinner = (status === 'Declared' && c.id === leader.id);
        c.is_winner = c.isWinner;
        c.isDeclared = (status === 'Declared');
        c.is_declared = c.isDeclared;
        c.pct = totalCountedVotes > 0 ? Math.round((c.total_votes / totalCountedVotes) * 1000) / 10 : 0;
    });

    ward.winner_id = (status === 'Declared' || totalCountedVotes > 0) ? leader.id : null;
    ward.winnerId = ward.winner_id;
    ward.winner_name = (status === 'Declared' || totalCountedVotes > 0) ? leader.name : '';
    ward.winnerName = ward.winner_name;
    ward.winner_party = (status === 'Declared' || totalCountedVotes > 0) ? leader.party : '';
    ward.winnerParty = ward.winner_party;
    ward.margin = margin;

    ward.leader = {
        id: leader.id,
        name: leader.name,
        party: leader.party,
        totalVotes: leader.votes,
        total_votes: leader.votes
    };
    ward.runnerUp = {
        id: runnerUp.id,
        name: runnerUp.name,
        party: runnerUp.party,
        totalVotes: runnerUp.votes,
        total_votes: runnerUp.votes
    };

    // Recalculate summary & party tally
    const tally = {
        BJP: { code: 'BJP', name: 'भारतीय जनता पार्टी', won: 0, leading: 0, total: 0, color: '#f97316' },
        INC: { code: 'INC', name: 'इण्डियन नेशनल कांग्रेस', won: 0, leading: 0, total: 0, color: '#0ea5e9' },
        IND: { code: 'IND', name: 'निर्दलीय', won: 0, leading: 0, total: 0, color: '#8b5cf6' },
        AAP: { code: 'AAP', name: 'आम आदमी पार्टी', won: 0, leading: 0, total: 0, color: '#eab308' },
        OTH: { code: 'OTH', name: 'अन्य', won: 0, leading: 0, total: 0, color: '#64748b' }
    };

    let declaredCount = 0;
    let countingCount = 0;
    let pendingCount = 0;
    let grandCountedVotes = 0;
    let maleWon = 0;
    let femaleWon = 0;
    let maleLeading = 0;
    let femaleLeading = 0;

    store.wards.forEach(w => {
        grandCountedVotes += (w.total_counted_votes || 0);
        let partyKey = 'OTH';
        const partyName = (w.winner_party || (w.leader ? w.leader.party : '') || '').toLowerCase();
        if (partyName.includes('भारतीय') || partyName.includes('bjp')) partyKey = 'BJP';
        else if (partyName.includes('कांग्रेस') || partyName.includes('inc')) partyKey = 'INC';
        else if (partyName.includes('निर्दलीय') || partyName.includes('ind')) partyKey = 'IND';
        else if (partyName.includes('आम आदमी') || partyName.includes('aap')) partyKey = 'AAP';

        // Candidate / Winner Gender Check
        let isFemale = false;
        const winCand = w.candidates.find(c => c.id === (w.winner_id || (w.leader ? w.leader.id : null))) || w.candidates[0];
        if (winCand && (winCand.gender === 'F' || winCand.gender_hi === 'महिला')) {
            isFemale = true;
        } else if (w.winner_name && (w.winner_name.includes('देवी') || w.winner_name.includes('बाई') || w.winner_name.includes('कंवर') || w.winner_name.includes('कुमारी') || w.winner_name.includes('बहन') || w.winner_name.includes('श्रीमती') || w.winner_name.includes('वीणा') || w.winner_name.includes('मंजु'))) {
            isFemale = true;
        }
        w.winner_gender = isFemale ? 'F' : 'M';
        w.winner_gender_hi = isFemale ? 'महिला' : 'पुरुष';

        if (w.status === 'Declared') {
            declaredCount++;
            if (tally[partyKey]) {
                tally[partyKey].won++;
                tally[partyKey].total++;
            }
            if (isFemale) femaleWon++;
            else maleWon++;
        } else if (w.status === 'Counting') {
            countingCount++;
            if (tally[partyKey] && (w.total_counted_votes > 0)) {
                tally[partyKey].leading++;
                tally[partyKey].total++;
            }
            if (w.total_counted_votes > 0) {
                if (isFemale) femaleLeading++;
                else maleLeading++;
            }
        } else {
            pendingCount++;
        }
    });

    const genderTally = {
        male: { won: maleWon, leading: maleLeading, total: maleWon + maleLeading },
        female: { won: femaleWon, leading: femaleLeading, total: femaleWon + femaleLeading }
    };

    store.tally = tally;
    store.genderTally = genderTally;
    store.declared_count = declaredCount;
    store.counting_count = countingCount;
    store.pending_count = pendingCount;
    store.total_counted_votes = grandCountedVotes;
    store.summary = {
        totalWards: 35,
        declaredWards: declaredCount,
        countingWards: countingCount,
        pendingWards: pendingCount,
        totalElectors: store.summary.totalElectors || 30598,
        totalPolledVotes: store.summary.totalPolledVotes || 21325,
        totalCountedVotes: grandCountedVotes,
        countedPercentage: store.summary.totalPolledVotes > 0 ? Math.round((grandCountedVotes / store.summary.totalPolledVotes) * 1000) / 10 : 0,
        majorityMark: 18,
        partyTally: tally,
        genderTally: genderTally
    };
    store.timestamp = new Date().toISOString();

    saveResultsStore(store);

    // Broadcast SSE update
    broadcastUpdate('results_update', {
        ward: ward.ward,
        status: ward.status,
        winner_name: ward.winner_name,
        winner_party: ward.winner_party,
        winner_gender: ward.winner_gender,
        winner_gender_hi: ward.winner_gender_hi,
        margin: ward.margin,
        summary: store.summary
    });

    if (ward.status === 'Declared') {
        broadcastUpdate('winner_declared', {
            ward: ward.ward,
            winner_name: ward.winner_name,
            winner_party: ward.winner_party,
            winner_gender: ward.winner_gender,
            margin: ward.margin
        });
    }

    // Log Activity
    db.run('INSERT INTO activity_logs (username, action, details) VALUES (?, ?, ?)', [
        operator_username,
        'COUNTING_UPDATED',
        `वार्ड ${ward.ward} मतगणना प्रविष्टि सुरक्षित: स्थिति '${ward.status}', कुल दर्ज: ${ward.total_counted_votes} मत`
    ]);

    res.json({
        success: true,
        message: `वार्ड ${ward.ward} का मतगणना डेटा सफलतापूर्वक सुरक्षित हो गया!`,
        ward: ward,
        summary: store.summary
    });
});

// Certificate API
app.get(['/api/results/certificate/:wardNo', '/api/results/certificate/:ward'], (req, res) => {
    const wardParam = req.params.wardNo || req.params.ward;
    const store = getResultsStore();
    if (!store || !store.wards) return res.status(500).json({ success: false });
    const ward = store.wards.find(w => w.ward === parseInt(wardParam));
    if (!ward) return res.status(404).json({ success: false, message: "वार्ड नहीं मिला" });
    res.json({ success: true, certificate: ward, ward });
});

// Results CSV Export
app.get('/api/results/export/csv', (req, res) => {
    const store = getResultsStore();
    if (!store || !store.wards) return res.status(500).send("डेटा अनुपलब्ध");
    
    let csv = '\uFEFFवार्ड संख्या,मतदाता,11-09 पोल,कुल गिने मत,NOTA,प्रत्याशी का नाम,लिंग,दल,चुनाव प्रतीक,भाग 1 मत,भाग 2 मत,डाक मत,कुल मत,स्थिति,जीत का अंतर\r\n';
    store.wards.forEach(w => {
        w.candidates.forEach((c, idx) => {
            const p1 = (c.votes_rounds && c.votes_rounds[0]) || c.votes_evm || 0;
            const p2 = (c.votes_rounds && c.votes_rounds[1]) || c.votes_evm2 || 0;
            const post = c.votes_postal || 0;
            const tot = c.total_votes || 0;
            const genderStr = (c.gender === 'F' || c.gender_hi === 'महिला') ? 'महिला' : 'पुरुष';
            const statusStr = c.isWinner ? 'विजेता (Declared)' : (idx === 0 && w.status === 'Counting' ? 'अग्रता' : '-');
            const marginStr = (c.isWinner || idx === 0) ? (w.margin || 0) : '';
            csv += `"${w.ward}","${w.total_electors}","${w.total_polled_votes}","${w.total_counted_votes}","${w.nota_votes}","${c.name}","${genderStr}","${c.party}","${c.symbol || ''}","${p1}","${p2}","${post}","${tot}","${statusStr}","${marginStr}"\r\n`;
        });
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=Sumerpur_Counting_Results_2026_${Date.now()}.csv`);
    res.send(csv);
});

// Mock Simulation & Rehearsal Endpoints for Counting (समस्त 35 वार्ड एवं EVM पार्ट्स हेतु डमी टेस्ट)
app.post('/api/results/mock-test', (req, res) => {
    try {
        const store = getResultsStore();
        if (!store) return res.status(500).json({ success: false, message: "डेटाबेस अनुपलब्ध" });

        // Ensure pristine clean initial backup exists
        const cleanInitialPath = path.join(__dirname, 'results_store_clean_initial.json');
        if (!fs.existsSync(cleanInitialPath)) {
            const cleanBackupPath = path.join(__dirname, 'results_store_backup_clean.json');
            if (fs.existsSync(cleanBackupPath)) {
                fs.copyFileSync(cleanBackupPath, cleanInitialPath);
            }
        }

        const targetWinners = {
            2: 'BJP', 3: 'BJP', 5: 'BJP', 7: 'BJP', 8: 'BJP', 10: 'BJP', 12: 'BJP', 14: 'BJP',
            16: 'BJP', 18: 'BJP', 21: 'BJP', 23: 'BJP', 25: 'BJP', 26: 'BJP', 28: 'BJP', 30: 'BJP',
            32: 'BJP', 33: 'BJP', 35: 'BJP',
            1: 'INC', 6: 'INC', 9: 'INC', 11: 'INC', 13: 'INC', 15: 'INC', 17: 'INC', 20: 'INC',
            22: 'INC', 27: 'INC', 29: 'INC', 34: 'INC',
            19: 'IND', 24: 'IND', 31: 'IND',
            4: 'AAP'
        };

        function getPartyCode(pName) {
            if (!pName) return 'OTH';
            const p = String(pName).toUpperCase();
            if (pName.includes('भारतीय') || p.includes('BJP')) return 'BJP';
            if (pName.includes('कांग्रेस') || p.includes('INC')) return 'INC';
            if (pName.includes('निर्दलीय') || p.includes('IND')) return 'IND';
            if (pName.includes('आम आदमी') || p.includes('AAP')) return 'AAP';
            return 'OTH';
        }

        let grandCountedVotes = 0;
        let grandPolledVotes = 0;

        store.wards.forEach(w => {
            grandPolledVotes += (w.total_polled_votes || 0);

            // Ward 26 is Unopposed (निर्विरोध)
            if (w.ward === 26 || w.isNirvirodh) {
                w.status = 'Declared';
                w.total_polled_votes = 0;
                w.totalPolledVotes = 0;
                w.total_counted_votes = 0;
                w.totalCountedVotes = 0;
                w.nota_votes = 0;
                w.notaVotes = 0;
                w.nota_votes_evm1 = 0;
                w.nota_votes_evm2 = 0;
                w.nota_rounds = [0];
                w.margin = 0;
                w.winner_name = 'वीणा देवड़ा';
                w.winnerName = 'वीणा देवड़ा';
                w.winner_party = 'भारतीय जनता पार्टी';
                w.winnerParty = 'भारतीय जनता पार्टी';
                w.winner_gender = 'F';
                w.winner_gender_hi = 'महिला';
                w.leader = {
                    id: 99,
                    name: 'वीणा देवड़ा',
                    party: 'भारतीय जनता पार्टी',
                    symbol: 'कमल',
                    totalVotes: 0,
                    total_votes: 0,
                    gender: 'F',
                    gender_hi: 'महिला'
                };
                w.runnerUp = null;
                if (w.candidates && w.candidates.length > 0) {
                    w.candidates[0].total_votes = 0;
                    w.candidates[0].totalVotes = 0;
                    w.candidates[0].isWinner = true;
                    w.candidates[0].is_winner = true;
                    w.candidates[0].isDeclared = true;
                    w.candidates[0].is_declared = true;
                    w.candidates[0].pct = 0;
                }
                return;
            }

            const polled = w.total_polled_votes || 500;
            const targetParty = targetWinners[w.ward] || 'BJP';
            const cands = w.candidates || [];
            const partCount = (w.parts && w.parts.length > 1) ? w.parts.length : 1;

            let winCand = cands.find(c => getPartyCode(c.party) === targetParty) || cands[0];
            const otherCands = cands.filter(c => c.id !== winCand.id);
            let runnerCand = otherCands.find(c => {
                const code = getPartyCode(c.party);
                return targetParty === 'BJP' ? code === 'INC' : code === 'BJP';
            }) || otherCands[0];

            const thirdCands = otherCands.filter(c => runnerCand && c.id !== runnerCand.id);

            const nota = Math.min(12, Math.max(3, Math.floor(polled * 0.012)));
            let availableVotes = polled - nota;

            let thirdVotesTotal = 0;
            thirdCands.forEach(tc => {
                const tv = Math.max(4, Math.floor((availableVotes * 0.10) / Math.max(1, thirdCands.length)));
                const postal = Math.min(1, Math.floor(tv * 0.05));
                const evmTotal = tv - postal;
                tc.total_votes = tv;
                tc.totalVotes = tv;
                tc.votes_postal = postal;
                tc.votesPostal = postal;
                if (partCount > 1) {
                    const r1 = Math.floor(evmTotal / 2);
                    const r2 = evmTotal - r1;
                    tc.votes_rounds = [r1, r2];
                    tc.votes_evm = r1;
                    tc.votesEvm = r1;
                    tc.votes_evm2 = r2;
                    tc.votesEvm2 = r2;
                } else {
                    tc.votes_rounds = [evmTotal];
                    tc.votes_evm = evmTotal;
                    tc.votesEvm = evmTotal;
                    tc.votes_evm2 = 0;
                    tc.votesEvm2 = 0;
                }
                thirdVotesTotal += tv;
            });

            availableVotes -= thirdVotesTotal;
            const margin = Math.min(Math.floor(availableVotes * 0.20), Math.max(35, Math.floor(availableVotes * 0.12)));
            let winVotes = Math.floor((availableVotes + margin) / 2);
            let runnerVotes = availableVotes - winVotes;

            if (runnerVotes >= winVotes) {
                winVotes = Math.ceil(availableVotes / 2) + 15;
                runnerVotes = availableVotes - winVotes;
            }

            // Assign votes to Winner
            const winPostal = Math.max(2, Math.min(6, Math.floor(winVotes * 0.02)));
            const winEvmTotal = winVotes - winPostal;
            winCand.total_votes = winVotes;
            winCand.totalVotes = winVotes;
            winCand.votes_postal = winPostal;
            winCand.votesPostal = winPostal;
            if (partCount > 1) {
                const r1 = Math.floor(winEvmTotal * 0.49);
                const r2 = winEvmTotal - r1;
                winCand.votes_rounds = [r1, r2];
                winCand.votes_evm = r1;
                winCand.votesEvm = r1;
                winCand.votes_evm2 = r2;
                winCand.votesEvm2 = r2;
            } else {
                winCand.votes_rounds = [winEvmTotal];
                winCand.votes_evm = winEvmTotal;
                winCand.votesEvm = winEvmTotal;
                winCand.votes_evm2 = 0;
                winCand.votesEvm2 = 0;
            }

            // Assign votes to Runner-up
            if (runnerCand) {
                const runnerPostal = Math.max(1, Math.min(3, Math.floor(runnerVotes * 0.015)));
                const runnerEvmTotal = runnerVotes - runnerPostal;
                runnerCand.total_votes = runnerVotes;
                runnerCand.totalVotes = runnerVotes;
                runnerCand.votes_postal = runnerPostal;
                runnerCand.votesPostal = runnerPostal;
                if (partCount > 1) {
                    const r1 = Math.floor(runnerEvmTotal * 0.49);
                    const r2 = runnerEvmTotal - r1;
                    runnerCand.votes_rounds = [r1, r2];
                    runnerCand.votes_evm = r1;
                    runnerCand.votesEvm = r1;
                    runnerCand.votes_evm2 = r2;
                    runnerCand.votesEvm2 = r2;
                } else {
                    runnerCand.votes_rounds = [runnerEvmTotal];
                    runnerCand.votes_evm = runnerEvmTotal;
                    runnerCand.votesEvm = runnerEvmTotal;
                    runnerCand.votes_evm2 = 0;
                    runnerCand.votesEvm2 = 0;
                }
            }

            // NOTA
            w.nota_votes = nota;
            w.notaVotes = nota;
            if (partCount > 1) {
                const n1 = Math.floor(nota / 2);
                const n2 = nota - n1;
                w.nota_rounds = [n1, n2];
                w.nota_votes_evm1 = n1;
                w.nota_votes_evm2 = n2;
            } else {
                w.nota_rounds = [nota];
                w.nota_votes_evm1 = nota;
                w.nota_votes_evm2 = 0;
            }

            const actualCounted = cands.reduce((s, c) => s + (c.total_votes || 0), 0) + nota;
            w.total_counted_votes = actualCounted;
            w.totalCountedVotes = actualCounted;
            grandCountedVotes += actualCounted;

            w.status = 'Declared';
            w.margin = winVotes - (runnerCand ? runnerCand.total_votes : 0);
            w.winner_id = winCand.id;
            w.winnerId = winCand.id;
            w.winner_name = winCand.name;
            w.winnerName = winCand.name;
            w.winner_party = winCand.party;
            w.winnerParty = winCand.party;

            const isF = (winCand.gender === 'F' || winCand.gender_hi === 'महिला' || winCand.name.includes('देवी') || winCand.name.includes('बाई') || winCand.name.includes('कंवर') || winCand.name.includes('श्रीमती') || winCand.name.includes('कविता') || winCand.name.includes('ममता') || winCand.name.includes('पुष्पा') || winCand.name.includes('पूजा') || winCand.name.includes('मंजु'));
            w.winner_gender = isF ? 'F' : 'M';
            w.winner_gender_hi = isF ? 'महिला' : 'पुरुष';

            w.leader = {
                id: winCand.id,
                name: winCand.name,
                party: winCand.party,
                totalVotes: winVotes,
                total_votes: winVotes,
                gender: w.winner_gender,
                gender_hi: w.winner_gender_hi
            };

            if (runnerCand) {
                const rIsF = (runnerCand.gender === 'F' || runnerCand.gender_hi === 'महिला' || runnerCand.name.includes('देवी') || runnerCand.name.includes('बाई') || runnerCand.name.includes('कंवर'));
                w.runnerUp = {
                    id: runnerCand.id,
                    name: runnerCand.name,
                    party: runnerCand.party,
                    totalVotes: runnerVotes,
                    total_votes: runnerVotes,
                    gender: rIsF ? 'F' : 'M',
                    gender_hi: rIsF ? 'महिला' : 'पुरुष'
                };
            }

            cands.forEach(c => {
                c.isWinner = (c.id === winCand.id);
                c.is_winner = c.isWinner;
                c.isDeclared = true;
                c.is_declared = true;
                c.pct = actualCounted > 0 ? Math.round((c.total_votes / actualCounted) * 1000) / 10 : 0;
            });

            w.updated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
            w.updatedAt = w.updated_at;
        });

        const tally = {
            BJP: { code: 'BJP', name: 'भारतीय जनता पार्टी', won: 0, leading: 0, total: 0, color: '#f97316' },
            INC: { code: 'INC', name: 'इण्डियन नेशनल कांग्रेस', won: 0, leading: 0, total: 0, color: '#0ea5e9' },
            IND: { code: 'IND', name: 'निर्दलीय', won: 0, leading: 0, total: 0, color: '#8b5cf6' },
            AAP: { code: 'AAP', name: 'आम आदमी पार्टी', won: 0, leading: 0, total: 0, color: '#eab308' },
            OTH: { code: 'OTH', name: 'अन्य', won: 0, leading: 0, total: 0, color: '#64748b' }
        };

        let maleWon = 0;
        let femaleWon = 0;

        store.wards.forEach(w => {
            const pCode = getPartyCode(w.winner_party);
            if (tally[pCode]) {
                tally[pCode].won++;
                tally[pCode].total++;
            }
            if (w.winner_gender === 'F') femaleWon++;
            else maleWon++;
        });

        store.tally = tally;
        store.genderTally = {
            male: { won: maleWon, leading: 0, total: maleWon },
            female: { won: femaleWon, leading: 0, total: femaleWon }
        };

        store.declared_count = 35;
        store.counting_count = 0;
        store.pending_count = 0;
        store.total_counted_votes = grandCountedVotes;
        store.total_polled_votes = grandPolledVotes;

        store.summary = {
            totalWards: 35,
            declaredWards: 35,
            countingWards: 0,
            pendingWards: 0,
            totalElectors: store.summary.totalElectors || 30598,
            totalPolledVotes: grandPolledVotes,
            totalCountedVotes: grandCountedVotes,
            countedPercentage: Math.round((grandCountedVotes / grandPolledVotes) * 1000) / 10,
            majorityMark: 18,
            partyTally: tally,
            genderTally: store.genderTally
        };

        store.timestamp = new Date().toISOString();
        saveResultsStore(store);

        broadcastUpdate('results_update', {
            ward: 'ALL',
            status: 'Declared',
            summary: store.summary
        });

        res.json({
            success: true,
            message: "समस्त 35 वार्डों एवं EVM चक्रों का डमी टेस्ट डेटा सफलतापूर्वक लोड हो गया है!",
            summary: store.summary
        });
    } catch(err) {
        console.error("Mock test error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Reset Counting Store back to initial / clean state (कल की मतगणना हेतु स्वच्छ रीसेट)
app.post('/api/results/reset-test', (req, res) => {
    try {
        const cleanInitialPath = path.join(__dirname, 'results_store_clean_initial.json');
        const cleanBackupPath = path.join(__dirname, 'results_store_backup_clean.json');
        const targetPath = fs.existsSync(cleanInitialPath) ? cleanInitialPath : cleanBackupPath;

        if (fs.existsSync(targetPath)) {
            const cleanData = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
            cleanData.timestamp = new Date().toISOString();
            saveResultsStore(cleanData);

            broadcastUpdate('results_update', {
                ward: 'ALL',
                status: 'Reset',
                summary: cleanData.summary
            });

            return res.json({
                success: true,
                message: "मतगणना डेटा कल की वास्तविक मतगणना हेतु प्रारंभिक स्वच्छ स्थिति (0 वोट, केवल वार्ड 26 निर्विरोध) में रीसेट हो गया है!",
                summary: cleanData.summary
            });
        } else {
            return res.status(404).json({ success: false, message: "प्रारंभिक बैकअप फाइल नहीं मिली" });
        }
    } catch(err) {
        console.error("Reset test error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
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
        console.log(` 🖥️  लोकल सर्वर:        http://localhost:${PORT}`);
        console.log(` 📱  कंट्रोल रूम Wi-Fi:  http://${localIP}:${PORT}`);
        console.log(` 💾  डेटाबेस:           SQLite (election_sumerpur.db)`);
        console.log(` ⚡  रियल-टाइम सिंक:   सक्रिय (Server-Sent Events)`);
        console.log(`=============================================================\n`);
    });
}).catch(err => {
    console.error("❌ Failed to initialize database:", err);
});
