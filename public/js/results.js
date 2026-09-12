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
        const stored = sessionStorage.getItem("sumerpur_user") || localStorage.getItem("sumerpur_user") || localStorage.getItem("currentUser");
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
        if (sseConnection) {
            try { sseConnection.close(); } catch(e) {}
        }
        sseConnection = new EventSource('/api/live-stream');

        sseConnection.addEventListener('counting_update', (e) => {
            try {
                const d = JSON.parse(e.data);
                showToast(`🗳️ वार्ड ${d.ward} मतगणना अपडेट: ${d.total_counted_votes} मत गिने गए!`);
            } catch(err) {}
            fetchResultsData(true);
        });

        sseConnection.addEventListener('winner_declared', (e) => {
            try {
                const d = JSON.parse(e.data);
                showToast(`🏆 वार्ड ${d.ward} परिणाम घोषित: ${d.winner_name || d.winner} (${d.winner_party || d.party}) विजयी!`);
            } catch(err) {}
            fetchResultsData(true);
        });

        sseConnection.addEventListener('connected', () => {
            const syncStatus = document.getElementById("liveSyncBadge");
            if (syncStatus) {
                syncStatus.innerHTML = `<span class="badge" style="background:#15803d; color:white;"><i class="fas fa-bolt"></i> लाइव सिंक सक्रिय</span>`;
            }
        });

        sseConnection.onerror = () => {
            const syncStatus = document.getElementById("liveSyncBadge");
            if (syncStatus) {
                syncStatus.innerHTML = `<span class="badge" style="background:#d97706; color:white;"><i class="fas fa-rotate"></i> ऑटो-पोलिंग सक्रिय</span>`;
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

// Official Part-by-Part Counting State
let countingState = {
    ward: null,
    currentTab: 0, // 0 to N-1 = Part i, -1 = Consolidated
    partCount: 1,
    parts: [],
    candVotes: {}, // { [candId]: [part1Votes, part2Votes, ...] }
    postalVotes: {}, // { [candId]: postalVotes }
    notaVotes: [], // [part1Nota, part2Nota, ...]
    tendered_votes: 0,
    rejected_votes: 0,
    table_no: 1,
    status: 'Counting'
};

function onCountingWardSelected(wardNo) {
    currentCountingWard = parseInt(wardNo);
    if (!resultsData || !resultsData.wards) return;

    const ward = resultsData.wards.find(w => w.ward === currentCountingWard);
    if (!ward) return;

    const parts = (ward.parts && ward.parts.length > 0) 
        ? ward.parts 
        : [{ part: 1, booth_no: ward.ward, polled_votes: ward.total_polled_votes, name: `वार्ड ${ward.ward} मतदान केंद्र` }];
    const partCount = parts.length;

    const electorsEl = document.getElementById("cModalElectors");
    const polledEl = document.getElementById("cModalPolled");
    const statusEl = document.getElementById("cModalStatus");
    if (electorsEl) electorsEl.innerText = (ward.total_electors || 0).toLocaleString('hi-IN');
    if (polledEl) polledEl.innerText = (ward.total_polled_votes || 0).toLocaleString('hi-IN');
    if (statusEl) statusEl.innerText = ward.status;

    const tableInput = document.getElementById("countingTableNo");
    if (tableInput) tableInput.value = ward.counting_table_no || 1;

    // Initialize State
    countingState.ward = ward;
    countingState.currentTab = 0; // Default to Part 1
    countingState.partCount = partCount;
    countingState.parts = parts;
    countingState.table_no = ward.counting_table_no || 1;
    countingState.status = ward.status === 'Declared' ? 'Declared' : 'Counting';
    countingState.tendered_votes = ward.tendered_votes || 0;
    countingState.rejected_votes = ward.rejected_votes || 0;

    countingState.candVotes = {};
    countingState.postalVotes = {};
    ward.candidates.forEach(c => {
        let rVotes = [];
        if (Array.isArray(c.votes_rounds) && c.votes_rounds.length > 0) {
            rVotes = [...c.votes_rounds];
        } else {
            rVotes = [c.votes_evm || 0];
            if (partCount > 1) rVotes.push(c.votes_evm2 || 0);
        }
        while (rVotes.length < partCount) rVotes.push(0);
        countingState.candVotes[c.id] = rVotes;
        countingState.postalVotes[c.id] = c.votes_postal || 0;
    });

    let nRounds = [];
    if (Array.isArray(ward.nota_rounds) && ward.nota_rounds.length > 0) {
        nRounds = [...ward.nota_rounds];
    } else {
        nRounds = [ward.nota_votes_evm1 || ward.nota_votes || 0];
        if (partCount > 1) nRounds.push(ward.nota_votes_evm2 || 0);
    }
    while (nRounds.length < partCount) nRounds.push(0);
    countingState.notaVotes = nRounds;

    renderCountingPartDropdown();
    renderCountingActiveTab();
    updateModalFooterSummary();
}

function renderCountingPartDropdown() {
    const selectEl = document.getElementById("countingPartSelect");
    if (!selectEl || !countingState.ward) return;

    const { ward, parts, partCount, currentTab } = countingState;

    let optionsHtml = '';
    for (let i = 0; i < partCount; i++) {
        const pt = parts[i];
        
        let cSum = 0;
        ward.candidates.forEach(c => {
            const arr = countingState.candVotes[c.id] || [];
            cSum += (arr[i] || 0);
        });
        const nVal = countingState.notaVotes[i] || 0;
        const totalCountedThisPart = cSum + nVal;
        const targetVotes = pt.polled_votes || 0;
        const isMatched = (targetVotes > 0 && totalCountedThisPart === targetVotes);
        const hasVotes = totalCountedThisPart > 0;

        let statusText = '';
        if (isMatched) {
            statusText = `✓ [100% सटीक मिलान पूर्ण]`;
        } else if (hasVotes) {
            const diff = totalCountedThisPart - targetVotes;
            statusText = `⚠️ [${diff > 0 ? '+' : ''}${diff} मत अंतर | पोल: ${targetVotes}]`;
        } else {
            statusText = `⏳ [प्रविष्टि प्रतीक्षारत]`;
        }

        const boothName = pt.name ? (pt.name.length > 26 ? pt.name.substring(0, 26) + '...' : pt.name) : `बूथ संख्या ${pt.booth_no || (i + 1)}`;
        optionsHtml += `
            <option value="${i}" ${currentTab === i ? 'selected' : ''}>
                🗳️ भाग ${pt.part || (i + 1)} (राउंड ${i + 1}): ${boothName} &mdash; लक्ष्य: ${targetVotes} मत ${statusText}
            </option>
        `;
    }

    // Consolidated Option
    const isConsolidated = (currentTab === -1);
    optionsHtml += `
        <option value="-1" ${isConsolidated ? 'selected' : ''}>
            📊 प्ररूप 20: समेकित परिणाम पत्रक (समस्त ${partCount} भाग + डाक मतपत्र) &mdash; अंतिम परिणाम घोषणा
        </option>
    `;

    selectEl.innerHTML = optionsHtml;
    selectEl.value = currentTab;
}

function switchCountingPart(tabIndex) {
    countingState.currentTab = parseInt(tabIndex);
    const selectEl = document.getElementById("countingPartSelect");
    if (selectEl) selectEl.value = countingState.currentTab;

    renderCountingPartDropdown();
    renderCountingActiveTab();
    updateModalFooterSummary();
}

function renderCountingActiveTab() {
    if (countingState.currentTab === -1) {
        renderConsolidatedResultView();
    } else {
        renderSinglePartEntry(countingState.currentTab);
    }
}

function getPartMatchHtml(partIdx) {
    const { ward, parts } = countingState;
    const pt = parts[partIdx];
    const targetVotes = pt.polled_votes || 0;

    let cSum = 0;
    ward.candidates.forEach(c => {
        const arr = countingState.candVotes[c.id] || [];
        cSum += (arr[partIdx] || 0);
    });
    const notaVal = countingState.notaVotes[partIdx] || 0;
    const totalCounted = cSum + notaVal;
    const diff = totalCounted - targetVotes;
    const isMatched = (targetVotes > 0 && diff === 0);
    const hasVotes = totalCounted > 0;

    return `
        <div class="classic-reconcile-card ${isMatched ? 'matched' : (hasVotes ? 'mismatch' : '')}">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas ${isMatched ? 'fa-check-circle' : (hasVotes ? 'fa-exclamation-triangle' : 'fa-clipboard-check')}" 
                       style="font-size: 20px; color: ${isMatched ? '#16a34a' : (hasVotes ? '#ea580c' : '#0284c7')};"></i>
                    <div>
                        <b style="color: ${isMatched ? '#166534' : (hasVotes ? '#9a3412' : '#1e3a8a')}; font-size: 13px;">
                            प्ररूप 17ग (भाग-I) पोल लक्ष्य: ${targetVotes.toLocaleString('hi-IN')} मत &bull; कुल दर्ज मत: ${totalCounted.toLocaleString('hi-IN')} मत
                        </b>
                        <div style="font-size: 11.5px; color: #475569; margin-top: 1px;">
                            (अभ्यर्थी मत योग: <b>${cSum}</b> + NOTA मत: <b>${notaVal}</b> = <b>${totalCounted} मत</b>)
                        </div>
                    </div>
                </div>
                <div>
                    ${isMatched 
                        ? `<span style="background:#dcfce7; color:#166534; padding: 4px 10px; border-radius: 4px; font-weight: 800; font-size: 12px; border: 1.5px solid #86efac;">✓ 100% सटीक मिलान पूर्ण</span>`
                        : (hasVotes 
                            ? `<span style="background:#fee2e2; color:#991b1b; padding: 4px 10px; border-radius: 4px; font-weight: 800; font-size: 12px; border: 1.5px solid #fca5a5;">अंतर: ${diff > 0 ? '+' : ''}${diff} मत (प्ररूप 17ग से जांचें)</span>`
                            : `<span style="background:#f1f5f9; color:#64748b; padding: 4px 10px; border-radius: 4px; font-weight: 700; font-size: 11.5px; border: 1px solid #cbd5e1;">प्रविष्टि प्रतीक्षारत</span>`
                        )
                    }
                </div>
            </div>
        </div>
    `;
}

function renderSinglePartEntry(partIdx) {
    const container = document.getElementById("countingActiveTabContainer");
    if (!container) return;

    const { ward, parts, partCount } = countingState;
    const pt = parts[partIdx];
    const targetVotes = pt.polled_votes || 0;

    let cSum = 0;
    ward.candidates.forEach(c => {
        const arr = countingState.candVotes[c.id] || [];
        cSum += (arr[partIdx] || 0);
    });
    const notaVal = countingState.notaVotes[partIdx] || 0;
    const grandTotalPart = cSum + notaVal;

    let candRows = '';
    ward.candidates.forEach((c, idx) => {
        const arr = countingState.candVotes[c.id] || [];
        const candPartVal = arr[partIdx] || 0;
        candRows += `
            <tr>
                <td style="text-align: center; font-weight: 800; color: #475569; width: 45px;">${c.candidate_no}</td>
                <td style="text-align: left;">
                    <div style="font-weight: 700; font-size: 13.5px; color: #0f172a;">${c.name}</div>
                    <div style="font-size: 11px; color: #64748b;">${c.address || `वार्ड ${ward.ward}, सुमेरपुर`}</div>
                </td>
                <td style="text-align: left;">
                    <span class="party-tag ${getPartyCssClass(c.party)}">${getPartyShortLabel(c.party)}</span>
                </td>
                <td style="text-align: center; font-size: 12.5px; font-weight: 600;">
                    ${c.symbol || '-'}
                </td>
                <td class="classic-input-wrap" style="background: #f0fdf4;">
                    <input type="number" class="classic-input-num" 
                           id="cand_vote_${c.id}_${partIdx}" 
                           value="${candPartVal}" min="0" 
                           placeholder="0"
                           tabindex="${idx + 1}"
                           oninput="onPartVoteChanged(${c.id}, ${partIdx}, this.value)">
                </td>
            </tr>
        `;
    });

    container.innerHTML = `
        <div class="classic-form-sheet">
            <div class="classic-sheet-header">
                <div class="classic-sheet-title">
                    <i class="fas fa-file-alt" style="color: #1e3a8a; margin-right: 6px;"></i>
                    प्ररूप 17-ग (भाग-II) &bull; मतों का लेखा / परिणाम अभिलिखित करें
                </div>
                <div class="classic-sheet-subtitle">
                    FORM 17-C (PART-II) &mdash; RESULT OF COUNTING / RECORD OF VOTES
                </div>
            </div>

            <!-- Official Metadata Strip -->
            <table class="classic-meta-table">
                <tr>
                    <td style="width: 25%;"><b>वार्ड:</b> संख्या ${ward.ward}</td>
                    <td style="width: 50%;"><b>भाग / मतदान केंद्र:</b> भाग ${pt.part} &mdash; ${pt.name || `बूथ ${pt.booth_no}`}</td>
                    <td style="width: 25%;"><b>11-09 पोल लक्ष्य:</b> <b style="color: #0284c7;">${targetVotes.toLocaleString('hi-IN')} मत</b></td>
                </tr>
            </table>

            <!-- Candidate Table -->
            <table class="classic-table">
                <thead>
                    <tr>
                        <th style="width: 45px;">क्र.सं.</th>
                        <th style="text-align: left;">अभ्यर्थी का नाम एवं विवरण</th>
                        <th style="width: 140px; text-align: left;">सम्बद्ध दल</th>
                        <th style="width: 90px;">चुनाव प्रतीक</th>
                        <th style="width: 160px; background: #0c4a6e;">
                            अभिलिखित मत (EVM Votes)
                        </th>
                    </tr>
                </thead>
                <tbody>
                    ${candRows}
                    <!-- Statutory NOTA Row -->
                    <tr style="background: #fffbeb; font-weight: 700;">
                        <td style="text-align: center; color: #92400e;">-</td>
                        <td style="color: #92400e;">
                            <i class="fas fa-ban" style="margin-right: 4px;"></i> NOTA (उपरोक्त में से कोई नहीं / None of the Above)
                        </td>
                        <td style="color: #92400e;">-</td>
                        <td style="text-align: center; color: #92400e;">NOTA</td>
                        <td class="classic-input-wrap" style="background: #fef3c7;">
                            <input type="number" id="partNotaInput" class="classic-input-num" 
                                   style="border-color: #d97706; color: #78350f; background: #ffffff;"
                                   value="${notaVal}" min="0" 
                                   placeholder="0"
                                   tabindex="${ward.candidates.length + 1}"
                                   oninput="onPartNotaChanged(${partIdx}, this.value)">
                        </td>
                    </tr>
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="4" style="text-align: right; padding-right: 14px; font-size: 12.5px; color: #1e3a8a;">
                            <i class="fas fa-calculator"></i> भाग ${pt.part} कुल अभिलिखित मत (प्रत्याशी + NOTA योग):
                        </td>
                        <td id="partGrandSubtotal" style="text-align: center; font-size: 16px; font-weight: 900; color: #0369a1; background: #e0f2fe;">
                            ${grandTotalPart.toLocaleString('hi-IN')}
                        </td>
                    </tr>
                </tfoot>
            </table>

            <!-- Statutory Reconciliation Box -->
            <div id="partReconcileBox" style="margin-top: 10px;">
                ${getPartMatchHtml(partIdx)}
            </div>

            <!-- Navigation Bar Between Parts -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px; padding-top: 10px; border-top: 1px dashed #cbd5e1; flex-wrap: wrap; gap: 8px;">
                <div>
                    ${partIdx > 0 ? `
                        <button type="button" class="btn-secondary" style="padding: 6px 14px; font-size: 12.5px; font-weight: 600;" onclick="switchCountingPart(${partIdx - 1})">
                            <i class="fas fa-arrow-left"></i> पिछला भाग (भाग ${parts[partIdx - 1].part})
                        </button>
                    ` : `
                        <span style="font-size: 12px; color: #64748b;"><i class="fas fa-info-circle"></i> प्रथम भाग की प्रविष्टि</span>
                    `}
                </div>
                <div style="font-size: 12px; color: #475569; font-weight: 600;">
                    चरण ${partIdx + 1} / ${partCount} &bull; भाग ${pt.part} (राउंड ${partIdx + 1})
                </div>
                <div>
                    ${partIdx < partCount - 1 ? `
                        <button type="button" class="btn-primary" style="background: #0284c7; border-color: #0284c7; padding: 6px 16px; font-size: 12.5px; font-weight: 700;" onclick="switchCountingPart(${partIdx + 1})">
                            अगले भाग (भाग ${parts[partIdx + 1].part}) पर जाएँ <i class="fas fa-arrow-right"></i>
                        </button>
                    ` : `
                        <button type="button" class="btn-primary" style="background: #7e22ce; border-color: #7e22ce; padding: 6px 16px; font-size: 12.5px; font-weight: 700;" onclick="switchCountingPart(-1)">
                            समेकित परिणाम पत्रक पर जाएँ <i class="fas fa-chart-pie"></i>
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;
}

function onPartVoteChanged(candId, partIdx, val) {
    const num = parseInt(val) || 0;
    if (!countingState.candVotes[candId]) countingState.candVotes[candId] = [];
    countingState.candVotes[candId][partIdx] = num;

    // Recalculate subtotal
    let cSum = 0;
    countingState.ward.candidates.forEach(c => {
        const arr = countingState.candVotes[c.id] || [];
        cSum += (arr[partIdx] || 0);
    });
    const notaVal = countingState.notaVotes[partIdx] || 0;
    const totalCounted = cSum + notaVal;

    const subtotalEl = document.getElementById("partGrandSubtotal");
    if (subtotalEl) subtotalEl.innerText = totalCounted.toLocaleString('hi-IN');

    const recBox = document.getElementById("partReconcileBox");
    if (recBox) recBox.innerHTML = getPartMatchHtml(partIdx);

    renderCountingPartDropdown();
    updateModalFooterSummary();
}

function onPartNotaChanged(partIdx, val) {
    const num = parseInt(val) || 0;
    countingState.notaVotes[partIdx] = num;

    let cSum = 0;
    countingState.ward.candidates.forEach(c => {
        const arr = countingState.candVotes[c.id] || [];
        cSum += (arr[partIdx] || 0);
    });
    const totalCounted = cSum + num;

    const subtotalEl = document.getElementById("partGrandSubtotal");
    if (subtotalEl) subtotalEl.innerText = totalCounted.toLocaleString('hi-IN');

    const recBox = document.getElementById("partReconcileBox");
    if (recBox) recBox.innerHTML = getPartMatchHtml(partIdx);

    renderCountingPartDropdown();
    updateModalFooterSummary();
}

function renderConsolidatedResultView() {
    const container = document.getElementById("countingActiveTabContainer");
    if (!container) return;

    const { ward, parts, partCount } = countingState;

    // Dynamic columns for parts in consolidated table
    let thParts = '';
    for (let i = 0; i < partCount; i++) {
        thParts += `
            <th style="text-align: center; background: #0c4a6e; font-size: 11.5px; width: 95px;">
                भाग ${parts[i].part} (रा. ${i + 1})
            </th>
        `;
    }

    let candSums = [];
    let grandCandidateTotal = 0;
    let totalPostalSum = 0;
    const partTotals = new Array(partCount).fill(0);

    let rowsHtml = '';
    ward.candidates.forEach(c => {
        const rVotes = countingState.candVotes[c.id] || [];
        let cRoundsSum = 0;
        let tdParts = '';
        for (let i = 0; i < partCount; i++) {
            const v = rVotes[i] || 0;
            cRoundsSum += v;
            partTotals[i] += v;
            tdParts += `
                <td style="text-align: center; font-weight: 700; color: #1e40af; background: #f0f9ff;">
                    ${v.toLocaleString('hi-IN')}
                </td>
            `;
        }
        const postal = countingState.postalVotes[c.id] || 0;
        totalPostalSum += postal;
        const tot = cRoundsSum + postal;
        grandCandidateTotal += tot;

        candSums.push({ id: c.id, name: c.name, party: c.party, total: tot });

        rowsHtml += `
            <tr>
                <td style="text-align: center; font-weight: 800; color: #475569;">${c.candidate_no}</td>
                <td style="text-align: left; font-weight: 700; color: #0f172a;">${c.name}</td>
                <td style="text-align: left;">
                    <span class="party-tag ${getPartyCssClass(c.party)}">${getPartyShortLabel(c.party)}</span>
                </td>
                <td style="text-align: center; font-weight: 600;">${c.symbol || '-'}</td>
                ${tdParts}
                <td style="text-align: center; background: #fffbeb;">
                    <input type="number" class="classic-input-num cand-postal-input" 
                           value="${postal}" min="0" 
                           style="width: 75px; text-align: center; margin: 0 auto; font-weight: bold; border-color: #d97706;" 
                           oninput="onPostalVoteChanged(${c.id}, this.value)">
                </td>
                <td id="cand_tot_${c.id}" style="text-align: center; font-size: 15px; font-weight: 900; background: #f1f5f9; color: #0f172a;">
                    ${tot.toLocaleString('hi-IN')}
                </td>
            </tr>
        `;
    });

    let footParts = '';
    for (let i = 0; i < partCount; i++) {
        footParts += `
            <td style="text-align: center; font-weight: 800; color: #0369a1; background: #e0f2fe;">
                ${partTotals[i].toLocaleString('hi-IN')}
            </td>
        `;
    }

    let totalNota = 0;
    const notaPartsBreakdown = countingState.notaVotes.map((n, idx) => {
        totalNota += (n || 0);
        return `भाग ${parts[idx] ? parts[idx].part : (idx + 1)}: <b>${(n || 0)}</b>`;
    }).join(' + ');

    const grandCounted = grandCandidateTotal + totalNota;
    const targetPolled = ward.total_polled_votes || 0;
    const diff = grandCounted - targetPolled;

    // Determine Leader and Margin
    candSums.sort((a, b) => b.total - a.total);
    let leadText = '';
    if (candSums.length > 1 && candSums[0].total > 0) {
        const margin = candSums[0].total - candSums[1].total;
        leadText = `अग्रणी प्रत्याशी: <b style="color:#15803d; font-size: 14px;">${candSums[0].name} (${getPartyShortLabel(candSums[0].party)})</b> &mdash; <b>+${margin} मतों से बढ़त</b>`;
    } else if (candSums.length === 1) {
        leadText = `एकमात्र प्रत्याशी (निर्विरोध)`;
    }

    container.innerHTML = `
        <div class="classic-form-sheet">
            <div class="classic-sheet-header">
                <div class="classic-sheet-title" style="color: #7e22ce;">
                    <i class="fas fa-balance-scale" style="color: #7e22ce; margin-right: 6px;"></i>
                    प्ररूप 20 (नियम 56ग(2) देखिए) &bull; अंतिम परिणाम पत्रक
                </div>
                <div class="classic-sheet-subtitle">
                    FORM 20 &mdash; FINAL RESULT SHEET (CONSOLIDATED WARD RESULT)
                </div>
            </div>

            <!-- Official Metadata Strip -->
            <table class="classic-meta-table">
                <tr>
                    <td style="width: 25%;"><b>वार्ड संख्या:</b> ${ward.ward}</td>
                    <td style="width: 45%;"><b>समेकित भाग संख्या:</b> कुल ${partCount} भाग (राउंड)</td>
                    <td style="width: 30%;"><b>मतदान दिवस पोल (लक्ष्य):</b> <b style="color: #7e22ce;">${targetPolled.toLocaleString('hi-IN')} मत</b></td>
                </tr>
            </table>

            <!-- Consolidated Table -->
            <div style="overflow-x: auto; margin-bottom: 12px;">
                <table class="classic-table">
                    <thead>
                        <tr>
                            <th style="width: 40px;">क्र.</th>
                            <th style="text-align: left;">अभ्यर्थी का नाम</th>
                            <th style="width: 120px; text-align: left;">दल</th>
                            <th style="width: 75px;">प्रतीक</th>
                            ${thParts}
                            <th style="width: 90px; background: #854d0e;">डाक मत</th>
                            <th style="width: 110px; background: #1e3a8a;">कुल मत</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="4" style="text-align: right; padding-right: 14px; font-size: 12.5px;">
                                <i class="fas fa-calculator" style="color: #0284c7;"></i> चक्रवार प्रत्याशी उप-योग:
                            </td>
                            ${footParts}
                            <td id="foot_postal_total" style="text-align: center; font-weight: 800; color: #92400e; background: #fef3c7;">
                                ${totalPostalSum.toLocaleString('hi-IN')}
                            </td>
                            <td id="foot_cand_grand_total" style="text-align: center; font-size: 15px; font-weight: 900; background: #e2e8f0; color: #0f172a;">
                                ${grandCandidateTotal.toLocaleString('hi-IN')}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <!-- NOTA & Tendered / Rejected Strip -->
            <div style="background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 4px; padding: 10px 14px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div>
                    <span style="font-weight: 700; color: #92400e;"><i class="fas fa-ban"></i> कुल NOTA मत:</span>
                    <b style="font-size: 15px; color: #78350f; margin-left: 6px;">${totalNota} मत</b>
                    <span style="font-size: 11.5px; color: #92400e; margin-left: 8px;">(${notaPartsBreakdown})</span>
                </div>
                <div style="display: flex; gap: 14px; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <label style="font-size: 11.5px; font-weight: bold; color: #78350f;">निविदत्त (Tendered):</label>
                        <input type="number" id="countingTenderedVotes" class="classic-input-num" style="width: 65px; padding: 3px;" value="${countingState.tendered_votes}" min="0" onchange="countingState.tendered_votes = parseInt(this.value) || 0">
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <label style="font-size: 11.5px; font-weight: bold; color: #78350f;">अस्वीकृत (Rejected):</label>
                        <input type="number" id="countingRejectedVotes" class="classic-input-num" style="width: 65px; padding: 3px;" value="${countingState.rejected_votes}" min="0" onchange="countingState.rejected_votes = parseInt(this.value) || 0">
                    </div>
                </div>
            </div>

            <!-- Grand Total & Reconciliation Status Box -->
            <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 4px; padding: 12px 14px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div>
                    <div style="font-size: 13.5px; color: #166534; font-weight: 800;">
                        सम्पूर्ण वार्ड कुल गिने गए मत: <span id="grand_counted_text" style="font-size: 17px; color: #15803d;">${grandCounted.toLocaleString('hi-IN')} मत</span>
                        <span id="grand_match_badge">
                            ${targetPolled > 0 ? (diff === 0 ? `<span style="font-size: 12px; color: #16a34a; margin-left: 8px;"><i class="fas fa-check-circle"></i> 100% सटीक पोल मिलान (${targetPolled} मत)</span>` : `<span style="font-size: 12px; color: #dc2626; margin-left: 8px;">(पोल: ${targetPolled} | अंतर: ${diff > 0 ? '+' : ''}${diff})</span>`) : ''}
                        </span>
                    </div>
                    <div id="grand_lead_text" style="font-size: 12.5px; margin-top: 4px; color: #15803d;">
                        ${leadText}
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <label style="font-size: 12px; font-weight: bold; color: #166534;">वार्ड परिणाम स्थिति:</label>
                    <select id="countingStatusSelect" class="classic-select" style="width: auto; padding: 6px 10px;" onchange="countingState.status = this.value">
                        <option value="Counting" ${countingState.status === 'Counting' ? 'selected' : ''}>मतगणना जारी (Counting)</option>
                        <option value="Declared" ${countingState.status === 'Declared' ? 'selected' : ''}>आधिकारिक परिणाम घोषित (Declared)</option>
                    </select>
                </div>
            </div>

            <!-- Statutory Returning Officer Note -->
            <div style="font-size: 11px; color: #64748b; text-align: right; font-style: italic; border-top: 1px dashed #cbd5e1; padding-top: 6px;">
                * रिटर्निंग ऑफिसर (एसडीएम) सुमेरपुर द्वारा प्ररूप 20 के अनुसार विधिवत प्रमाणित एवं अंतिम रूप से घोषित परिणाम पत्रक।
            </div>
        </div>
    `;
}

function onPostalVoteChanged(candId, val) {
    const num = parseInt(val) || 0;
    countingState.postalVotes[candId] = num;

    // Live update consolidated cells without full re-render (maintains input focus)
    const { ward, partCount } = countingState;
    let candSums = [];
    let grandCandTotal = 0;
    let totalPostal = 0;

    ward.candidates.forEach(c => {
        const rVotes = countingState.candVotes[c.id] || [];
        let cRoundsSum = 0;
        for (let i = 0; i < partCount; i++) {
            cRoundsSum += (rVotes[i] || 0);
        }
        const p = countingState.postalVotes[c.id] || 0;
        totalPostal += p;
        const tot = cRoundsSum + p;
        grandCandTotal += tot;
        candSums.push({ id: c.id, name: c.name, party: c.party, total: tot });

        const candTotEl = document.getElementById(`cand_tot_${c.id}`);
        if (candTotEl) candTotEl.innerText = tot.toLocaleString('hi-IN');
    });

    const footPostalEl = document.getElementById("foot_postal_total");
    if (footPostalEl) footPostalEl.innerText = totalPostal.toLocaleString('hi-IN');

    const footGrandEl = document.getElementById("foot_cand_grand_total");
    if (footGrandEl) footGrandEl.innerText = grandCandTotal.toLocaleString('hi-IN');

    const totalNota = countingState.notaVotes.reduce((a, b) => a + b, 0);
    const grandCounted = grandCandTotal + totalNota;
    const targetPolled = ward.total_polled_votes || 0;
    const diff = grandCounted - targetPolled;

    const grandCountedEl = document.getElementById("grand_counted_text");
    if (grandCountedEl) grandCountedEl.innerText = `${grandCounted.toLocaleString('hi-IN')} मत`;

    const grandBadgeEl = document.getElementById("grand_match_badge");
    if (grandBadgeEl) {
        if (targetPolled > 0) {
            grandBadgeEl.innerHTML = (diff === 0) 
                ? `<span style="font-size: 12px; color: #16a34a; margin-left: 8px;"><i class="fas fa-check-circle"></i> 100% सटीक पोल मिलान (${targetPolled} मत)</span>`
                : `<span style="font-size: 12px; color: #dc2626; margin-left: 8px;">(पोल: ${targetPolled} | अंतर: ${diff > 0 ? '+' : ''}${diff})</span>`;
        }
    }

    candSums.sort((a, b) => b.total - a.total);
    const leadEl = document.getElementById("grand_lead_text");
    if (leadEl) {
        if (candSums.length > 1 && candSums[0].total > 0) {
            const margin = candSums[0].total - candSums[1].total;
            leadEl.innerHTML = `अग्रणी: <b style="color:#15803d;">${candSums[0].name} (${getPartyShortLabel(candSums[0].party)})</b> &mdash; <b>+${margin} मतों से आगे</b>`;
        } else if (candSums.length === 1) {
            leadEl.innerText = `एकमात्र प्रत्याशी (निर्विरोध)`;
        }
    }

    updateModalFooterSummary();
}

function updateModalFooterSummary() {
    const badge = document.getElementById("modalFooterSummaryBadge");
    if (!badge || !countingState.ward) return;
    const ward = countingState.ward;
    const tabName = countingState.currentTab === -1 
        ? `📊 समेकित परिणाम पत्रक (Form 20)` 
        : `🗳️ भाग ${countingState.parts[countingState.currentTab]?.part || (countingState.currentTab + 1)} EVM प्रविष्टि (Form 17C-II)`;
    badge.innerHTML = `
        <i class="fas fa-landmark" style="color: #0284c7;"></i> <b>वार्ड संख्या ${ward.ward}</b> (${countingState.partCount} भाग) &bull; 
        सक्रिय चरण: <b style="color: #0369a1;">${tabName}</b> &bull; 
        11-09 पोल: <b>${(ward.total_polled_votes || 0).toLocaleString('hi-IN')} मत</b>
    `;

    const quickBadge = document.getElementById("cModalQuickBadge");
    if (quickBadge) {
        if (countingState.currentTab === -1) {
            quickBadge.innerHTML = `<span style="color: #7e22ce; background: #faf5ff; border: 1px solid #d8b4fe; padding: 2px 8px; border-radius: 4px;">📊 समेकित परिणाम पत्रक</span>`;
        } else {
            const pt = countingState.parts[countingState.currentTab];
            let cSum = 0;
            ward.candidates.forEach(c => {
                const arr = countingState.candVotes[c.id] || [];
                cSum += (arr[countingState.currentTab] || 0);
            });
            const nVal = countingState.notaVotes[countingState.currentTab] || 0;
            const counted = cSum + nVal;
            const target = pt?.polled_votes || 0;
            if (target > 0 && counted === target) {
                quickBadge.innerHTML = `<span style="color: #166534; background: #dcfce7; border: 1px solid #86efac; padding: 2px 8px; border-radius: 4px;">✓ भाग ${pt?.part} 100% मिलान (${target} मत)</span>`;
            } else if (counted > 0) {
                const diff = counted - target;
                quickBadge.innerHTML = `<span style="color: #991b1b; background: #fee2e2; border: 1px solid #fca5a5; padding: 2px 8px; border-radius: 4px;">⚠️ भाग ${pt?.part} अंतर: ${diff > 0 ? '+' : ''}${diff} मत</span>`;
            } else {
                quickBadge.innerHTML = `<span style="color: #64748b; background: #f1f5f9; border: 1px solid #cbd5e1; padding: 2px 8px; border-radius: 4px;">⏳ भाग ${pt?.part} प्रविष्टि लंबित</span>`;
            }
        }
    }
}

async function saveCountingData() {
    if (!resultsData || !resultsData.wards || !countingState.ward) return;
    const ward = countingState.ward;
    const { partCount } = countingState;

    const candidateVotes = ward.candidates.map(c => {
        const rounds = countingState.candVotes[c.id] || [];
        const postal = countingState.postalVotes[c.id] || 0;
        return {
            id: c.id,
            votes_rounds: rounds,
            votes_evm: rounds[0] || 0,
            votes_evm2: rounds[1] || 0,
            votes_postal: postal
        };
    });

    const nota_rounds = countingState.notaVotes || [];
    const total_nota = nota_rounds.reduce((a, b) => a + b, 0);

    const tenderedEl = document.getElementById("countingTenderedVotes");
    const tendered_votes = tenderedEl ? (parseInt(tenderedEl.value) || 0) : (countingState.tendered_votes || 0);
    const rejectedEl = document.getElementById("countingRejectedVotes");
    const rejected_votes = rejectedEl ? (parseInt(rejectedEl.value) || 0) : (countingState.rejected_votes || 0);
    const statusSelect = document.getElementById("countingStatusSelect");
    const status = statusSelect ? statusSelect.value : (countingState.status || 'Counting');
    const tableEl = document.getElementById("countingTableNo");
    const counting_table_no = tableEl ? (parseInt(tableEl.value) || 1) : (countingState.table_no || 1);

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
                ward: ward.ward,
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
            showToast(`✅ वार्ड ${ward.ward} का भागवार मतगणना डेटा सुरक्षित व प्रसारित हुआ!`);
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
    const printArea = document.getElementById("form21PrintArea");
    if (!printArea) return;
    const printWin = window.open('', '_blank', 'width=850,height=950');
    printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>प्ररूप 21 - निर्वाचन प्रमाण-पत्र | सुमेरपुर चुनाव 2026</title>
            <link rel="stylesheet" href="css/style.css">
            <style>
                body { background: white; margin: 0; padding: 25px; font-family: 'Segoe UI', Arial, sans-serif; }
                .form21-container { border: 3px double #334155; padding: 35px; }
            </style>
        </head>
        <body>
            ${printArea.innerHTML}
            <script>
                window.onload = function() {
                    window.print();
                };
            </script>
        </body>
        </html>
    `);
    printWin.document.close();
}

function closeForm21Certificate() {
    document.getElementById("form21Modal").style.display = "none";
}

// 11. Consolidated 35 Wards Results Print Generator
function printConsolidatedResults() {
    if (!resultsData || !resultsData.wards) {
        alert("डेटा लोड हो रहा है, कृपया प्रतीक्षा करें...");
        return;
    }

    const wards = resultsData.wards;
    const summary = resultsData.summary || {};
    const tally = resultsData.partyTally || {};

    let tableRows = '';
    wards.forEach(w => {
        const isNirvirodh = (w.ward === 26);
        const winner = w.winner_name || (isNirvirodh ? 'श्रीमती रेखा गर्ग (निर्विरोध)' : '-');
        const party = w.winner_party || (isNirvirodh ? 'BJP' : '-');
        const margin = isNirvirodh ? 'निर्विरोध' : (w.margin ? `${w.margin} मत` : '-');
        const counted = isNirvirodh ? 'निर्विरोध' : (w.total_counted_votes || 0).toLocaleString('hi-IN');
        const runnerUpName = w.runner_up_name ? `${w.runner_up_name} (${w.runner_up_party || ''})` : '-';

        tableRows += `
            <tr style="border-bottom: 1px solid #cbd5e1; text-align: center;">
                <td style="padding: 6px 8px; font-weight: bold;">${w.ward}</td>
                <td style="padding: 6px 8px;">${(w.total_electors || 0).toLocaleString('hi-IN')}</td>
                <td style="padding: 6px 8px;">${(w.total_polled_votes || 0).toLocaleString('hi-IN')}</td>
                <td style="padding: 6px 8px; font-weight: bold;">${counted}</td>
                <td style="padding: 6px 8px;">${w.nota_votes || 0}</td>
                <td style="padding: 6px 8px; text-align: left; font-weight: bold;">${winner}</td>
                <td style="padding: 6px 8px;"><b>${party}</b></td>
                <td style="padding: 6px 8px; text-align: left;">${runnerUpName}</td>
                <td style="padding: 6px 8px; font-weight: bold; color: #0284c7;">${margin}</td>
                <td style="padding: 6px 8px;">
                    <span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; ${w.status === 'Declared' ? 'background: #dcfce7; color: #166534;' : (w.status === 'Counting' ? 'background: #fef3c7; color: #b45309;' : 'background: #f1f5f9; color: #475569;')}">
                        ${w.status}
                    </span>
                </td>
            </tr>
        `;
    });

    const printWin = window.open('', '_blank', 'width=1050,height=900');
    printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>समस्त 35 वार्डों का संकलित चुनाव परिणाम | नगर पालिका सुमेरपुर 2026</title>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; margin: 20px; color: #0f172a; }
                h2, h3, p { margin: 0; text-align: center; }
                .report-header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
                .tally-summary { display: flex; justify-content: space-around; margin-bottom: 16px; background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px 12px; border-radius: 6px; font-size: 13px; font-weight: bold; }
                table { width: 100%; border-collapse: collapse; font-size: 12px; }
                th { background: #0f172a; color: white; padding: 8px 6px; font-size: 12px; }
                td { padding: 6px 6px; font-size: 11.5px; }
                .footer { display: flex; justify-content: space-between; margin-top: 40px; font-size: 13px; }
                @media print {
                    @page { size: A4 landscape; margin: 10mm; }
                    body { margin: 0; }
                }
            </style>
        </head>
        <body>
            <div class="report-header">
                <h3>राजस्थान राज्य निर्वाचन आयोग | कार्यालय रिटर्निंग ऑफिसर (SDM), सुमेरपुर (पाली)</h3>
                <h2 style="margin: 6px 0;">नगर पालिका आम चुनाव 2026 — समस्त 35 वार्डों का संकलित परिणाम पत्रक</h2>
                <p style="font-size: 12.5px; color: #475569;">मतगणना दिवस: 14 सितम्बर 2026 | बहुमत का जादुई आंकड़ा: 18 सीटें (कुल 35 सीटें)</p>
            </div>

            <div class="tally-summary">
                <span>कुल सीटें: 35</span>
                <span style="color: #15803d;">घोषित: ${summary.declaredWards || 0}</span>
                <span style="color: #ea580c;">भाजपा (BJP): ${tally.BJP?.won || 0}</span>
                <span style="color: #0284c7;">कांग्रेस (INC): ${tally.INC?.won || 0}</span>
                <span style="color: #9333ea;">निर्दलीय (IND): ${tally.IND?.won || 0}</span>
                <span style="color: #ca8a04;">आप (AAP): ${tally.AAP?.won || 0}</span>
                <span>कुल गिने गए मत: ${(summary.totalCountedVotes || 0).toLocaleString('hi-IN')}</span>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>वार्ड</th>
                        <th>वोटर</th>
                        <th>मतदान मत</th>
                        <th>गिने गए मत</th>
                        <th>NOTA</th>
                        <th style="text-align:left;">विजयी प्रत्याशी</th>
                        <th>दल</th>
                        <th style="text-align:left;">निकटतम प्रतिद्वंदी</th>
                        <th>अंतर</th>
                        <th>स्थिति</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>

            <div class="footer">
                <div>
                    <div>स्थान: <b>सुमेरपुर</b></div>
                    <div>तारीख: <b>14.09.2026</b></div>
                </div>
                <div style="text-align: center;">
                    <div style="height: 35px;"></div>
                    <b>कालुराम कुम्हार (आर.ए.एस.)</b><br>
                    रिटर्निंग अधिकारी (उपखण्ड मजिस्ट्रेट)<br>
                    नगर पालिका सुमेरपुर (पाली)
                </div>
            </div>

            <script>
                window.onload = function() { window.print(); };
            </script>
        </body>
        </html>
    `);
    printWin.document.close();
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
