// ==========================================================================
// 🏆 नगर पालिका सुमेरपुर आम चुनाव 2026 — मतगणना एवं परिणाम मॉड्यूल (results.js)
// ==========================================================================

let currentUser = null;
let resultsData = null;
let currentResultsFilter = 'all';
let currentCountingWard = 1;
let sseConnection = null;
let isProjectorModeActive = false;

// 1. Initialize on DOM Load
document.addEventListener("DOMContentLoaded", () => {
    initAuth();
    fetchResultsData();
    initSSE();

    // Auto-refresh results every 15 seconds as a fallback
    setInterval(() => {
        fetchResultsData(true);
    }, 15000);
});

// 2. Authentication & Role Handling (Shared with Main Portal)
function initAuth() {
    try {
        const stored = localStorage.getItem("currentUser");
        if (stored) {
            currentUser = JSON.parse(stored);
        }
    } catch(e) {
        currentUser = null;
    }
    updateAuthUI();
}

function updateAuthUI() {
    const authBtn = document.getElementById("headerAuthBtn");
    const adminActions = document.querySelectorAll(".auth-restricted");
    
    if (currentUser) {
        if (authBtn) {
            const roleLabel = currentUser.role === 'RO' ? 'RO (SDM)' : (currentUser.role.startsWith('OP') ? 'मतगणना ऑपरेटर' : 'पर्यवेक्षक');
            authBtn.innerHTML = `<i class="fas fa-user-shield"></i> ${currentUser.name || currentUser.username} (${roleLabel}) <span style="margin-left:6px; opacity:0.75; font-size:11px;">[लॉगआउट]</span>`;
            authBtn.className = "btn-secondary";
            authBtn.onclick = logoutUser;
        }
        adminActions.forEach(el => el.style.display = "");
    } else {
        if (authBtn) {
            authBtn.innerHTML = `<i class="fas fa-lock"></i> ऑपरेटर / RO लॉगिन`;
            authBtn.className = "btn-primary";
            authBtn.onclick = openAuthModal;
        }
        adminActions.forEach(el => el.style.display = "none");
    }
}

function openAuthModal() {
    const m = document.getElementById("authModal");
    if (m) m.style.display = "flex";
}

function closeAuthModal() {
    const m = document.getElementById("authModal");
    if (m) m.style.display = "none";
}

async function loginUser(e) {
    if (e) e.preventDefault();
    const u = document.getElementById("authUsername")?.value?.trim();
    const p = document.getElementById("authPassword")?.value?.trim();
    if (!u || !p) {
        alert("कृपया उपयोगकर्ता नाम और पासवर्ड दर्ज करें।");
        return;
    }

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        });
        const data = await res.json();
        if (data.success && data.user) {
            currentUser = data.user;
            localStorage.setItem("currentUser", JSON.stringify(currentUser));
            updateAuthUI();
            closeAuthModal();
            showToast(`✅ स्वागत है, ${currentUser.name || currentUser.username}! अधिकृत सत्र प्रारंभ।`);
            renderResultsGrid();
        } else {
            alert(`❌ लॉगिन विफल: ${data.message || 'अमान्य क्रेडेंशियल'}`);
        }
    } catch(err) {
        alert("सर्वर से संपर्क करने में त्रुटि: " + err.message);
    }
}

function logoutUser() {
    if (confirm("क्या आप वाकई लॉगआउट करना चाहते हैं?")) {
        currentUser = null;
        localStorage.removeItem("currentUser");
        updateAuthUI();
        showToast("ℹ️ आप सफलतापूर्वक लॉगआउट हो गए हैं।");
        renderResultsGrid();
    }
}

// 3. Real-Time Server-Sent Events (SSE)
function initSSE() {
    try {
        if (sseConnection) sseConnection.close();
        sseConnection = new EventSource('/api/stream');

        sseConnection.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'counting_update' || data.type === 'winner_declared' || data.type === 'results_update') {
                    console.log("⚡ Live Results Event received:", data);
                    fetchResultsData(true);
                    if (data.type === 'winner_declared') {
                        showToast(`🏆 वार्ड ${data.ward} का परिणाम घोषित: ${data.winner} (${data.party}) विजयी!`);
                    }
                }
            } catch(e) {}
        };

        sseConnection.onerror = () => {
            const syncStatus = document.getElementById("liveSyncBadge");
            if (syncStatus) {
                syncStatus.innerHTML = `<span class="badge" style="background:#dc2626; color:white;"><i class="fas fa-exclamation-triangle"></i> रिकनेक्टिंग...</span>`;
            }
        };

        sseConnection.onopen = () => {
            const syncStatus = document.getElementById("liveSyncBadge");
            if (syncStatus) {
                syncStatus.innerHTML = `<span class="badge" style="background:#15803d; color:white;"><i class="fas fa-bolt"></i> लाइव सिंक सक्रिय</span>`;
            }
        };
    } catch(err) {
        console.error("SSE Error:", err);
    }
}

// 4. Fetch Results & Tally Data
async function fetchResultsData(isBackground = false) {
    try {
        if (!isBackground) {
            const grid = document.getElementById("resultsGrid");
            if (grid && (!resultsData || !resultsData.wards)) {
                grid.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align:center; padding: 40px; color:#64748b;">
                        <i class="fas fa-spinner fa-spin fa-2x" style="color:var(--primary);"></i>
                        <div style="margin-top:10px; font-weight:600;">मतगणना एवं आधिकारिक परिणाम डेटा लोड हो रहा है...</div>
                    </div>
                `;
            }
        }

        const res = await fetch('/api/results/data');
        const data = await res.json();

        if (data.success) {
            resultsData = data;
            renderPartyTally(data.summary?.partyTally || data.tally);
            renderSummaryCards(data.summary);
            renderResultsGrid();
        }
    } catch(err) {
        console.error("Results fetch error:", err);
    }
}

// 5. Render Party Tally and Majority Status
function renderPartyTally(tally) {
    const container = document.getElementById("partyTallyContainer");
    if (!container || !tally) return;

    let html = '';
    const parties = ['BJP', 'INC', 'IND', 'AAP', 'OTH'];

    parties.forEach(code => {
        const item = tally[code] || { name: code, won: 0, leading: 0, total: 0, color: '#64748b' };
        html += `
            <div class="party-tally-card" style="border-top: 3.5px solid ${item.color};">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <div class="party-tally-name">${item.name}</div>
                        <div class="party-tally-code" style="color:${item.color};">${item.code || code}</div>
                    </div>
                    <div class="party-tally-seats">${item.won || 0}</div>
                </div>
                <div class="party-tally-meta">
                    <span>विजयी (Won): <b>${item.won || 0}</b></span>
                    <span>बढ़त (Lead): <b style="color:#0284c7;">${item.leading || 0}</b></span>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // Majority mark indicator (18 out of 35)
    const majorityEl = document.getElementById("majorityIndicatorText");
    if (majorityEl && resultsData && resultsData.summary) {
        const bjpWon = tally.BJP?.won || 0;
        const incWon = tally.INC?.won || 0;
        const indWon = tally.IND?.won || 0;
        
        let leadText = "बहुमत हेतु 18 सीटें आवश्यक (जादुई आंकड़ा)";
        if (bjpWon >= 18) {
            leadText = `🎉 भारतीय जनता पार्टी (BJP) ने ${bjpWon} सीटें जीतकर पूर्ण बहुमत हासिल किया!`;
        } else if (incWon >= 18) {
            leadText = `🎉 इण्डियन नेशनल कांग्रेस (INC) ने ${incWon} सीटें जीतकर पूर्ण बहुमत हासिल किया!`;
        } else if (indWon >= 18) {
            leadText = `🎉 निर्दलीय (IND) प्रत्याशियों ने ${indWon} सीटें जीतीं!`;
        }
        majorityEl.innerHTML = leadText;
    }
}

function renderSummaryCards(summary) {
    if (!summary) return;
    const decEl = document.getElementById("kpiDeclaredWards");
    const countEl = document.getElementById("kpiCountingWards");
    const pendEl = document.getElementById("kpiPendingWards");
    const totalCountedEl = document.getElementById("kpiTotalCountedVotes");
    const countedPctEl = document.getElementById("kpiCountedPercentage");

    if (decEl) decEl.innerText = summary.declaredWards || 0;
    if (countEl) countEl.innerText = summary.countingWards || 0;
    if (pendEl) pendEl.innerText = summary.pendingWards || 0;
    if (totalCountedEl) totalCountedEl.innerText = (summary.totalCountedVotes || 0).toLocaleString('hi-IN');
    if (countedPctEl) countedPctEl.innerText = (summary.countedPercentage || 0) + '%';
}

// 6. Render Ward Cards Grid
function renderResultsGrid() {
    const grid = document.getElementById("resultsGrid");
    if (!grid || !resultsData || !resultsData.wards) return;

    const searchTerm = document.getElementById("resultsSearchInput")?.value?.trim().toLowerCase() || '';
    
    let filtered = resultsData.wards;
    if (currentResultsFilter !== 'all') {
        filtered = filtered.filter(w => w.status === currentResultsFilter);
    }
    if (searchTerm) {
        filtered = filtered.filter(w => {
            const wNum = String(w.ward);
            const wLead = (w.leader ? w.leader.name : '').toLowerCase();
            const wWin = (w.winner_name || '').toLowerCase();
            const candMatch = w.candidates.some(c => c.name.toLowerCase().includes(searchTerm) || c.party.toLowerCase().includes(searchTerm));
            return wNum.includes(searchTerm) || wLead.includes(searchTerm) || wWin.includes(searchTerm) || candMatch;
        });
    }

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align:center; padding: 40px; background:white; border-radius:8px; border:1px solid #e2e8f0;">
                <i class="fas fa-filter fa-2x" style="color:#94a3b8;"></i>
                <h4 style="margin:12px 0 4px 0; color:#334155;">कोई परिणाम नहीं मिला</h4>
                <p style="color:#94a3b8; font-size:13px; margin:4px 0 0 0;">कृपया अन्य शब्द से खोजें या फ़िल्टर रीसेट करें।</p>
            </div>
        `;
        return;
    }

    let html = '';
    filtered.forEach(w => {
        const isDeclared = w.status === 'Declared';
        const isCounting = w.status === 'Counting';
        const isNirvirodh = (w.ward === 26);
        const parts = (w.parts && w.parts.length > 0) ? w.parts : [{ part: 1, polled_votes: w.total_polled_votes, name: `वार्ड ${w.ward} मतदान केंद्र` }];
        const partCount = parts.length;
        const isMultiRound = (partCount > 1);

        let statusBadge = '';
        if (isDeclared) {
            statusBadge = `<span class="badge" style="background:#15803d; color:white;"><i class="fas fa-check-circle"></i> ${isNirvirodh ? 'निर्विरोध' : 'घोषित'}</span>`;
        } else if (isCounting) {
            statusBadge = `<span class="badge" style="background:#d97706; color:white; animation: pulse 1.5s infinite;"><i class="fas fa-spinner fa-spin"></i> मतगणना जारी</span>`;
        } else {
            statusBadge = `<span class="badge" style="background:#64748b; color:white;"><i class="far fa-clock"></i> प्रतीक्षारत</span>`;
        }

        let bannerHtml = '';
        if (isDeclared && w.winner_name) {
            const marginText = isNirvirodh ? 'निर्विरोध निर्वाचित' : (w.margin > 0 ? `${w.margin} मतों से विजयी` : 'विजयी घोषित');
            bannerHtml = `
                <div class="result-banner winner">
                    <div style="font-size: 13.5px; font-weight: 800; display:flex; align-items:center; gap:6px;">
                        <i class="fas fa-trophy" style="color:#eab308; font-size:16px;"></i>
                        <span>विजेता: ${w.winner_name}</span>
                    </div>
                    <div style="font-size: 11.5px; margin-top:2px; opacity:0.9;">
                        दल: <b>${w.winner_party}</b> | <b>${marginText}</b>
                    </div>
                </div>
            `;
        } else if (isCounting && w.leader) {
            bannerHtml = `
                <div class="result-banner lead">
                    <div style="font-size: 13px; font-weight: 700; display:flex; align-items:center; gap:6px;">
                        <i class="fas fa-chart-line" style="color:#0284c7;"></i>
                        <span>अग्रणी: ${w.leader.name} (${getPartyShortLabel(w.leader.party)})</span>
                    </div>
                    <div style="font-size: 11.5px; margin-top:2px; opacity:0.9;">
                        बढ़त: <b>${w.margin} मतों से आगे</b>
                    </div>
                </div>
            `;
        }

        // Candidates Rows
        const maxVotesInWard = Math.max(...w.candidates.map(c => c.total_votes || 0), 1);
        let candidateRowsHtml = '';

        w.candidates.forEach(c => {
            const isWinnerCand = Boolean(c.is_winner);
            const partyCls = getPartyCssClass(c.party);
            const partyShort = getPartyShortLabel(c.party);
            const votePct = w.total_counted_votes > 0 ? ((c.total_votes / w.total_counted_votes) * 100).toFixed(1) : 0;
            const barWidth = maxVotesInWard > 0 ? ((c.total_votes / maxVotesInWard) * 100).toFixed(1) : 0;

            let voteBreakdown = '';
            if (!isNirvirodh && w.total_counted_votes > 0) {
                const postalText = c.votes_postal ? ` + ${c.votes_postal} डाक` : '';
                if (isMultiRound) {
                    const rVotes = (c.votes_rounds && c.votes_rounds.length) ? c.votes_rounds : [c.votes_evm || 0, c.votes_evm2 || 0];
                    const rStr = rVotes.slice(0, partCount).map((v, idx) => `रा. ${idx + 1}: ${v || 0}`).join(' + ');
                    voteBreakdown = `<div style="font-size:10px; color:#64748b;">${votePct}% (${rStr}${postalText})</div>`;
                } else {
                    voteBreakdown = `<div style="font-size:10.5px; color:#64748b;">${votePct}% (${c.votes_evm || 0} EVM + ${c.votes_postal || 0} डाक)</div>`;
                }
            }

            candidateRowsHtml += `
                <div class="candidate-row ${isWinnerCand ? 'winner-highlight' : ''}">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:11px; font-weight:700; color:#64748b; min-width:18px;">${c.candidate_no}.</span>
                            <div>
                                <span style="font-size:13px; font-weight:700; color:#1e293b;">
                                    ${c.name}
                                    ${isWinnerCand ? ' <i class="fas fa-crown" style="color:#eab308;" title="विजेता"></i>' : ''}
                                </span>
                                <div style="font-size:11px; color:#64748b; margin-top:1px;">
                                    <span class="party-tag ${partyCls}" style="font-size:10px; padding:1px 6px;">${partyShort}</span>
                                    <span style="margin-left:4px;">प्रतीक: <b>${c.symbol}</b></span>
                                </div>
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:14px; font-weight:800; color:${isWinnerCand ? '#15803d' : '#0f172a'};">
                                ${isNirvirodh ? 'निर्विरोध' : (c.total_votes || 0).toLocaleString('hi-IN')}
                            </div>
                            ${voteBreakdown}
                        </div>
                    </div>
                    ${!isNirvirodh && w.total_counted_votes > 0 ? `
                        <div style="height:4px; background:#f1f5f9; border-radius:2px; overflow:hidden;">
                            <div style="width:${barWidth}%; height:100%; background:${isWinnerCand ? '#10b981' : '#94a3b8'}; transition:width 0.3s ease;"></div>
                        </div>
                    ` : ''}
                </div>
            `;
        });

        if (w.nota_votes > 0) {
            let notaBreakdown = '';
            if (isMultiRound) {
                const nRounds = (w.nota_rounds && w.nota_rounds.length) ? w.nota_rounds : [w.nota_votes_evm1 || 0, w.nota_votes_evm2 || 0];
                notaBreakdown = ` <span style="font-size:10px; font-weight:normal; color:#64748b;">(${nRounds.slice(0, partCount).map((v, idx) => `रा. ${idx + 1}: ${v || 0}`).join(' + ')})</span>`;
            }
            candidateRowsHtml += `
                <div class="candidate-row" style="opacity:0.85; background:#fafafa;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:12px; color:#64748b; font-weight:600;"><i class="fas fa-ban"></i> NOTA (उपरोक्त में से कोई नहीं)</span>
                        <span style="font-size:12px; font-weight:700; color:#475569;">${w.nota_votes} मत${notaBreakdown}</span>
                    </div>
                </div>
            `;
        }

        const canEdit = currentUser && (currentUser.role === 'RO' || currentUser.role.startsWith('OP'));
        const actionsHtml = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:10px; flex-wrap:wrap; gap:6px;">
                <div style="font-size:11px; color:#64748b;">
                    टेबल नं: <b>${w.counting_table_no || 1}</b> | कुल गिने: <b>${(w.total_counted_votes || 0).toLocaleString('hi-IN')}</b>
                </div>
                <div style="display:flex; gap:6px;">
                    ${isDeclared ? `
                        <button class="btn-primary" style="padding:4px 10px; font-size:11px; background:#0f172a; border-color:#0f172a;" onclick="openForm21Certificate(${w.ward})">
                            <i class="fas fa-award"></i> प्ररूप 21
                        </button>
                    ` : ''}
                    ${canEdit ? `
                        <button class="btn-secondary" style="padding:4px 10px; font-size:11px; font-weight:600; background:#fff7ed; border-color:#fdba74; color:#c2410c;" onclick="openCountingEntryModal(${w.ward})">
                            <i class="fas fa-pen-to-square"></i> गणना प्रविष्टि
                        </button>
                    ` : ''}
                </div>
            </div>
        `;

        const partsMetaStr = isMultiRound 
            ? `<br><span style="color:#0284c7; font-size:11px; font-weight:600;"><i class="fas fa-table-list"></i> ${parts.map((p, idx) => `राउंड ${idx + 1} (भाग ${p.part}): <b>${(p.polled_votes || 0).toLocaleString('hi-IN')} मत</b>`).join(' | ')}</span>`
            : '';

        html += `
            <div class="ward-card" id="wardCard_${w.ward}">
                <div class="ward-card-header">
                    <div class="ward-title">
                        वार्ड संख्या ${w.ward}
                        ${isMultiRound ? `<span class="badge" style="background:#0284c7; color:white; font-size:10.5px; margin-left:6px; vertical-align:middle;"><i class="fas fa-rotate"></i> ${partCount} चक्र (राउंड 1 से ${partCount})</span>` : ''}
                        <div class="ward-meta">
                            मतदाता: <b>${w.total_electors.toLocaleString('hi-IN')}</b> | 
                            11-09 पोल: <b>${w.total_polled_votes.toLocaleString('hi-IN')}</b> (${((w.total_polled_votes / w.total_electors) * 100).toFixed(1)}%)
                            ${partsMetaStr}
                        </div>
                    </div>
                    <div>${statusBadge}</div>
                </div>
                <div class="ward-card-body">
                    ${bannerHtml}
                    <div style="margin-top:8px;">
                        ${candidateRowsHtml}
                    </div>
                    ${actionsHtml}
                </div>
            </div>
        `;
    });

    grid.innerHTML = html;
}

// 7. Results Filters
function filterResults(filterType) {
    currentResultsFilter = filterType;
    ['resFilterAll', 'resFilterDeclared', 'resFilterCounting', 'resFilterPending'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.className = 'btn-secondary';
    });

    if (filterType === 'all') document.getElementById('resFilterAll').className = 'btn-primary';
    else if (filterType === 'Declared') document.getElementById('resFilterDeclared').className = 'btn-primary';
    else if (filterType === 'Counting') document.getElementById('resFilterCounting').className = 'btn-primary';
    else if (filterType === 'Yet to Start') document.getElementById('resFilterPending').className = 'btn-primary';

    renderResultsGrid();
}

function applyResultsFilter() {
    renderResultsGrid();
}

// 8. Projector / TV Fullscreen Mode
function toggleProjectorMode() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
            isProjectorModeActive = true;
            document.body.classList.add("projector-mode-active");
            showToast("📺 फुलस्क्रीन टीवी / प्रोजेक्टर डिस्प्ले सक्रिय!");
        }).catch(err => {
            alert("फुलस्क्रीन आरंभ करने में त्रुटि: " + err.message);
        });
    } else {
        document.exitFullscreen().then(() => {
            isProjectorModeActive = false;
            document.body.classList.remove("projector-mode-active");
        });
    }
}

// 9. Dynamic Parts / Rounds Counting Entry Modal
function openCountingEntryModal(targetWard = 1) {
    if (!currentUser || (!currentUser.role.startsWith('OP') && currentUser.role !== 'RO')) {
        alert("🔒 मतगणना प्रविष्टि केवल अधिकृत चुनाव ड्यूटी कार्मिकों अथवा SDM द्वारा ही की जा सकती है।");
        openAuthModal();
        return;
    }

    if (!resultsData || !resultsData.wards) {
        fetchResultsData(false).then(() => openCountingEntryModal(targetWard));
        return;
    }

    const wardSelect = document.getElementById("countingWardSelect");
    if (wardSelect) {
        wardSelect.innerHTML = '';
        resultsData.wards.forEach(w => {
            const opt = document.createElement("option");
            opt.value = w.ward;
            const statusIcon = w.status === 'Declared' ? '🏆 ' : (w.status === 'Counting' ? '⚡ ' : '⏳ ');
            opt.innerText = `${statusIcon}वार्ड संख्या ${w.ward} (${w.status})`;
            wardSelect.appendChild(opt);
        });
        wardSelect.value = targetWard;
    }

    onCountingWardSelected(targetWard);
    document.getElementById("countingEntryModal").style.display = "flex";
}

function onCountingWardSelected(wardNo) {
    currentCountingWard = parseInt(wardNo);
    if (!resultsData || !resultsData.wards) return;

    const ward = resultsData.wards.find(w => w.ward === currentCountingWard);
    if (!ward) return;

    const parts = (ward.parts && ward.parts.length > 0) ? ward.parts : [{ part: 1, polled_votes: ward.total_polled_votes, name: `वार्ड ${ward.ward} मतदान केंद्र` }];
    const partCount = parts.length;
    const isMultiRound = (partCount > 1);

    const electorsEl = document.getElementById("cModalElectors");
    const polledEl = document.getElementById("cModalPolled");
    const statusEl = document.getElementById("cModalStatus");
    if (electorsEl) electorsEl.innerText = ward.total_electors.toLocaleString('hi-IN');
    if (polledEl) polledEl.innerText = ward.total_polled_votes.toLocaleString('hi-IN');
    if (statusEl) statusEl.innerText = ward.status;

    // Dynamic Parts Notice Banner
    const partsNotice = document.getElementById("cModalPartsNotice");
    if (partsNotice) {
        partsNotice.style.display = "block";
        if (isMultiRound) {
            const partsSummary = parts.map((p, idx) => `<b>राउंड ${idx + 1} (भाग ${p.part}):</b> ${p.name || `बूथ ${p.booth_no}`} &mdash; <b>${(p.polled_votes || 0).toLocaleString('hi-IN')} मत</b>`).join('<br>');
            partsNotice.innerHTML = `
                <div style="font-weight: 700; margin-bottom: 4px; color: #1e3a8a; display: flex; align-items: center; gap: 6px;">
                    <i class="fas fa-layer-group" style="color:#0284c7;"></i>
                    वार्ड ${ward.ward} आधिकारिक चक्रवार मतगणना (${partCount} राउंड / भाग):
                </div>
                <div style="font-size: 11.5px; line-height: 1.6; color: #1e40af;">
                    ${partsSummary}
                    <div style="margin-top: 3px; font-weight: bold; border-top: 1px dashed #bfdbfe; padding-top: 3px;">
                        कुल मतदान दिवस मत: ${(ward.total_polled_votes || 0).toLocaleString('hi-IN')} मत
                    </div>
                </div>
            `;
        } else {
            const p = parts[0];
            partsNotice.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
                    <span><i class="fas fa-vote-yea" style="color:#0284c7; margin-right:4px;"></i> <b>वार्ड ${ward.ward} (1 चक्र / 1 राउंड):</b> भाग ${p.part}: ${p.name || ''}</span>
                    <span>मतदान दिवस मत लक्ष्य: <b>${(p.polled_votes || 0).toLocaleString('hi-IN')} मत</b></span>
                </div>
            `;
        }
    }

    // Dynamic table header based on parts count
    const thead = document.getElementById("countingCandidatesTableHead");
    if (thead) {
        let thRounds = '';
        for (let i = 1; i <= partCount; i++) {
            const pt = parts[i - 1];
            const pVotes = pt ? (pt.polled_votes || 0) : 0;
            const bg = (i % 2 === 1) ? '#e0f2fe' : '#dbeafe';
            const color = (i % 2 === 1) ? '#0369a1' : '#1e40af';
            thRounds += `
                <th style="min-width: 115px; background: ${bg}; color: ${color}; text-align: center;">
                    <i class="fas fa-rotate"></i> राउंड ${i} (भाग ${pt ? pt.part : i})
                    <div style="font-size: 10px; font-weight: normal; opacity: 0.9;">${pVotes.toLocaleString('hi-IN')} मत लक्ष्य</div>
                </th>
            `;
        }
        thead.innerHTML = `
            <tr>
                <th style="width: 35px;">क्र.</th>
                <th>प्रत्याशी का नाम</th>
                <th>सम्बद्ध दल</th>
                <th>प्रतीक</th>
                ${thRounds}
                <th style="width: 95px; text-align: center;">डाक मत</th>
                <th style="width: 105px; background: #f8fafc; text-align: center;">कुल मत</th>
            </tr>
        `;
    }

    // Dynamic table body
    const tbody = document.getElementById("countingCandidatesTableBody");
    if (tbody) {
        tbody.innerHTML = '';
        ward.candidates.forEach(c => {
            const tr = document.createElement("tr");
            tr.id = `c_row_${c.id}`;
            const rVotes = (c.votes_rounds && c.votes_rounds.length) ? c.votes_rounds : [c.votes_evm || 0, c.votes_evm2 || 0];
            
            let tdRounds = '';
            for (let i = 1; i <= partCount; i++) {
                const rVal = (rVotes[i - 1] !== undefined) ? rVotes[i - 1] : (i === 1 ? (c.votes_evm || 0) : (i === 2 ? (c.votes_evm2 || 0) : 0));
                const bg = (i % 2 === 1) ? '#f0f9ff' : '#eff6ff';
                const border = (i % 2 === 1) ? '#7dd3fc' : '#93c5fd';
                tdRounds += `
                    <td style="background: ${bg}; text-align: center;">
                        <input type="number" id="c_round_${c.id}_${i}" class="form-control cand-round-input" 
                               data-cand-id="${c.id}" data-round="${i}" value="${rVal}" min="0" 
                               placeholder="राउंड ${i}" style="text-align:center; font-weight:700; border-color:${border};" 
                               oninput="recalcCountingTotals()">
                    </td>
                `;
            }

            tr.innerHTML = `
                <td><b>${c.candidate_no}</b></td>
                <td style="text-align:left;">
                    <b>${c.name}</b>
                    ${c.is_winner ? ' <i class="fas fa-crown" style="color:#eab308;"></i>' : ''}
                </td>
                <td style="text-align:left;">
                    <span class="party-tag ${getPartyCssClass(c.party)}">${getPartyShortLabel(c.party)}</span>
                </td>
                <td><b>${c.symbol}</b></td>
                ${tdRounds}
                <td style="text-align: center;">
                    <input type="number" id="c_postal_${c.id}" class="form-control cand-postal-input" 
                           data-cand-id="${c.id}" value="${c.votes_postal || 0}" min="0" 
                           style="text-align:center;" oninput="recalcCountingTotals()">
                </td>
                <td style="background: #f8fafc; text-align: center;">
                    <span id="c_tot_${c.id}" style="font-weight:800; font-size:14px; color:#0f172a;">${c.total_votes || 0}</span>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Dynamic NOTA Inputs
    const notaContainer = document.getElementById("countingNotaContainer");
    if (notaContainer) {
        const notaRounds = (ward.nota_rounds && ward.nota_rounds.length) ? ward.nota_rounds : [ward.nota_votes_evm1 || ward.nota_votes || 0, ward.nota_votes_evm2 || 0];
        let notaInputsHtml = '';
        if (isMultiRound) {
            for (let i = 1; i <= partCount; i++) {
                const pt = parts[i - 1];
                const nVal = (notaRounds[i - 1] !== undefined) ? notaRounds[i - 1] : 0;
                notaInputsHtml += `
                    <div>
                        <label style="font-size: 11px; font-weight: bold; color: #92400e;">NOTA (राउंड ${i} - भाग ${pt ? pt.part : i}):</label>
                        <input type="number" id="c_nota_round_${i}" class="form-control nota-round-input" 
                               data-round="${i}" value="${nVal}" min="0" oninput="recalcCountingTotals()">
                    </div>
                `;
            }
            notaInputsHtml += `
                <div>
                    <label style="font-size: 11px; font-weight: bold; color: #92400e;">कुल NOTA मत:</label>
                    <input type="number" id="countingNotaTotal" class="form-control" value="${ward.nota_votes || 0}" readonly style="background:#f1f5f9; font-weight:bold;">
                </div>
            `;
        } else {
            notaInputsHtml += `
                <div>
                    <label style="font-size: 11.5px; font-weight: bold; color: #92400e;">NOTA मत:</label>
                    <input type="number" id="c_nota_round_1" class="form-control nota-round-input" 
                           data-round="1" value="${ward.nota_votes || 0}" min="0" oninput="recalcCountingTotals()">
                </div>
            `;
        }

        notaInputsHtml += `
            <div>
                <label style="font-size: 11.5px; font-weight: bold; color: #92400e;">निविदत्त मत (Tendered):</label>
                <input type="number" id="countingTenderedVotes" class="form-control" value="${ward.tendered_votes || 0}" min="0">
            </div>
            <div>
                <label style="font-size: 11.5px; font-weight: bold; color: #92400e;">अस्वीकृत मत (Rejected):</label>
                <input type="number" id="countingRejectedVotes" class="form-control" value="${ward.rejected_votes || 0}" min="0">
            </div>
        `;

        notaContainer.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap: 10px;">
                ${notaInputsHtml}
            </div>
        `;
    }

    document.getElementById("countingTableNo").value = ward.counting_table_no || 1;
    document.getElementById("countingStatusSelect").value = ward.status === 'Declared' ? 'Declared' : 'Counting';

    recalcCountingTotals();
}

function recalcCountingTotals() {
    if (!resultsData || !resultsData.wards) return;
    const ward = resultsData.wards.find(w => w.ward === currentCountingWard);
    if (!ward) return;

    const parts = (ward.parts && ward.parts.length > 0) ? ward.parts : [{ part: 1, polled_votes: ward.total_polled_votes }];
    const partCount = parts.length;
    const isMultiRound = (partCount > 1);

    let candidateSums = [];
    let grandCandidateTotal = 0;
    const roundTotals = new Array(partCount).fill(0);

    ward.candidates.forEach(c => {
        let candRoundSum = 0;
        for (let i = 1; i <= partCount; i++) {
            const rEl = document.getElementById(`c_round_${c.id}_${i}`);
            const rVal = parseInt(rEl ? rEl.value : 0) || 0;
            candRoundSum += rVal;
            roundTotals[i - 1] += rVal;
        }

        const postalEl = document.getElementById(`c_postal_${c.id}`);
        const postal = parseInt(postalEl ? postalEl.value : 0) || 0;
        const tot = candRoundSum + postal;

        const totEl = document.getElementById(`c_tot_${c.id}`);
        if (totEl) totEl.innerText = tot.toLocaleString('hi-IN');
        grandCandidateTotal += tot;
        candidateSums.push({ id: c.id, name: c.name, party: c.party, total: tot });
    });

    let totalNota = 0;
    for (let i = 1; i <= partCount; i++) {
        const nEl = document.getElementById(`c_nota_round_${i}`);
        const nVal = parseInt(nEl ? nEl.value : 0) || 0;
        totalNota += nVal;
        roundTotals[i - 1] += nVal;
    }

    const nTotEl = document.getElementById("countingNotaTotal");
    if (nTotEl) nTotEl.value = totalNota;

    const grandCounted = grandCandidateTotal + totalNota;

    // Live Round-by-Round Breakdown Status Strip
    const breakdownStrip = document.getElementById("countingRoundBreakdownStrip");
    if (breakdownStrip) {
        if (isMultiRound) {
            breakdownStrip.style.display = "block";
            const roundPills = parts.map((p, idx) => {
                const rCounted = roundTotals[idx];
                const rTarget = p.polled_votes || 0;
                const rDiff = rCounted - rTarget;
                let statusColor = '#16a34a';
                let icon = '<i class="fas fa-check"></i>';
                let tag = `100% मिलान`;
                if (rDiff !== 0) {
                    statusColor = rDiff > 0 ? '#dc2626' : '#d97706';
                    icon = '<i class="fas fa-info-circle"></i>';
                    tag = `अंतर: ${rDiff > 0 ? '+' : ''}${rDiff}`;
                }
                return `
                    <div style="background: white; border: 1px solid #e2e8f0; border-radius: 4px; padding: 4px 8px; flex: 1; min-width: 140px;">
                        <span style="font-weight: 700; color: #1e40af;">राउंड ${idx + 1} (भाग ${p.part}):</span>
                        <span style="font-weight: 800; margin-left: 4px;">${rCounted}</span> / ${rTarget} मत
                        <span style="color: ${statusColor}; font-weight: 600; font-size: 11px; margin-left: 4px;">${icon} ${tag}</span>
                    </div>
                `;
            }).join('');

            breakdownStrip.innerHTML = `
                <div style="font-weight: 700; color: #475569; margin-bottom: 6px; display: flex; align-items: center; gap: 4px;">
                    <i class="fas fa-calculator" style="color: #0284c7;"></i> चक्रवार मतगणना प्रगति एवं पोल मिलान:
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    ${roundPills}
                </div>
            `;
        } else {
            breakdownStrip.style.display = "none";
        }
    }

    const totalCountedEl = document.getElementById("countingModalTotalCounted");
    if (totalCountedEl) {
        let diffText = '';
        if (ward.total_polled_votes > 0) {
            const diff = grandCounted - ward.total_polled_votes;
            if (diff === 0) {
                diffText = ` <span style="color:#16a34a; font-size:12px; font-weight:600;"><i class="fas fa-check"></i> (100% मिलान - ${ward.total_polled_votes} मत)</span>`;
            } else if (grandCounted > 0) {
                diffText = ` <span style="color:${diff > 0 ? '#dc2626' : '#d97706'}; font-size:12px; font-weight:600;">(पोल: ${ward.total_polled_votes} | अंतर: ${diff > 0 ? '+' : ''}${diff})</span>`;
            }
        }
        totalCountedEl.innerHTML = `${grandCounted.toLocaleString('hi-IN')} मत ${diffText}`;
    }

    candidateSums.sort((a,b) => b.total - a.total);
    const marginEl = document.getElementById("countingModalMarginText");
    if (marginEl) {
        if (candidateSums.length > 1 && candidateSums[0].total > 0) {
            const margin = candidateSums[0].total - candidateSums[1].total;
            marginEl.innerHTML = `अग्रणी: <b>${candidateSums[0].name}</b> (+${margin} मत बढ़त)`;
        } else if (candidateSums.length === 1) {
            marginEl.innerText = "एकमात्र प्रत्याशी (निर्विरोध)";
        } else {
            marginEl.innerText = "";
        }
    }
}

async function saveCountingData() {
    if (!resultsData || !resultsData.wards) return;
    const ward = resultsData.wards.find(w => w.ward === currentCountingWard);
    if (!ward) return;

    const parts = (ward.parts && ward.parts.length > 0) ? ward.parts : [{ part: 1, polled_votes: ward.total_polled_votes }];
    const partCount = parts.length;

    const candidateVotes = ward.candidates.map(c => {
        const rounds = [];
        for (let i = 1; i <= partCount; i++) {
            const rEl = document.getElementById(`c_round_${c.id}_${i}`);
            rounds.push(parseInt(rEl ? rEl.value : 0) || 0);
        }
        const postalEl = document.getElementById(`c_postal_${c.id}`);
        return {
            id: c.id,
            votes_rounds: rounds,
            votes_evm: rounds[0] || 0,
            votes_evm2: rounds[1] || 0,
            votes_postal: parseInt(postalEl ? postalEl.value : 0) || 0
        };
    });

    const nota_rounds = [];
    let total_nota = 0;
    for (let i = 1; i <= partCount; i++) {
        const nEl = document.getElementById(`c_nota_round_${i}`);
        const nVal = parseInt(nEl ? nEl.value : 0) || 0;
        nota_rounds.push(nVal);
        total_nota += nVal;
    }

    const tendered_votes = parseInt(document.getElementById("countingTenderedVotes")?.value) || 0;
    const rejected_votes = parseInt(document.getElementById("countingRejectedVotes")?.value) || 0;
    const status = document.getElementById("countingStatusSelect").value;
    const counting_table_no = parseInt(document.getElementById("countingTableNo")?.value) || 1;

    if (status === 'Declared') {
        const isConfirm = confirm(`⚠️ क्या आप वाकई वार्ड संख्या ${ward.ward} का परिणाम "आधिकारिक घोषित (Declared)" करना चाहते हैं?\n\nयह कार्यवाही मुख्य दलगत स्थिति और जादुई आंकड़े (18 सीटें) में विजेता सीट जोड़ देगी एवं प्ररूप 21 निर्वाचन प्रमाण-पत्र जारी करेगी।`);
        if (!isConfirm) return;
    }

    try {
        showToast("⏳ मतगणना डेटा सुरक्षित हो रहा है...");
        const res = await fetch('/api/counting/update-ward', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ward: currentCountingWard,
                candidateVotes,
                nota_votes: total_nota,
                nota_votes_evm1: nota_rounds[0] || 0,
                nota_votes_evm2: nota_rounds[1] || 0,
                nota_rounds,
                tendered_votes,
                rejected_votes,
                status,
                counting_table_no,
                operator_username: currentUser ? currentUser.username : 'op_counting'
            })
        });

        const data = await res.json();
        if (data.success) {
            closeCountingEntryModal();
            showToast(`✅ वार्ड ${currentCountingWard} का मतगणना डेटा सुरक्षित व प्रसारित हुआ!`);
            await fetchResultsData(false);
        } else {
            alert(`❌ त्रुटि: ${data.message}`);
        }
    } catch(err) {
        alert("सर्वर से संपर्क करने में त्रुटि: " + err.message);
    }
}

function closeCountingEntryModal() {
    document.getElementById("countingEntryModal").style.display = "none";
}

// 10. Form 21 Certificate of Election Generator
async function openForm21Certificate(wardNo) {
    try {
        showToast("📄 निर्वाचन प्रमाण-पत्र तैयार हो रहा है...");
        const res = await fetch(`/api/results/certificate/${wardNo}`);
        const data = await res.json();

        if (!data.success || !data.certificate) {
            alert("❌ इस वार्ड का परिणाम अभी घोषित नहीं हुआ है।");
            return;
        }

        const c = data.certificate;
        const printArea = document.getElementById("form21PrintArea");
        if (!printArea) return;

        const isNirvirodh = (c.ward === 26);
        const marginHindi = isNirvirodh 
            ? "निर्विरोध (निर्वाचन बिना किसी प्रतिद्वंदी के सम्पन्न हुआ)" 
            : `${(c.margin || 0).toLocaleString('hi-IN')} मतों के अंतर से`;

        printArea.innerHTML = `
            <div class="form21-container">
                <div class="form21-header">
                    <h4>राजस्थान नगरपालिका (निर्वाचन) नियम, 1994</h4>
                    <h3>प्ररूप - 21 (FORM 21)</h3>
                    <p style="font-size:13px; margin:2px 0;">[नियम 66 देखिए]</p>
                    <h2 style="margin: 8px 0; text-decoration: underline;">निर्वाचन का प्रमाण-पत्र (CERTIFICATE OF ELECTION)</h2>
                </div>

                <div class="form21-body" style="font-size:14px; line-height: 2; margin: 24px 0;">
                    <p>
                        मैं, <b>कालुराम कुम्हार (आर.ए.एस.)</b>, रिटर्निंग अधिकारी (उपखण्ड मजिस्ट्रेट), नगर पालिका सुमेरपुर, एतद्द्वारा प्रमाणित करता हूँ कि सुमेरपुर नगर पालिका के <b>वार्ड संख्या ${c.ward}</b> के साधारण निर्वाचन में सम्यक् रूप से लड़े गए चुनाव में निम्नलिखित प्रत्याशी को निर्वाचित घोषित किया गया है:
                    </p>

                    <div style="background:#f8fafc; border:1px solid #cbd5e1; padding: 14px 18px; margin: 16px 0; border-radius: 6px;">
                        <table style="width:100%; font-size:14px; border-collapse:collapse;">
                            <tr>
                                <td style="width:30%; padding:6px 0; color:#475569;"><b>निर्वाचित सदस्य का नाम:</b></td>
                                <td style="padding:6px 0; font-size:16px; font-weight:800; color:#0f172a;">${c.winner_name}</td>
                            </tr>
                            <tr>
                                <td style="padding:6px 0; color:#475569;"><b>सम्बद्ध राजनीतिक दल:</b></td>
                                <td style="padding:6px 0; font-weight:700;">${c.winner_party}</td>
                            </tr>
                            <tr>
                                <td style="padding:6px 0; color:#475569;"><b>आवंटित चुनाव प्रतीक:</b></td>
                                <td style="padding:6px 0; font-weight:700;">${c.winner_symbol || 'आवंटित प्रतीक'}</td>
                            </tr>
                            <tr>
                                <td style="padding:6px 0; color:#475569;"><b>निवास का पता:</b></td>
                                <td style="padding:6px 0;">${c.winner_address || `वार्ड संख्या ${c.ward}, सुमेरपुर`}</td>
                            </tr>
                            <tr>
                                <td style="padding:6px 0; color:#475569;"><b>प्राप्त कुल विधिमान्य मत:</b></td>
                                <td style="padding:6px 0; font-weight:800; color:#15803d;">${(c.total_votes || 0).toLocaleString('hi-IN')} मत</td>
                            </tr>
                            <tr>
                                <td style="padding:6px 0; color:#475569;"><b>जीत का अंतर (Margin):</b></td>
                                <td style="padding:6px 0; font-weight:700; color:#0369a1;">${marginHindi}</td>
                            </tr>
                        </table>
                    </div>

                    <p style="margin-top: 16px;">
                        तथा उक्त <b>${c.winner_name}</b> को नगर पालिका सुमेरपुर के <b>वार्ड संख्या ${c.ward}</b> से सदस्य के रूप में सम्यक् रूप से निर्वाचित घोषित किए जाने के साक्ष्य स्वरूप यह प्रमाण-पत्र दिया गया है।
                    </p>
                </div>

                <div class="form21-footer" style="display:flex; justify-content:space-between; align-items:flex-end; margin-top: 45px; padding-top: 20px;">
                    <div style="font-size:12.5px;">
                        <div>स्थान: <b>सुमेरपुर (पाली, राजस्थान)</b></div>
                        <div>तारीख: <b>14 सितम्बर 2026</b></div>
                        <div style="margin-top:8px; font-size:11px; color:#64748b;">(कार्यालयीन मोहर)</div>
                    </div>
                    <div style="text-align:center; font-size:13px;">
                        <div style="border-bottom:1px solid #334155; width:200px; margin-bottom:8px; height:35px;"></div>
                        <b>कालुराम कुम्हार, आर.ए.एस.</b><br>
                        रिटर्निंग अधिकारी (उपखण्ड मजिस्ट्रेट)<br>
                        नगर पालिका आम चुनाव 2026, सुमेरपुर
                    </div>
                </div>
            </div>
        `;

        document.getElementById("form21Modal").style.display = "flex";
    } catch(err) {
        alert("प्रमाण-पत्र प्राप्त करने में त्रुटि: " + err.message);
    }
}

function printForm21Certificate() {
    window.print();
}

function closeForm21Certificate() {
    document.getElementById("form21Modal").style.display = "none";
}

// 11. Helpers
function getPartyCssClass(partyName) {
    if (!partyName) return 'party-oth';
    if (partyName.includes('भारतीय जनता') || partyName.includes('BJP')) return 'party-bjp';
    if (partyName.includes('कांग्रेस') || partyName.includes('INC')) return 'party-inc';
    if (partyName.includes('निर्दलीय') || partyName.includes('IND')) return 'party-ind';
    if (partyName.includes('आम आदमी') || partyName.includes('AAP')) return 'party-aap';
    return 'party-oth';
}

function getPartyShortLabel(partyName) {
    if (!partyName) return 'OTH';
    if (partyName.includes('भारतीय जनता') || partyName.includes('BJP')) return 'BJP';
    if (partyName.includes('कांग्रेस') || partyName.includes('INC')) return 'INC';
    if (partyName.includes('निर्दलीय') || partyName.includes('IND')) return 'निर्दलीय';
    if (partyName.includes('आम आदमी') || partyName.includes('AAP')) return 'AAP';
    return partyName;
}

function showToast(msg) {
    let t = document.getElementById("toastContainer");
    if (!t) {
        t = document.createElement("div");
        t.id = "toastContainer";
        t.style.cssText = "position:fixed; bottom:20px; right:20px; z-index:9999; display:flex; flex-direction:column; gap:8px;";
        document.body.appendChild(t);
    }
    const item = document.createElement("div");
    item.style.cssText = "background:#0f172a; color:white; padding:10px 16px; border-radius:6px; font-size:13px; font-weight:600; box-shadow:0 4px 12px rgba(0,0,0,0.15); animation:fadeIn 0.2s;";
    item.innerText = msg;
    t.appendChild(item);
    setTimeout(() => {
        item.style.opacity = '0';
        setTimeout(() => item.remove(), 300);
    }, 3500);
}
