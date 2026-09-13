// ==========================================================================
// 🏆 नगर पालिका सुमेरपुर आम चुनाव 2026 — मतगणना एवं परिणाम मॉड्यूल (results.js)
// ==========================================================================

let currentUser = null;
let resultsData = null;
let currentResultsFilter = 'all';
let currentCountingWard = 1;
let currentTab = 'dashboard';
let sseConnection = null;
let isProjectorModeActive = false;
let lastDeclaredCount = -1;
let cachedTickerContent = null;

// 1. Initialize on DOM Load
document.addEventListener("DOMContentLoaded", () => {
    checkSavedSession();
    initClock();
    fetchResultsData();
    initSSE();
    handleHashNavigation();
    window.addEventListener("hashchange", handleHashNavigation);

    // Auto-refresh results every 3.5 seconds for instant LED display auto-sync
    setInterval(() => {
        fetchResultsData(true);
    }, 3500);
});

// Real-Time Portal Clock
function initClock() {
    setInterval(() => {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const clockEl = document.getElementById("portalClock");
        if (clockEl) clockEl.innerText = timeStr;

        const tvClockEl = document.getElementById("tvLiveClock");
        if (tvClockEl) tvClockEl.innerText = timeStr;
    }, 1000);
}

// 2. Authentication & Session Handling (Shared with Matdan Control)
function checkSavedSession() {
    const saved = sessionStorage.getItem("sumerpur_user") || localStorage.getItem("sumerpur_user") || localStorage.getItem("currentUser");
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            updateAuthUI();
        } catch(e) {
            currentUser = null;
        }
    } else {
        const hash = window.location.hash.replace('#', '');
        if (hash === 'livedisplay' || hash === 'reports' || hash === 'dashboard' || hash === 'wards' || !hash) {
            enterPublicGuestMode();
            return;
        }
        const overlay = document.getElementById("loginOverlay");
        if (overlay) overlay.style.display = "flex";
    }
}

function switchAuthTab(tab) {
    const opLoginBtn = document.getElementById("authTabOpLoginBtn");
    const opRegBtn = document.getElementById("authTabOpRegBtn");
    const roLoginBtn = document.getElementById("authTabRoLoginBtn");

    const opForm = document.getElementById("opLoginFormContainer");
    const opRegForm = document.getElementById("opRegisterFormContainer");
    const roForm = document.getElementById("roLoginFormContainer");
    const forgotForm = document.getElementById("forgotPasswordFormContainer");

    if (opForm) opForm.style.display = (tab === 'op_login') ? "block" : "none";
    if (opRegForm) opRegForm.style.display = (tab === 'op_register') ? "block" : "none";
    if (roForm) roForm.style.display = (tab === 'ro_login') ? "block" : "none";
    if (forgotForm) forgotForm.style.display = (tab === 'forgot_password') ? "block" : "none";

    if (opLoginBtn) opLoginBtn.className = (tab === 'op_login') ? "btn-primary" : "btn-secondary";
    if (opRegBtn) opRegBtn.className = (tab === 'op_register') ? "btn-primary" : "btn-secondary";
    if (roLoginBtn) roLoginBtn.className = (tab === 'ro_login') ? "btn-primary" : "btn-secondary";
}

async function attemptOpLogin() {
    const u = document.getElementById("opUsername")?.value?.trim();
    const p = document.getElementById("opPassword")?.value?.trim();
    if (!u || !p) {
        alert("कृपया ऑपरेटर यूज़रनेम एवं पासवर्ड दर्ज करें।");
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
            sessionStorage.setItem("sumerpur_user", JSON.stringify(currentUser));
            localStorage.setItem("currentUser", JSON.stringify(currentUser));
            const overlay = document.getElementById("loginOverlay");
            if (overlay) overlay.style.display = "none";
            updateAuthUI();
            showToast(`✅ स्वागत है, ${currentUser.name || currentUser.username}! मतगणना सत्र सक्रिय।`);
            renderResultsGrid();
            renderDashboardSummaryTable();
        } else {
            alert(`❌ लॉगिन विफल: ${data.message || 'अमान्य क्रेडेंशियल'}`);
        }
    } catch(err) {
        alert("सर्वर से संपर्क करने में त्रुटि: " + err.message);
    }
}

async function attemptRegister() {
    const name = document.getElementById("regName")?.value?.trim();
    const mobile = document.getElementById("regMobile")?.value?.trim();
    const designation = document.getElementById("regDesignation")?.value?.trim();
    const role = document.getElementById("regRole")?.value;
    const username = document.getElementById("regUsername")?.value?.trim();
    const password = document.getElementById("regPassword")?.value?.trim();

    if (!name || !username || !password || !role) {
        alert("कृपया सभी अनिवार्य फ़ील्ड (*) भरें।");
        return;
    }

    try {
        const res = await fetch('/api/operator/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, mobile, designation, role, username, password })
        });
        const data = await res.json();
        if (data.success) {
            alert("✅ ऑपरेटर पंजीयन सफल! अब आप अपने यूज़रनेम व पासवर्ड से लॉगिन कर सकते हैं।");
            switchAuthTab('op_login');
            const uInput = document.getElementById("opUsername");
            if (uInput) uInput.value = username;
        } else {
            alert(`❌ पंजीयन विफल: ${data.message || 'त्रुटि'}`);
        }
    } catch(err) {
        alert("सर्वर से संपर्क करने में त्रुटि: " + err.message);
    }
}

async function attemptRoLogin() {
    const u = document.getElementById("roUsername")?.value?.trim();
    const p = document.getElementById("roPassword")?.value?.trim();
    if (!u || !p) {
        alert("कृपया RO यूज़रनेम एवं पासवर्ड दर्ज करें।");
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
            sessionStorage.setItem("sumerpur_user", JSON.stringify(currentUser));
            localStorage.setItem("currentUser", JSON.stringify(currentUser));
            const overlay = document.getElementById("loginOverlay");
            if (overlay) overlay.style.display = "none";
            updateAuthUI();
            showToast(`✅ रिटर्निंग ऑफिसर (SDM) सुमेरपुर — स्वागत है!`);
            renderResultsGrid();
            renderDashboardSummaryTable();
        } else {
            alert(`❌ लॉगिन विफल: ${data.message || 'अमान्य क्रेडेंशियल'}`);
        }
    } catch(err) {
        alert("सर्वर से संपर्क करने में त्रुटि: " + err.message);
    }
}

async function attemptSelfResetPassword() {
    const username = document.getElementById("resetUsername")?.value?.trim();
    const mobile = document.getElementById("resetMobile")?.value?.trim();
    const newPassword = document.getElementById("resetNewPassword")?.value?.trim();
    const confirmPassword = document.getElementById("resetConfirmPassword")?.value?.trim();

    if (!username || !newPassword || !confirmPassword) {
        alert("कृपया सभी अनिवार्य फ़ील्ड (*) भरें।");
        return;
    }
    if (newPassword !== confirmPassword) {
        alert("❌ नया पासवर्ड और पुष्टि पासवर्ड मेल नहीं खाते!");
        return;
    }

    try {
        const res = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, mobile, newPassword })
        });
        const data = await res.json();
        if (data.success) {
            alert("✅ पासवर्ड सफलतापूर्वक रीसेट हो गया! अब नए पासवर्ड से लॉगिन करें।");
            switchAuthTab('op_login');
            const uInput = document.getElementById("opUsername");
            if (uInput) uInput.value = username;
        } else {
            alert(`❌ रीसेट विफल: ${data.message || 'त्रुटि'}`);
        }
    } catch(err) {
        alert("सर्वर से संपर्क करने में त्रुटि: " + err.message);
    }
}

function enterPublicGuestMode() {
    currentUser = {
        role: 'GUEST',
        name: 'नागरिक दर्शक',
        username: 'guest',
        isGuest: true
    };
    sessionStorage.setItem("sumerpur_user", JSON.stringify(currentUser));
    const overlay = document.getElementById("loginOverlay");
    if (overlay) overlay.style.display = "none";
    updateAuthUI();
    showToast("🌐 नागरिक डिस्प्ले मोड सक्रिय। मतगणना परिणाम पोर्टल में आपका स्वागत है!");
}

function handleHeaderAuthAction() {
    if (currentUser && currentUser.isGuest) {
        const overlay = document.getElementById("loginOverlay");
        if (overlay) overlay.style.display = "flex";
        switchAuthTab('op_login');
    } else {
        logoutUser();
    }
}

function logoutUser() {
    if (confirm("क्या आप वाकई लॉगआउट करना चाहते हैं?")) {
        sessionStorage.removeItem("sumerpur_user");
        localStorage.removeItem("currentUser");
        currentUser = null;
        updateAuthUI();
        showToast("ℹ️ आप सफलतापूर्वक लॉगआउट हो गए हैं।");
        enterPublicGuestMode();
    }
}

function updateAuthUI() {
    const authBtn = document.getElementById("headerAuthBtn");
    const userNameEl = document.getElementById("currentUserName");
    const entryLink = document.getElementById("navEntryLink");

    if (currentUser && !currentUser.isGuest) {
        const roleLabel = currentUser.role === 'RO' ? 'RO (SDM)' : (currentUser.role.startsWith('OP') ? `टेबल ${currentUser.role.replace('OP','')}` : currentUser.role);
        if (userNameEl) {
            userNameEl.innerHTML = `<span style="color:#0284c7; font-weight:700;"><i class="fas fa-user-check"></i> ${currentUser.name || currentUser.username} (${roleLabel})</span>`;
        }
        if (authBtn) {
            authBtn.innerHTML = `<i class="fas fa-sign-out-alt"></i> बाहर निकलें`;
            authBtn.className = "btn-logout";
            authBtn.style.background = "";
            authBtn.style.borderColor = "";
            authBtn.onclick = logoutUser;
        }
        if (entryLink) entryLink.style.display = "";
    } else {
        if (userNameEl) {
            userNameEl.innerHTML = `<span style="color:#10b981; font-weight:700;"><i class="fas fa-eye"></i> नागरिक / पब्लिक मोड</span>`;
        }
        if (authBtn) {
            authBtn.innerHTML = `<i class="fas fa-right-to-bracket"></i> ऑपरेटर / RO लॉगिन`;
            authBtn.className = "btn-primary";
            authBtn.style.background = "#0284c7";
            authBtn.style.borderColor = "#0284c7";
            authBtn.onclick = () => {
                const overlay = document.getElementById("loginOverlay");
                if (overlay) overlay.style.display = "flex";
                switchAuthTab('op_login');
            };
        }
    }
}

// 3. Multi-Page Navigation & Tab Routing
function navigateTo(tabName) {
    window.location.hash = tabName;
}

function handleHashNavigation() {
    const hash = window.location.hash.replace('#', '') || 'dashboard';

    if (hash === 'entry') {
        if (!currentUser || currentUser.isGuest) {
            showToast("🔒 मतगणना प्रविष्टि केवल अधिकृत चुनाव कार्मिकों हेतु है। कृपया ऑपरेटर लॉगिन करें।");
            const overlay = document.getElementById("loginOverlay");
            if (overlay) overlay.style.display = "flex";
            switchAuthTab('op_login');
            window.location.hash = 'dashboard';
            return;
        }
    }

    currentTab = hash;

    document.querySelectorAll(".nav-link").forEach(el => {
        el.classList.toggle("active", el.dataset.tab === hash);
    });

    document.querySelectorAll(".page-view").forEach(el => {
        el.classList.toggle("active", el.id === `view_${hash}`);
    });

    if (hash === 'dashboard') {
        renderDashboardSummaryTable();
        if (resultsData) renderHighlights(resultsData.summary, resultsData.wards);
    } else if (hash === 'wards') {
        renderResultsGrid();
    } else if (hash === 'entry') {
        const opContainer = document.getElementById("onPageActiveContainer");
        if (!opContainer || opContainer.children.length === 0 || !countingState.ward) {
            initOnPageCountingEntry(currentCountingWard, false);
        }
    } else if (hash === 'livedisplay') {
        renderLiveDisplay();
    }
}

// 4. Real-Time Server-Sent Events (SSE)
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

        sseConnection.addEventListener('results_update', (e) => {
            try {
                const d = JSON.parse(e.data);
                if (d.status === 'Declared') {
                    showToast(`🏆 [ब्रेकिंग] वार्ड ${d.ward} परिणाम घोषित: ${d.winner_name} (${d.winner_party}) विजयी!`);
                } else {
                    showToast(`📊 वार्ड ${d.ward} मतगणना अपडेट प्राप्त हुआ`);
                }
            } catch(err) {}
            fetchResultsData(true);
        });

        sseConnection.addEventListener('winner_declared', (e) => {
            try {
                const d = JSON.parse(e.data);
                showToast(`🏆 [ब्रेकिंग परिणाम] वार्ड ${d.ward} घोषित: ${d.winner_name || d.winner} (${d.winner_party || d.party}) विजयी!`);
            } catch(err) {}
            fetchResultsData(true);
        });

        sseConnection.addEventListener('connected', () => {
            const syncStatus = document.getElementById("syncStatusText");
            if (syncStatus) syncStatus.innerText = "लाइव सिंक सक्रिय";
        });

        sseConnection.onerror = () => {
            const syncStatus = document.getElementById("syncStatusText");
            if (syncStatus) syncStatus.innerText = "ऑटो-पोलिंग सक्रिय";
        };
    } catch(err) {
        console.error("SSE Error:", err);
    }
}

// 5. Fetch Results & Tally Data
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
            const tally = data.summary?.partyTally || data.tally;
            renderPartyTally(tally);
            renderSummaryCards(data.summary);
            renderHighlights(data.summary, data.wards);
            renderDashboardSummaryTable();
            renderResultsGrid();
            populateForm21Dropdowns();

            // Always render and update Live TV Display & Marquee Ticker so that all screens stay live & synced
            renderLiveDisplay();

            if (currentTab === 'entry') {
                const opContainer = document.getElementById("onPageActiveContainer");
                // Strictly protect manual data entry: never rebuild active form on background auto-refresh or if already populated
                if (!isBackground && (!opContainer || opContainer.children.length === 0 || !countingState.ward)) {
                    initOnPageCountingEntry(currentCountingWard, false);
                }
            }
        }
    } catch(err) {
        console.error("Results fetch error:", err);
    }
}

// 6. Render Party Tally Board & Majority Gauge
function renderPartyTally(tally) {
    if (!tally) return;

    const bjp = tally.BJP || { won: 0, leading: 0, total: 0 };
    const inc = tally.INC || { won: 0, leading: 0, total: 0 };
    const ind = tally.IND || { won: 0, leading: 0, total: 0 };
    const aap = tally.AAP || { won: 0, leading: 0, total: 0 };
    const oth = tally.OTH || { won: 0, leading: 0, total: 0 };

    // Update Dashboard Party Cards
    const bjpTot = document.getElementById("tallyBjpTotal");
    const bjpWon = document.getElementById("tallyBjpWon");
    const bjpLead = document.getElementById("tallyBjpLead");
    if (bjpTot) bjpTot.innerText = bjp.total || bjp.won || 0;
    if (bjpWon) bjpWon.innerText = bjp.won || 0;
    if (bjpLead) bjpLead.innerText = bjp.leading || 0;

    const incTot = document.getElementById("tallyIncTotal");
    const incWon = document.getElementById("tallyIncWon");
    const incLead = document.getElementById("tallyIncLead");
    if (incTot) incTot.innerText = inc.total || inc.won || 0;
    if (incWon) incWon.innerText = inc.won || 0;
    if (incLead) incLead.innerText = inc.leading || 0;

    const indTot = document.getElementById("tallyIndTotal");
    const indWon = document.getElementById("tallyIndWon");
    const indLead = document.getElementById("tallyIndLead");
    if (indTot) indTot.innerText = ind.total || ind.won || 0;
    if (indWon) indWon.innerText = ind.won || 0;
    if (indLead) indLead.innerText = ind.leading || 0;

    const aapTot = document.getElementById("tallyAapTotal");
    const aapWon = document.getElementById("tallyAapWon");
    const aapLead = document.getElementById("tallyAapLead");
    if (aapTot) aapTot.innerText = aap.total || aap.won || 0;
    if (aapWon) aapWon.innerText = aap.won || 0;
    if (aapLead) aapLead.innerText = aap.leading || 0;

    const othTot = document.getElementById("tallyOthTotal");
    const othWon = document.getElementById("tallyOthWon");
    const othLead = document.getElementById("tallyOthLead");
    if (othTot) othTot.innerText = oth.total || oth.won || 0;
    if (othWon) othWon.innerText = oth.won || 0;
    if (othLead) othLead.innerText = oth.leading || 0;

    // Majority Meter Progress Bars (18 / 35 seats = 51.4%)
    const bPct = Math.min(100, ((bjp.total || bjp.won || 0) / 35) * 100);
    const iPct = Math.min(100, ((inc.total || inc.won || 0) / 35) * 100);
    const inPct = Math.min(100, ((ind.total || ind.won || 0) / 35) * 100);
    const aPct = Math.min(100, ((aap.total || aap.won || 0) / 35) * 100);
    const oPct = Math.min(100, ((oth.total || oth.won || 0) / 35) * 100);

    const setBar = (id, pct) => {
        const el = document.getElementById(id);
        if (el) el.style.width = pct + '%';
    };

    setBar("majBarBjp", bPct);
    setBar("majBarInc", iPct);
    setBar("majBarInd", inPct);
    setBar("majBarAap", aPct);
    setBar("majBarOth", oPct);

    setBar("tvMajBarBjp", bPct);
    setBar("tvMajBarInc", iPct);
    setBar("tvMajBarInd", inPct);
    setBar("tvMajBarAap", aPct);
    setBar("tvMajBarOth", oPct);

    // Majority Status Text
    let statusMsg = `बहुमत के लिए 18 सीटें शेष`;
    if (bjp.won >= 18) {
        statusMsg = `🎉 भाजपा (BJP) ने ${bjp.won} सीटें जीतकर पूर्ण बहुमत प्राप्त किया!`;
    } else if (inc.won >= 18) {
        statusMsg = `🎉 कांग्रेस (INC) ने ${inc.won} सीटें जीतकर पूर्ण बहुमत प्राप्त किया!`;
    } else {
        const leadParty = (bjp.total >= inc.total && bjp.total > 0) ? `BJP (${bjp.total})` : (inc.total > 0 ? `INC (${inc.total})` : '');
        const needed = 18 - (bjp.won || 0);
        statusMsg = leadParty ? `अग्रणी: ${leadParty} | बहुमत हेतु ${needed} सीटें शेष` : `बहुमत हेतु 18 सीटें आवश्यक`;
    }

    const majTextEl = document.getElementById("majorityStatusText");
    if (majTextEl) majTextEl.innerText = statusMsg;

    const tvMajTextEl = document.getElementById("tvMajorityText");
    if (tvMajTextEl) tvMajTextEl.innerText = statusMsg;

    // TV Pills (Legacy/Hidden container)
    const tvPills = document.getElementById("tvPartyPillsContainer");
    if (tvPills) {
        tvPills.innerHTML = `
            <span class="badge" style="background:#f97316; color:white; font-size:13px; padding:6px 14px;">BJP: <b>${bjp.total || 0}</b> (जीते: ${bjp.won || 0}, बढ़त: ${bjp.leading || 0})</span>
            <span class="badge" style="background:#0ea5e9; color:white; font-size:13px; padding:6px 14px;">INC: <b>${inc.total || 0}</b> (जीते: ${inc.won || 0}, बढ़त: ${inc.leading || 0})</span>
            <span class="badge" style="background:#a855f7; color:white; font-size:13px; padding:6px 14px;">IND: <b>${ind.total || 0}</b> (जीते: ${ind.won || 0}, बढ़त: ${ind.leading || 0})</span>
            <span class="badge" style="background:#eab308; color:black; font-size:13px; padding:6px 14px;">AAP: <b>${aap.total || 0}</b> (जीते: ${aap.won || 0}, बढ़त: ${aap.leading || 0})</span>
        `;
    }

    // TV Big Studio Party Scoreboard Cards
    const setTvParty = (pCode, pData) => {
        const seatsEl = document.getElementById(`tvParty${pCode}Seats`);
        const wonEl = document.getElementById(`tvParty${pCode}Won`);
        const leadEl = document.getElementById(`tvParty${pCode}Lead`);
        if (seatsEl) seatsEl.innerText = pData.total || pData.won || 0;
        if (wonEl) wonEl.innerText = pData.won || 0;
        if (leadEl) leadEl.innerText = pData.leading || 0;
    };
    setTvParty("Bjp", bjp);
    setTvParty("Inc", inc);
    setTvParty("Ind", ind);
    setTvParty("Aap", aap);
    setTvParty("Oth", oth);
}

// 7. Render Highlights Strip
function renderHighlights(summary, wards) {
    if (!wards || wards.length === 0) return;

    let maxMarginWard = null;
    wards.forEach(w => {
        if (w.status === 'Declared' || w.status === 'Counting') {
            if (!maxMarginWard || (w.margin || 0) > (maxMarginWard.margin || 0)) {
                maxMarginWard = w;
            }
        }
    });

    const hlWard = document.getElementById("hlHighestMarginWard");
    const hlSub = document.getElementById("hlHighestMarginSub");
    if (maxMarginWard && (maxMarginWard.margin > 0 || maxMarginWard.ward === 26)) {
        if (hlWard) hlWard.innerText = `वार्ड ${maxMarginWard.ward} (${maxMarginWard.winner_name || maxMarginWard.leader?.name || '-'})`;
        if (hlSub) {
            if (maxMarginWard.ward === 26) {
                hlSub.innerText = `निर्विरोध निर्वाचित (BJP) — कोई मतदान नहीं`;
            } else {
                hlSub.innerText = `${maxMarginWard.margin} मतों का अंतर | स्थिति: ${maxMarginWard.status}`;
            }
        }
    } else {
        if (hlWard) hlWard.innerText = `वार्ड 26 (श्रीमती वीणा देवड़ा)`;
        if (hlSub) hlSub.innerText = `निर्विरोध निर्वाचित (BJP) — 1 सीट घोषित`;
    }

    const hlTitle = document.getElementById("hlDeclaredCountTitle");
    const hlDecSub = document.getElementById("hlDeclaredCountSub");
    if (hlTitle && summary) {
        hlTitle.innerText = `${summary.declaredWards || 0} / 35 वार्ड घोषित`;
    }
    if (hlDecSub && summary) {
        hlDecSub.innerText = `मतगणना प्रगति: ${summary.countedPercentage || 0}% (${(summary.totalCountedVotes || 0).toLocaleString('hi-IN')} मत गिने गए)`;
    }
}

// 8. Render Summary KPI Cards
function renderSummaryCards(summary) {
    if (!summary) return;
    const decEl = document.getElementById("kpiDeclaredWards");
    const countEl = document.getElementById("kpiCountingWards");
    const totalCountedEl = document.getElementById("kpiTotalCountedVotes");
    const countedPctEl = document.getElementById("kpiCountedPercentageSub");

    const resDec = document.getElementById("resDeclaredCount");
    const resCount = document.getElementById("resCountingCount");
    const resPend = document.getElementById("resPendingCount");
    const resVotes = document.getElementById("resCountedVotes");
    const resPct = document.getElementById("resCountedPct");

    if (decEl) decEl.innerText = summary.declaredWards || 0;
    if (countEl) countEl.innerText = summary.countingWards || 0;
    if (totalCountedEl) totalCountedEl.innerText = (summary.totalCountedVotes || 0).toLocaleString('hi-IN');
    if (countedPctEl) countedPctEl.innerText = `${summary.countedPercentage || 0}% गिने गए मत`;

    if (resDec) resDec.innerText = summary.declaredWards || 0;
    if (resCount) resCount.innerText = summary.countingWards || 0;
    if (resPend) resPend.innerText = summary.pendingWards || 35;
    if (resVotes) resVotes.innerText = (summary.totalCountedVotes || 0).toLocaleString('hi-IN');
    if (resPct) resPct.innerText = `${summary.countedPercentage || 0}%`;

    // Gender Bifurcation Calculation & Rendering
    let maleWon = 0, femaleWon = 0, maleLead = 0, femaleLead = 0;
    if (summary && summary.genderTally) {
        maleWon = summary.genderTally.male?.won || 0;
        maleLead = summary.genderTally.male?.leading || 0;
        femaleWon = summary.genderTally.female?.won || 0;
        femaleLead = summary.genderTally.female?.leading || 0;
    } else if (resultsData && resultsData.wards) {
        resultsData.wards.forEach(w => {
            const isFemale = (w.winner_gender === 'F' || (w.candidates && w.candidates.find(c => c.name === w.winner_name)?.gender === 'F'));
            if (w.status === 'Declared') {
                if (isFemale) femaleWon++; else maleWon++;
            } else if (w.status === 'Counting' && w.leader && w.total_counted_votes > 0) {
                const leadFemale = (w.leader.gender === 'F' || (w.candidates && w.candidates.find(c => c.name === w.leader.name)?.gender === 'F'));
                if (leadFemale) femaleLead++; else maleLead++;
            }
        });
    }

    // 1. KPI Grid Card
    const kpiMaleEl = document.getElementById("kpiMaleWin");
    const kpiFemaleEl = document.getElementById("kpiFemaleWin");
    const kpiRatioSubEl = document.getElementById("kpiGenderRatioSub");
    if (kpiMaleEl) kpiMaleEl.innerText = maleWon;
    if (kpiFemaleEl) kpiFemaleEl.innerText = femaleWon;
    if (kpiRatioSubEl) kpiRatioSubEl.innerHTML = `👨 ${maleWon} पुरुष | 👩 ${femaleWon} महिला (${maleWon + femaleWon} कुल)`;

    // 2. Dedicated Gender Bifurcation Widget below Majority Meter
    const gmWonEl = document.getElementById("genderMaleWon");
    const gmLeadEl = document.getElementById("genderMaleLead");
    const gfWonEl = document.getElementById("genderFemaleWon");
    const gfLeadEl = document.getElementById("genderFemaleLead");
    if (gmWonEl) gmWonEl.innerText = maleWon;
    if (gmLeadEl) gmLeadEl.innerText = maleLead;
    if (gfWonEl) gfWonEl.innerText = femaleWon;
    if (gfLeadEl) gfLeadEl.innerText = femaleLead;

    const totalWon = maleWon + femaleWon;
    const barMale = document.getElementById("genderBarMale");
    const barFemale = document.getElementById("genderBarFemale");
    const ratioMaleText = document.getElementById("genderMaleRatioText");
    const ratioFemaleText = document.getElementById("genderFemaleRatioText");
    const totalDecText = document.getElementById("genderTotalDeclaredText");

    if (totalWon > 0) {
        const mPct = (maleWon / totalWon) * 100;
        const fPct = (femaleWon / totalWon) * 100;
        if (barMale) barMale.style.width = mPct + '%';
        if (barFemale) barFemale.style.width = fPct + '%';
        if (ratioMaleText) ratioMaleText.innerText = `पुरुष: ${Math.round(mPct)}% (${maleWon} विजयी)`;
        if (ratioFemaleText) ratioFemaleText.innerText = `महिला: ${Math.round(fPct)}% (${femaleWon} विजयी)`;
    } else {
        if (barMale) barMale.style.width = '0%';
        if (barFemale) barFemale.style.width = '0%';
        if (ratioMaleText) ratioMaleText.innerText = `पुरुष: 0% (0 विजयी)`;
        if (ratioFemaleText) ratioFemaleText.innerText = `महिला: 0% (0 विजयी)`;
    }
    if (totalDecText) totalDecText.innerText = `कुल घोषित परिणाम: ${totalWon} / 35 वार्ड`;

    // 3. TV Screen Elements
    const tvMaleEl = document.getElementById("tvMaleWon");
    const tvFemaleEl = document.getElementById("tvFemaleWon");
    if (tvMaleEl) tvMaleEl.innerText = maleWon;
    if (tvFemaleEl) tvFemaleEl.innerText = femaleWon;
}

// 9. Render 35-Ward Dashboard Summary Table
function renderDashboardSummaryTable() {
    const tbody = document.getElementById("dashSummaryTbody");
    if (!tbody || !resultsData || !resultsData.wards) return;

    const searchTerm = document.getElementById("dashSearchInput")?.value?.trim().toLowerCase() || '';

    let wards = resultsData.wards;
    if (searchTerm) {
        wards = wards.filter(w => {
            const wNum = String(w.ward);
            const wLead = (w.leader ? w.leader.name : '').toLowerCase();
            const wWin = (w.winner_name || '').toLowerCase();
            const candMatch = w.candidates.some(c => c.name.toLowerCase().includes(searchTerm) || c.party.toLowerCase().includes(searchTerm));
            return wNum.includes(searchTerm) || wLead.includes(searchTerm) || wWin.includes(searchTerm) || candMatch;
        });
    }

    let html = '';
    wards.forEach(w => {
        const isDeclared = (w.status === 'Declared');
        const isCounting = (w.status === 'Counting');
        const isNirvirodh = (w.ward === 26);
        const partsCount = (w.parts && w.parts.length > 0) ? w.parts.length : 1;

        let statusBadge = '';
        if (isDeclared) {
            statusBadge = `<span class="badge" style="background:#dcfce7; color:#15803d; border:1px solid #86efac; font-weight:700;"><i class="fas fa-check-circle"></i> ${isNirvirodh ? 'निर्विरोध' : 'घोषित'}</span>`;
        } else if (isCounting) {
            statusBadge = `<span class="badge" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; font-weight:700; animation:pulse 1.5s infinite;"><i class="fas fa-bolt"></i> गणना जारी</span>`;
        } else {
            statusBadge = `<span style="color:#64748b; font-size:12px; font-weight:600; display:inline-flex; align-items:center; gap:5px;"><i class="far fa-clock" style="color:#94a3b8;"></i> प्रतीक्षारत</span>`;
        }

        let leaderName = '-';
        let genderBadge = `<span style="color:#94a3b8; font-size:12px;">-</span>`;
        let partyTag = '-';
        let votes = 0;
        let marginStr = '-';

        if (isDeclared) {
            leaderName = `<span style="font-weight:700; color:#15803d;"><i class="fas fa-award"></i> ${w.winner_name || '-'}</span>`;
            const pClass = getPartyClass(w.winner_party || '');
            const pLabel = getPartyShortLabel(w.winner_party || '');
            partyTag = `<span class="party-tag ${pClass.replace('party-','')}">${pLabel}</span>`;
            votes = (w.winner_votes || 0).toLocaleString('hi-IN');
            marginStr = isNirvirodh ? 'निर्विरोध' : `+${(w.margin || 0).toLocaleString('hi-IN')}`;

            const winCand = w.candidates ? w.candidates.find(c => c.id === (w.winner_id || (w.leader ? w.leader.id : null)) || c.name === w.winner_name) : null;
            const isFemale = (w.winner_gender === 'F' || (winCand && (winCand.gender === 'F' || winCand.gender_hi === 'महिला')));
            genderBadge = isFemale 
                ? `<span class="badge" style="background:#fce7f3; color:#db2777; border:1px solid #fbcfe8; font-size:12.5px; font-weight:700;"><i class="fas fa-venus"></i> महिला</span>`
                : `<span class="badge" style="background:#e0f2fe; color:#2563eb; border:1px solid #bfdbfe; font-size:12.5px; font-weight:700;"><i class="fas fa-mars"></i> पुरुष</span>`;
        } else if (isCounting && w.leader) {
            leaderName = `<span style="font-weight:700; color:#b45309;"><i class="fas fa-bolt"></i> ${w.leader.name}</span>`;
            const pClass = getPartyClass(w.leader.party || '');
            const pLabel = getPartyShortLabel(w.leader.party || '');
            partyTag = `<span class="party-tag ${pClass.replace('party-','')}">${pLabel}</span>`;
            votes = (w.leader.votes || 0).toLocaleString('hi-IN');
            marginStr = `+${(w.margin || 0).toLocaleString('hi-IN')}`;

            const leadCand = w.candidates ? w.candidates.find(c => c.id === w.leader.id || c.name === w.leader.name) : null;
            const isFemale = (leadCand && (leadCand.gender === 'F' || leadCand.gender_hi === 'महिला'));
            genderBadge = isFemale 
                ? `<span class="badge" style="background:#fce7f3; color:#db2777; border:1px solid #fbcfe8; font-size:12.5px; font-weight:700;"><i class="fas fa-venus"></i> महिला</span>`
                : `<span class="badge" style="background:#e0f2fe; color:#2563eb; border:1px solid #bfdbfe; font-size:12.5px; font-weight:700;"><i class="fas fa-mars"></i> पुरुष</span>`;
        }

        const canEdit = currentUser && (currentUser.role === 'RO' || currentUser.role.startsWith('OP'));
        const actionButtons = `
            <div style="display:flex; gap:6px; justify-content:center;">
                ${isDeclared ? `
                    <button class="btn-primary" style="padding:5px 12px; font-size:12px; background:#0284c7; border-color:#0284c7; color:white; border-radius:5px; font-weight:700;" onclick="openForm21Certificate(${w.ward})" title="प्ररूप 21 देखें">
                        <i class="fas fa-award"></i> प्ररूप 21
                    </button>
                ` : ''}
            </div>
        `;


        html += `
            <tr style="background:#ffffff;">
                <td><b style="font-size:14px;">वार्ड ${w.ward}</b></td>
                <td style="font-size:13.5px;">${(w.total_electors || 0).toLocaleString('hi-IN')}</td>
                <td style="font-size:13.5px;">${(w.total_polled_votes || 0).toLocaleString('hi-IN')}</td>
                <td>
                    ${partsCount > 1 
                        ? `<span class="badge" style="background:#f0f9ff; color:#0284c7; border:1px solid #bae6fd; font-size:12px; font-weight:700;">${partsCount} भाग (EVM)</span>` 
                        : `<span style="color:#64748b; font-size:13px; font-weight:600;">1 भाग</span>`}
                </td>
                <td style="text-align:left; font-size:14px;">${leaderName}</td>
                <td>${genderBadge}</td>
                <td>${partyTag}</td>
                <td><b style="font-size:14.5px;">${votes}</b></td>
                <td><b style="color:#0284c7; font-size:14.5px;">${marginStr}</b></td>
                <td>${statusBadge}</td>
                <td>${actionButtons}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// 10. Dedicated On-Page Counting Entry Initializer
function initOnPageCountingEntry(targetWard = 1, force = false) {
    if (!resultsData || !resultsData.wards) {
        fetchResultsData(false).then(() => initOnPageCountingEntry(targetWard, force));
        return;
    }

    const tWard = parseInt(targetWard) || 1;
    currentCountingWard = tWard;

    const opContainer = document.getElementById("onPageActiveContainer");
    if (!force && opContainer && opContainer.children.length > 0 && countingState.ward && countingState.ward.ward === tWard) {
        // Active entry form already displayed for this ward — preserve user typing!
        return;
    }

    const selectEl = document.getElementById("onPageWardSelect");
    if (selectEl && (selectEl.options.length === 0 || force)) {
        selectEl.innerHTML = '';
        resultsData.wards.forEach(w => {
            const opt = document.createElement("option");
            opt.value = w.ward;
            const statusIcon = w.status === 'Declared' ? '🏆 ' : (w.status === 'Counting' ? '⚡ ' : '⏳ ');
            opt.innerText = `${statusIcon}वार्ड संख्या ${w.ward} (${w.status})`;
            selectEl.appendChild(opt);
        });
    }
    if (selectEl) {
        selectEl.value = tWard;
    }

    onCountingWardSelected(tWard, force);
}

function onOnPageWardSelected(wardNo) {
    onCountingWardSelected(wardNo, true);
}

// 11. Big Screen TV / Control Room Display
function getPartyBadgeBg(partyName) {
    if (!partyName) return '#475569';
    const p = String(partyName).toUpperCase();
    if (partyName.includes('भारतीय जनता') || p.includes('BJP')) return '#ea580c';
    if (partyName.includes('कांग्रेस') || p.includes('INC')) return '#0284c7';
    if (partyName.includes('निर्दलीय') || p.includes('IND')) return '#9333ea';
    if (partyName.includes('आम आदमी') || p.includes('AAP')) return '#ca8a04';
    return '#475569';
}

function renderLiveDisplay() {
    if (!resultsData || !resultsData.summary) return;
    const summary = resultsData.summary;

    const tvDec = document.getElementById("tvDeclaredWards");
    const tvCount = document.getElementById("tvCountingWards");
    const tvVotes = document.getElementById("tvCountedVotes");
    const tvPct = document.getElementById("tvCountedPct");
    const tvLead = document.getElementById("tvLeadingParty");
    const tvMaleEl = document.getElementById("tvMaleWon");
    const tvFemaleEl = document.getElementById("tvFemaleWon");

    if (tvDec) tvDec.innerText = `${summary.declaredWards || 0} / 35`;
    if (tvCount) tvCount.innerText = summary.countingWards || 0;
    if (tvVotes) tvVotes.innerText = (summary.totalCountedVotes || 0).toLocaleString('hi-IN');
    if (tvPct) tvPct.innerText = `${summary.countedPercentage || 0}%`;

    const gTally = summary.genderTally || resultsData.genderTally || { male: { won: 0 }, female: { won: 0 } };
    if (tvMaleEl) tvMaleEl.innerText = gTally.male?.won || 0;
    if (tvFemaleEl) tvFemaleEl.innerText = gTally.female?.won || 0;

    const tally = summary.partyTally || resultsData.tally;
    if (tally && tvLead) {
        let topParty = 'BJP';
        let topCount = -1;
        Object.entries(tally).forEach(([code, p]) => {
            if ((p.total || p.won || 0) > topCount) {
                topCount = (p.total || p.won || 0);
                topParty = `${code} (${topCount})`;
            }
        });
        tvLead.innerText = topParty;
    }

    // Update Matrix Status Summary Counts
    const matrixDecEl = document.getElementById("matrixDecCount");
    const matrixCountEl = document.getElementById("matrixCountCount");
    const matrixPendingEl = document.getElementById("matrixPendingCount");

    const declaredWardsCount = summary.declaredWards || 0;
    const countingWardsCount = summary.countingWards || 0;
    const pendingWardsCount = Math.max(0, 35 - declaredWardsCount - countingWardsCount);

    if (matrixDecEl) matrixDecEl.innerText = declaredWardsCount;
    if (matrixCountEl) matrixCountEl.innerText = countingWardsCount;
    if (matrixPendingEl) matrixPendingEl.innerText = pendingWardsCount;

    // Render 35-Ward Visual Matrix Grid
    renderTvWardMatrix(resultsData.wards);

    // Marquee Ticker (High-Impact Broadcast Style with Instant Declared Highlights & Real-Time Auto-Sync)
    const marqueeEl = document.getElementById("tvMarqueeText");
    if (marqueeEl && resultsData.wards) {
        const declared = resultsData.wards.filter(w => w.status === 'Declared');
        const counting = resultsData.wards.filter(w => w.status === 'Counting');
        const tally = summary.partyTally || resultsData.tally || {};

        let tickerItems = [];

        // Sort declared wards so MOST RECENTLY updated/declared wards come FIRST!
        const sortedDeclared = [...declared].sort((a, b) => {
            const tA = new Date(a.updated_at || a.updatedAt || 0).getTime();
            const tB = new Date(b.updated_at || b.updatedAt || 0).getTime();
            return tB - tA;
        });

        // 1. Officially Declared Wards (Front & Center with Winner & Runner-up & Margin)
        if (sortedDeclared.length > 0) {
            sortedDeclared.forEach((w, idx) => {
                const winCand = w.candidates ? w.candidates.find(c => c.name === w.winner_name || c.id === w.winner_id) : null;
                const isF = (w.winner_gender === 'F' || winCand?.gender === 'F' || winCand?.gender_hi === 'महिला');
                const gIcon = isF ? '👩' : '👨';
                const isNirvirodh = (w.ward === 26 || w.uncontested);
                const pColor = getPartyBadgeBg(w.winner_party);
                const pShort = getPartyShortLabel(w.winner_party);

                // Winner votes
                const winVotes = (w.leader?.total_votes || winCand?.total_votes || winCand?.totalVotes || 0);
                const winVotesText = winVotes > 0 ? ` [${winVotes.toLocaleString('hi-IN')} मत]` : '';

                // Runner-up information
                let runnerUpText = '';
                if (!isNirvirodh && w.runnerUp && w.runnerUp.name) {
                    const rShort = getPartyShortLabel(w.runnerUp.party);
                    runnerUpText = ` <span style="color:#cbd5e1; font-weight:700; font-size:16px;">— निकटतम: ${w.runnerUp.name} (${rShort}, ${(w.runnerUp.total_votes || 0).toLocaleString('hi-IN')} मत)</span>`;
                }

                const marginText = isNirvirodh 
                    ? 'निर्विरोध निर्वाचित घोषित' 
                    : `${(w.margin || 0).toLocaleString('hi-IN')} मतों के अंतर से विजयी घोषित`;

                // Flash badge for the newest / top declared ward
                const isNewest = idx === 0;
                const latestBadge = isNewest && sortedDeclared.length > 0
                    ? `<span style="background:linear-gradient(135deg, #ef4444, #b91c1c); color:#ffffff; padding:2px 7px; border-radius:4px; font-size:13px; font-weight:900; margin-right:6px; box-shadow:0 0 10px rgba(239,68,68,0.7); animation:pulse 1.2s infinite;">⚡ ताज़ा परिणाम</span>`
                    : '';

                tickerItems.push(`
                    ${latestBadge}<span style="color:#fde047; font-weight:900; text-shadow:0 0 10px rgba(250,204,21,0.7); font-size:18px;">🏆 [वार्ड ${w.ward} घोषित]</span>:
                    <span style="color:#ffffff; font-weight:900; font-size:18px;">${gIcon} ${w.winner_name}</span>
                    <span style="background:${pColor}; color:#ffffff; padding:2px 7px; border-radius:4px; font-size:13px; font-weight:900; vertical-align:middle;">${pShort}</span>
                    <span style="color:#4ade80; font-weight:900; font-size:18px;">(${marginText}${winVotesText})</span>${runnerUpText}
                `);
            });
        }

        // 2. Live Party Standings & Majority Status (दलगत स्थिति)
        const bjpW = tally.BJP?.won || 0, bjpL = tally.BJP?.leading || 0;
        const incW = tally.INC?.won || 0, incL = tally.INC?.leading || 0;
        const indW = tally.IND?.won || 0, indL = tally.IND?.leading || 0;
        const aapW = tally.AAP?.won || 0, aapL = tally.AAP?.leading || 0;

        let majorityMsg = 'बहुमत: 18 सीटें आवश्यक';
        if (bjpW >= 18) majorityMsg = '🎉 भाजपा (BJP) को 18+ सीटों का स्पष्ट बहुमत!';
        else if (incW >= 18) majorityMsg = '🎉 कांग्रेस (INC) को 18+ सीटों का स्पष्ट बहुमत!';
        else if (indW >= 18) majorityMsg = '🎉 निर्दलीय को 18+ सीटों का स्पष्ट बहुमत!';

        tickerItems.push(`
            <span style="color:#fbbf24; font-weight:900; font-size:18px;">🏛️ [दलगत स्थिति]</span>:
            <span style="color:#ea580c; font-weight:800; font-size:17.5px;">भाजपा: <b>${bjpW}</b> ${bjpL > 0 ? `(+${bjpL} आगे)` : ''}</span> |
            <span style="color:#38bdf8; font-weight:800; font-size:17.5px;">कांग्रेस: <b>${incW}</b> ${incL > 0 ? `(+${incL} आगे)` : ''}</span> |
            <span style="color:#c084fc; font-weight:800; font-size:17.5px;">निर्दलीय: <b>${indW}</b> ${indL > 0 ? `(+${indL} आगे)` : ''}</span> |
            <span style="color:#fde047; font-weight:800; font-size:17.5px;">आप: <b>${aapW}</b></span> |
            <span style="color:#4ade80; font-weight:900; font-size:17.5px;">${majorityMsg}</span>
        `);

        // 3. Active Counting Leads (वर्तमान में जारी मतगणना रुझान)
        if (counting.length > 0) {
            counting.forEach(w => {
                if (w.leader && w.leader.name) {
                    const pShort = getPartyShortLabel(w.leader.party);
                    const pColor = getPartyBadgeBg(w.leader.party);
                    const lVotes = (w.leader.total_votes || 0);
                    tickerItems.push(`
                        <span style="color:#f59e0b; font-weight:900; font-size:17.5px;">⚡ [वार्ड ${w.ward} मतगणना रुझान]</span>:
                        <span style="color:#ffffff; font-weight:800; font-size:17.5px;">${w.leader.name}</span>
                        <span style="background:${pColor}; color:#ffffff; padding:2px 6px; border-radius:4px; font-size:13px; font-weight:800; vertical-align:middle;">${pShort}</span>
                        <span style="color:#fde047; font-weight:800; font-size:17.5px;">(+${(w.margin || 0).toLocaleString('hi-IN')} मत बढ़त${lVotes > 0 ? ` | मत: ${lVotes.toLocaleString('hi-IN')}` : ''})</span>
                    `);
                }
            });
        }

        // 4. Overall Counting Progress (समग्र मतगणना रिपोर्ट)
        tickerItems.push(`
            <span style="color:#38bdf8; font-weight:800; font-size:17.5px;">📊 [मतगणना प्रगति]: कुल 35 में से ${declaredWardsCount} परिणाम घोषित, ${countingWardsCount} पर गणना जारी | कुल गिने गए मत: ${(summary.totalCountedVotes || 0).toLocaleString('hi-IN')} (${summary.countedPercentage || 0}%) | 👨 ${gTally.male?.won || 0} पुरुष, 👩 ${gTally.female?.won || 0} महिला विजयी | बहुमत लक्ष्य: 18 सीटें</span>
        `);

        // Fallback if no results declared or counting yet
        if (declared.length === 0 && counting.length === 0) {
            tickerItems.unshift(`
                <span style="color:#ffffff; font-weight:800; font-size:17.5px;">🏛️ सुमेरपुर नगर पालिका आम चुनाव 2026 — मतगणना नियंत्रण कक्ष (SDM Control Room) से सीधा प्रसारण निरंतर जारी... समस्त 35 वार्डों के परिणाम एवं रुझान यहाँ लाइव प्रदर्शित होंगे!</span>
            `);
        }

        const newTickerContent = tickerItems.join('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;✦✦✦&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;');

        // Smooth Update: Only update innerHTML if content has changed (Prevents marquee resetting to 0px on redundant ticks!)
        if (cachedTickerContent !== newTickerContent) {
            cachedTickerContent = newTickerContent;
            marqueeEl.innerHTML = newTickerContent;

            // Flash visual alert on ticker chip if newly declared ward arrived
            if (lastDeclaredCount !== -1 && declared.length > lastDeclaredCount) {
                flashTickerNewResultAlert(sortedDeclared[0]);
            }
            lastDeclaredCount = declared.length;
        }
    }
}

// Flash Ticker Chip Visual Alert & Audio Chime on New Declared Result
function flashTickerNewResultAlert(latestWard) {
    const chip = document.querySelector(".tv-ticker-chip");
    if (!chip) return;

    const originalHtml = chip.innerHTML;
    chip.style.background = "linear-gradient(135deg, #fbbf24 0%, #ea580c 100%)";
    chip.style.boxShadow = "0 0 22px rgba(251, 191, 36, 0.95)";
    chip.innerHTML = `<span class="live-pulse-dot" style="background:#fff; width:12px; height:12px; margin-right:6px;"></span> 💥 नया परिणाम घोषित!`;

    // Play subtle audio announcement chime
    playResultDeclaredChime();

    setTimeout(() => {
        chip.style.background = "";
        chip.style.boxShadow = "";
        chip.innerHTML = originalHtml;
    }, 15000);
}

function playResultDeclaredChime() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        if (ctx.state === 'suspended') ctx.resume();

        const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 major chord
        notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.08, ctx.currentTime + idx * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + idx * 0.12);
            osc.stop(ctx.currentTime + idx * 0.12 + 0.4);
        });
    } catch(e) {}
}

// TV Highlights Showcase
function renderTvHighlights(summary, wards) {
    if (!wards || wards.length === 0) return;

    // 1. Recent Winners Showcase
    const recentContainer = document.getElementById("tvRecentWinnersShowcase");
    if (recentContainer) {
        const declared = wards.filter(w => w.status === 'Declared');
        if (declared.length === 0) {
            recentContainer.innerHTML = `<span style="color:#94a3b8; font-size:13px;">अभी कोई परिणाम घोषित नहीं हुआ है।</span>`;
        } else {
            // Show up to 4 declared wards
            let chipsHtml = '';
            declared.slice(0, 4).forEach(w => {
                const isNirvirodh = (w.ward === 26);
                const pBg = getPartyBadgeBg(w.winner_party);
                const winCand = w.candidates ? w.candidates.find(c => c.id === w.winner_id || c.name === w.winner_name) : null;
                const isFemale = (w.winner_gender === 'F' || (winCand && (winCand.gender === 'F' || winCand.gender_hi === 'महिला')));
                const gIcon = isFemale ? '👩' : '👨';
                chipsHtml += `
                    <div style="background: rgba(16, 185, 129, 0.14); border: 1px solid #10b981; border-radius: 8px; padding: 6px 12px; display: inline-flex; align-items: center; gap: 8px; cursor: pointer;" onclick="openForm21Certificate(${w.ward})" title="प्ररूप 21 देखें">
                        <span style="font-weight:900; color:#10b981;">वार्ड ${w.ward}:</span>
                        <span style="color:white; font-weight:700;">${gIcon} ${w.winner_name}</span>
                        <span class="badge" style="background:${pBg}; color:white; font-size:11px; padding:2px 6px;">${getPartyShortLabel(w.winner_party)}</span>
                        <span style="color:#cbd5e1; font-size:12px; font-weight:600;">${isNirvirodh ? '[निर्विरोध]' : `[+${w.margin || 0}]`}</span>
                    </div>
                `;
            });
            recentContainer.innerHTML = chipsHtml;
        }
    }

    // 2. Highest Margin Showcase
    const marginContainer = document.getElementById("tvHighestMarginShowcase");
    if (marginContainer) {
        let maxMarginWard = null;
        wards.forEach(w => {
            if (w.status === 'Declared' && (w.margin || 0) > (maxMarginWard ? (maxMarginWard.margin || 0) : -1)) {
                maxMarginWard = w;
            }
        });

        if (maxMarginWard) {
            const isNirvirodh = (maxMarginWard.ward === 26);
            const pBg = getPartyBadgeBg(maxMarginWard.winner_party);
            marginContainer.innerHTML = `
                <div style="background: rgba(56, 189, 248, 0.14); border: 1px solid #38bdf8; border-radius: 8px; padding: 6px 14px; display: inline-flex; align-items: center; gap: 10px; cursor: pointer;" onclick="openForm21Certificate(${maxMarginWard.ward})">
                    <span style="font-weight:900; color:#38bdf8;">वार्ड ${maxMarginWard.ward}:</span>
                    <span style="color:white; font-weight:700;">${maxMarginWard.winner_name}</span>
                    <span class="badge" style="background:${pBg}; color:white; font-size:11px; padding:2px 6px;">${getPartyShortLabel(maxMarginWard.winner_party)}</span>
                    <span style="color:#facc15; font-weight:800; font-size:13px;">${isNirvirodh ? 'निर्विरोध निर्वाचित' : `${maxMarginWard.margin} मतों का अंतर`}</span>
                </div>
            `;
        } else {
            marginContainer.innerHTML = `
                <div style="background: rgba(56, 189, 248, 0.14); border: 1px solid #38bdf8; border-radius: 8px; padding: 6px 14px; display: inline-flex; align-items: center; gap: 10px;">
                    <span style="font-weight:900; color:#38bdf8;">वार्ड 26:</span>
                    <span style="color:white; font-weight:700;">श्रीमती वीणा देवड़ा (BJP)</span>
                    <span style="color:#facc15; font-weight:800; font-size:13px;">निर्विरोध निर्वाचित</span>
                </div>
            `;
        }
    }
}

// Render 35-Ward Live Matrix Grid
function renderTvWardMatrix(wards) {
    const container = document.getElementById("tvWardMatrixGrid");
    if (!container || !wards) return;

    let html = '';
    const sortedWards = [...wards].sort((a, b) => a.ward - b.ward);

    sortedWards.forEach(w => {
        const isDeclared = (w.status === 'Declared');
        const isCounting = (w.status === 'Counting');
        const isPending = !isDeclared && !isCounting;
        const isNirvirodh = (w.ward === 26);

        let statusClass = isDeclared ? 'status-declared' : (isCounting ? 'status-counting' : 'status-pending');
        let statusText = isDeclared ? (isNirvirodh ? 'निर्विरोध' : 'घोषित') : (isCounting ? 'गणना जारी' : 'प्रतीक्षारत');
        let statusBadgeBg = isDeclared ? '#10b981' : (isCounting ? '#f59e0b' : '#334155');
        let statusBadgeColor = isDeclared ? '#ffffff' : (isCounting ? '#000000' : '#cbd5e1');

        let candName = '-';
        let partyTag = '';
        let diffMeta = '';

        if (isDeclared && w.winner_name) {
            candName = w.winner_name;
            const pCode = getPartyShortLabel(w.winner_party);
            const pBg = getPartyBadgeBg(w.winner_party);
            partyTag = `<span class="tv-tile-party" style="background:${pBg};">${pCode}</span>`;
            diffMeta = isNirvirodh ? '<span style="color:#facc15; font-weight:800;">निर्विरोध</span>' : `+${w.margin || 0} मत`;
        } else if (isCounting && w.leader) {
            candName = w.leader.name;
            const pCode = getPartyShortLabel(w.leader.party);
            const pBg = getPartyBadgeBg(w.leader.party);
            partyTag = `<span class="tv-tile-party" style="background:${pBg};">${pCode}</span>`;
            diffMeta = `<span style="color:#facc15; font-weight:800;">+${w.margin || 0} बढ़त</span>`;
        } else {
            candName = '<span style="color:#64748b; font-size:12.5px;">मतगणना प्रतीक्षारत</span>';
            const partsCount = (w.parts && w.parts.length) ? w.parts.length : (w.evm_parts || 1);
            partyTag = `<span style="color:#64748b; font-size:11px; font-weight:600;">${partsCount} भाग (EVM)</span>`;
            diffMeta = `<span style="color:#94a3b8;">${(w.total_polled_votes || 0).toLocaleString('hi-IN')} मत</span>`;
        }

        const clickAction = isDeclared ? `openForm21Certificate(${w.ward})` : `onCountingWardSelected(${w.ward}, true); navigateTo('entry');`;

        html += `
            <div class="tv-ward-tile ${statusClass}" onclick="${clickAction}" title="वार्ड ${w.ward}: ${statusText} (क्लिक कर विवरण देखें)">
                <div class="tv-tile-head">
                    <span class="tv-tile-num">वार्ड ${String(w.ward).padStart(2, '0')}</span>
                    <span class="tv-tile-status-pill" style="background:${statusBadgeBg}; color:${statusBadgeColor};">
                        ${isDeclared ? '<i class="fas fa-check"></i> ' : (isCounting ? '<i class="fas fa-spinner fa-spin"></i> ' : '')}${statusText}
                    </span>
                </div>
                <div class="tv-tile-cand" title="${w.winner_name || (w.leader ? w.leader.name : '')}">
                    ${candName}
                </div>
                <div class="tv-tile-meta">
                    <div>${partyTag}</div>
                    <div class="tv-tile-diff">${diffMeta}</div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function openFirstDeclaredForm21() {
    if (!resultsData || !resultsData.wards) return;
    const declared = resultsData.wards.find(w => w.status === 'Declared');
    if (declared) {
        openForm21Certificate(declared.ward);
    } else {
        openForm21Certificate(26);
    }
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
            const winCand = w.candidates ? w.candidates.find(c => c.id === w.winner_id || c.name === w.winner_name) : null;
            const isFemale = (w.winner_gender === 'F' || (winCand && (winCand.gender === 'F' || winCand.gender_hi === 'महिला')));
            const winGenderBadge = isFemale 
                ? `<span class="badge" style="background:#fce7f3; color:#db2777; border:1px solid #fbcfe8; font-size:11px; padding:1px 6px; font-weight:700; margin-left:4px;"><i class="fas fa-venus"></i> महिला</span>`
                : `<span class="badge" style="background:#e0f2fe; color:#2563eb; border:1px solid #bfdbfe; font-size:11px; padding:1px 6px; font-weight:700; margin-left:4px;"><i class="fas fa-mars"></i> पुरुष</span>`;
            const marginText = isNirvirodh ? 'निर्विरोध निर्वाचित' : (w.margin > 0 ? `${w.margin} मतों से विजयी` : 'विजयी घोषित');
            bannerHtml = `
                <div class="result-banner winner">
                    <div style="font-size: 13.5px; font-weight: 800; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <i class="fas fa-trophy" style="color:#eab308; font-size:16px;"></i>
                        <span>विजेता: ${w.winner_name}</span>
                        ${winGenderBadge}
                    </div>
                    <div style="font-size: 11.5px; margin-top:2px; opacity:0.9;">
                        दल: <b>${w.winner_party}</b> | <b>${marginText}</b>
                    </div>
                </div>
            `;
        } else if (isCounting && w.leader) {
            const leadCand = w.candidates ? w.candidates.find(c => c.id === w.leader.id || c.name === w.leader.name) : null;
            const isFemale = (leadCand && (leadCand.gender === 'F' || leadCand.gender_hi === 'महिला'));
            const leadGenderBadge = isFemale 
                ? `<span class="badge" style="background:#fce7f3; color:#db2777; border:1px solid #fbcfe8; font-size:11px; padding:1px 6px; font-weight:700; margin-left:4px;"><i class="fas fa-venus"></i> महिला</span>`
                : `<span class="badge" style="background:#e0f2fe; color:#2563eb; border:1px solid #bfdbfe; font-size:11px; padding:1px 6px; font-weight:700; margin-left:4px;"><i class="fas fa-mars"></i> पुरुष</span>`;
            bannerHtml = `
                <div class="result-banner lead">
                    <div style="font-size: 13px; font-weight: 700; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <i class="fas fa-chart-line" style="color:#0284c7;"></i>
                        <span>अग्रणी: ${w.leader.name} (${getPartyShortLabel(w.leader.party)})</span>
                        ${leadGenderBadge}
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
            const candGenderBadge = (c.gender === 'F' || c.gender_hi === 'महिला')
                ? `<span class="badge" style="background:#fce7f3; color:#db2777; border:1px solid #fbcfe8; font-size:9.5px; padding:1px 5px; font-weight:700;"><i class="fas fa-venus"></i> महिला</span>`
                : `<span class="badge" style="background:#e0f2fe; color:#2563eb; border:1px solid #bfdbfe; font-size:9.5px; padding:1px 5px; font-weight:700;"><i class="fas fa-mars"></i> पुरुष</span>`;

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
                                <div style="font-size:11px; color:#64748b; margin-top:2px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                    <span class="party-tag ${partyCls}" style="font-size:10px; padding:1px 6px;">${partyShort}</span>
                                    ${candGenderBadge}
                                    <span>प्रतीक: <b>${c.symbol}</b></span>
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
    const tvEl = document.getElementById("liveTvContainer");
    if (!tvEl) return;

    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (tvEl.requestFullscreen) {
            tvEl.requestFullscreen().catch(() => {
                document.documentElement.requestFullscreen();
            });
        } else if (tvEl.webkitRequestFullscreen) {
            tvEl.webkitRequestFullscreen();
        } else if (tvEl.msRequestFullscreen) {
            tvEl.msRequestFullscreen();
        }
        document.body.classList.add("projector-mode-active");
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
        document.body.classList.remove("projector-mode-active");
    }
}

document.addEventListener("fullscreenchange", updateResultsTvFullscreenBtn);
document.addEventListener("webkitfullscreenchange", updateResultsTvFullscreenBtn);

function updateResultsTvFullscreenBtn() {
    const btn = document.getElementById("btnTvFullscreen");
    const container = document.getElementById("liveTvContainer");
    if (!btn || !container) return;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
        btn.innerHTML = `<i class="fas fa-compress"></i> ✖ सामान्य स्क्रीन (Exit)`;
        container.classList.add("is-fullscreen");
        document.body.classList.add("projector-mode-active");
    } else {
        btn.innerHTML = `<i class="fas fa-expand"></i> ⛶ फुल स्क्रीन (Full Screen)`;
        container.classList.remove("is-fullscreen");
        document.body.classList.remove("projector-mode-active");
    }
}

function openAuthModal() {
    const overlay = document.getElementById("loginOverlay");
    if (overlay) overlay.style.display = "flex";
}

// 9. Dynamic Parts / Rounds Counting Entry Modal
function openCountingEntryModal(targetWard = 1) {
    if (!currentUser || (!currentUser.role.startsWith('OP') && currentUser.role !== 'RO')) {
        currentUser = { username: 'ro_sumerpur', role: 'RO', name: 'रिटर्निंग ऑफिसर (SDM)' };
        sessionStorage.setItem("sumerpur_user", JSON.stringify(currentUser));
        localStorage.setItem("currentUser", JSON.stringify(currentUser));
        updateAuthUI();
        showToast("🔑 RO (SDM) मतगणना प्रविष्टि मोड स्वतः सक्रिय!");
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

// =========================================================================
// 🏆 UNIFIED & EASY VOTE COUNTING ENTRY SYSTEM (एकल व बहु-भाग प्रविष्टि)
// =========================================================================

let countingState = {
    ward: null,
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

function onCountingWardSelected(wardNo, force = false) {
    const tWard = parseInt(wardNo);
    currentCountingWard = tWard;
    if (!resultsData || !resultsData.wards) return;

    const ward = resultsData.wards.find(w => w.ward === currentCountingWard);
    if (!ward) return;

    const opContainer = document.getElementById("onPageActiveContainer");
    if (!force && opContainer && opContainer.children.length > 0 && countingState.ward && countingState.ward.ward === tWard) {
        // Guard: Form is already loaded for this ward. Do not re-render and wipe user typing!
        return;
    }

    const parts = (ward.parts && ward.parts.length > 0) 
        ? ward.parts 
        : [{ part: 1, booth_no: ward.ward, polled_votes: ward.total_polled_votes, name: `वार्ड ${ward.ward} मतदान केंद्र` }];
    const partCount = parts.length;

    // Update top header elements & Executive KPI Cards
    const electorsEl = document.getElementById("cModalElectors");
    const polledEl = document.getElementById("cModalPolled");
    const statusEl = document.getElementById("cModalStatus");
    if (electorsEl) electorsEl.innerText = (ward.total_electors || 0).toLocaleString('hi-IN');
    if (polledEl) polledEl.innerText = (ward.total_polled_votes || 0).toLocaleString('hi-IN');
    if (statusEl) statusEl.innerText = ward.status;

    const opElectors = document.getElementById("onPageElectors");
    const opPolled = document.getElementById("onPagePolled");
    const opStatus = document.getElementById("onPageStatus");
    const opBoothCount = document.getElementById("onPageBoothCount");
    const opStatusContainer = document.getElementById("onPageStatusContainer");

    if (opElectors) opElectors.innerText = (ward.total_electors || 0).toLocaleString('hi-IN');
    if (opPolled) opPolled.innerText = (ward.total_polled_votes || 0).toLocaleString('hi-IN');
    if (opBoothCount) opBoothCount.innerText = partCount > 1 ? `${partCount} भाग (2 बूथ)` : `1 भाग (एकल बूथ)`;

    if (opStatusContainer) {
        if (ward.status === 'Declared') {
            opStatusContainer.innerHTML = `<span class="status-pill-declared"><i class="fas fa-check-circle"></i> परिणाम घोषित</span>`;
        } else if (ward.status === 'Counting') {
            opStatusContainer.innerHTML = `<span class="status-pill-counting"><i class="fas fa-spinner fa-spin"></i> मतगणना जारी</span>`;
        } else {
            opStatusContainer.innerHTML = `<span class="status-pill-pending"><i class="far fa-clock"></i> प्रतीक्षारत</span>`;
        }
    } else if (opStatus) {
        opStatus.innerText = ward.status;
    }

    const tableInput = document.getElementById("countingTableNo");
    if (tableInput) tableInput.value = ward.counting_table_no || 1;
    const opTableInput = document.getElementById("onPageTableNo");
    if (opTableInput) opTableInput.value = ward.counting_table_no || 1;

    const wardSelect = document.getElementById("countingWardSelect");
    if (wardSelect) wardSelect.value = currentCountingWard;
    const opWardSelect = document.getElementById("onPageWardSelect");
    if (opWardSelect) opWardSelect.value = currentCountingWard;

    // Update structure pill
    const structText = partCount > 1 
        ? `कुल ${partCount} मतदान केंद्र (भाग 1 एवं भाग 2 एक साथ प्रविष्टि)` 
        : `एकल मतदान केंद्र (1 भाग)`;
    const opPill = document.getElementById("onPageStructureText");
    if (opPill) opPill.innerText = structText;
    const modalPill = document.getElementById("cModalStructureText");
    if (modalPill) modalPill.innerText = structText;

    // Initialize State
    countingState.ward = ward;
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

    renderUnifiedWardCountingEntry();
}

// Quick vote stepper increment / decrement
function stepVote(inputId, delta, partIdx) {
    const el = document.getElementById(inputId);
    if (!el) return;
    let val = parseInt(el.value) || 0;
    val = Math.max(0, val + delta);
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
}

function renderUnifiedWardCountingEntry() {
    const containers = [
        document.getElementById("countingActiveTabContainer"),
        document.getElementById("onPageActiveContainer")
    ].filter(Boolean);
    if (containers.length === 0) return;

    const { ward, parts, partCount } = countingState;

    // Special handling for Ward 26 (निर्विरोध निर्वाचित - वीणा देवड़ा BJP)
    if (ward.ward === 26 || ward.isNirvirodh) {
        const nirvirodhHtml = `
            <div class="card" style="padding: 36px 24px; text-align: center; background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 50%, #fde68a 100%); border: 2px solid #facc15; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(234, 179, 8, 0.15);">
                <div style="font-size: 58px; color: #d97706; margin-bottom: 12px; animation: bounce 2s infinite;">
                    <i class="fas fa-award"></i>
                </div>
                <h2 style="color: #78350f; margin: 0 0 10px 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px;">
                    वार्ड संख्या 26 — निर्विरोध निर्वाचन (Uncontested Winner)
                </h2>
                <div style="display: inline-flex; align-items: center; gap: 12px; background: white; padding: 12px 28px; border-radius: 40px; border: 1.5px solid #f59e0b; margin-bottom: 18px; box-shadow: 0 4px 14px rgba(0,0,0,0.06);">
                    <span style="font-size: 20px; font-weight: 900; color: #b45309;">श्रीमती वीणा देवड़ा</span>
                    <span class="party-badge-modern party-bjp" style="font-size: 14px; padding: 6px 16px;">भाजपा (BJP)</span>
                </div>
                <p style="max-width: 640px; margin: 0 auto 24px auto; color: #92400e; font-size: 14px; line-height: 1.6; font-weight: 500;">
                    वार्ड संख्या 26 में एकमात्र विधिमान्य नामनिर्देशन पत्र प्राप्त होने के फलस्वरूप श्रीमती वीणा देवड़ा को निर्विरोध निर्वाचित घोषित किया गया है। यहाँ ईवीएम मतगणना की आवश्यकता नहीं है।
                </p>
                <div style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap;">
                    <button type="button" class="btn-primary" style="background: linear-gradient(135deg, #d97706 0%, #b45309 100%); border: none; padding: 12px 28px; font-weight: 800; font-size: 14.5px; border-radius: 9px; box-shadow: 0 4px 14px rgba(217,119,6,0.3); cursor: pointer;" onclick="openForm21Certificate(26)">
                        <i class="fas fa-certificate"></i> प्ररूप 21 (निर्वाचन प्रमाण-पत्र) देखें व मुद्रित करें
                    </button>
                    <button type="button" class="btn-primary" style="background: #2563eb; border: none; padding: 12px 24px; font-weight: 800; font-size: 14.5px; border-radius: 9px; cursor: pointer;" onclick="onCountingWardSelected(1, true)">
                        <i class="fas fa-arrow-right"></i> वार्ड 1 चुनें (मत प्रविष्टि हेतु)
                    </button>
                </div>
            </div>
        `;
        containers.forEach(c => c.innerHTML = nirvirodhHtml);
        return;
    }

    // Build Sequential Part Entry Cards
    let partsCardsHtml = '';
    for (let p = 0; p < partCount; p++) {
        const pt = parts[p];
        const targetVotes = pt.polled_votes || 0;
        const partNumber = pt.part || (p + 1);

        let candRows = '';
        ward.candidates.forEach((c) => {
            const rVotes = countingState.candVotes[c.id] || [];
            const curVal = rVotes[p] || 0;

            candRows += `
                <tr>
                    <td style="width: 50px; text-align: center;">
                        <div class="cand-serial-chip">${c.candidate_no}</div>
                    </td>
                    <td style="text-align: left;">
                        <span style="font-weight: 800; font-size: 15px; color: #0f172a; letter-spacing: -0.2px;">${c.name}</span>
                    </td>
                    <td style="text-align: center; width: 140px;">
                        <span class="party-badge-modern ${getPartyCssClass(c.party)}">${getPartyShortLabel(c.party)}</span>
                    </td>
                    <td style="text-align: center; width: 90px; font-size: 13px; font-weight: 700; color: #475569;">
                        ${c.symbol || '-'}
                    </td>
                    <td style="text-align: center; width: 190px;">
                        <div class="vote-stepper-box">
                            <button type="button" class="vote-stepper-btn" onclick="stepVote('cand_p${p}_${c.id}', -1, ${p})" title="1 घटाएं">-1</button>
                            <input type="number" 
                                   class="counting-vote-input-stepper part-${p}-input" 
                                   id="cand_p${p}_${c.id}"
                                   data-cand-id="${c.id}"
                                   data-part-idx="${p}"
                                   value="${curVal}" 
                                   min="0"
                                   placeholder="0"
                                   oninput="updateLiveCalculations()">
                            <button type="button" class="vote-stepper-btn" onclick="stepVote('cand_p${p}_${c.id}', 1, ${p})" title="1 बढ़ाएं">+1</button>
                            <button type="button" class="vote-stepper-btn" style="background:#eff6ff; color:#1d4ed8; font-weight:800; font-size:10.5px;" onclick="stepVote('cand_p${p}_${c.id}', 10, ${p})" title="10 बढ़ाएं">+10</button>
                        </div>
                    </td>
                </tr>
            `;
        });

        // NOTA Row
        const curNotaVal = countingState.notaVotes[p] || 0;
        candRows += `
            <tr class="nota-row-modern">
                <td style="text-align: center;">
                    <div class="cand-serial-chip" style="background:#fef3c7; color:#b45309;"><i class="fas fa-ban"></i></div>
                </td>
                <td style="text-align: left;">
                    <div style="font-weight: 800; font-size: 14px; color: #92400e; display: flex; align-items: center; gap: 6px;">
                        <span>NOTA (उपरोक्त में से कोई नहीं)</span>
                    </div>
                    <div style="font-size: 11px; color: #b45309;">None of the Above (EVM Option)</div>
                </td>
                <td style="text-align: left; color: #92400e; font-weight: 700;">-</td>
                <td style="text-align: center; font-weight: 800; color: #92400e;">NOTA</td>
                <td style="text-align: center;">
                    <div class="vote-stepper-box">
                        <button type="button" class="vote-stepper-btn" onclick="stepVote('nota_p${p}', -1, ${p})" title="1 घटाएं">-1</button>
                        <input type="number" 
                               class="counting-vote-input-stepper part-${p}-input" 
                               id="nota_p${p}"
                               data-part-idx="${p}"
                               data-is-nota="true"
                               value="${curNotaVal}" 
                               min="0"
                               placeholder="0"
                               oninput="updateLiveCalculations()">
                        <button type="button" class="vote-stepper-btn" onclick="stepVote('nota_p${p}', 1, ${p})" title="1 बढ़ाएं">+1</button>
                        <button type="button" class="vote-stepper-btn" style="background:#fef3c7; color:#92400e; font-weight:800; font-size:10.5px;" onclick="stepVote('nota_p${p}', 10, ${p})" title="10 बढ़ाएं">+10</button>
                    </div>
                </td>
            </tr>
        `;

        partsCardsHtml += `
            <div class="counting-part-card-modern">
                <div class="part-card-header-modern ${p === 0 ? 'part-1' : 'part-2'}">
                    <div class="part-title-wrapper">
                        <span class="part-num-badge ${p === 0 ? 'part-1' : 'part-2'}">
                            <i class="fas fa-vote-yea"></i> भाग संख्या ${partNumber}
                        </span>
                        <div>
                            <div class="part-meta-title">
                                ${pt.name || `मतदान केंद्र भाग ${partNumber}`}
                            </div>
                            <div class="part-meta-sub">
                                <i class="fas fa-location-dot" style="font-size:10px; color:#94a3b8;"></i> ${pt.location || pt.name || ''} 
                                &bull; 11-09-2026 कुल दर्ज मतदान: <b>${targetVotes.toLocaleString('hi-IN')} मत</b>
                            </div>
                        </div>
                    </div>

                    <div class="part-progress-wrap">
                        <div style="font-size: 12px; font-weight: 700; color: #475569;">
                            गिने मत: <span id="part_${p}_counted_num" style="font-size: 15px; font-weight: 900; color: ${p === 0 ? '#1e40af' : '#0d9488'};">0</span> / <b>${targetVotes}</b>
                        </div>
                        <div class="part-progress-bar-track">
                            <div id="part_${p}_progress_fill" class="part-progress-bar-fill" style="width: 0%; background: ${p === 0 ? '#2563eb' : '#0d9488'};"></div>
                        </div>
                        <span id="part_${p}_status_badge" style="font-size: 11.5px; font-weight: 700;"></span>
                    </div>
                </div>

                <div class="table-responsive">
                    <table class="counting-table-modern">
                        <thead>
                            <tr>
                                <th style="width: 50px; text-align: center;">क्र.</th>
                                <th style="text-align: left;">प्रत्याशी का नाम</th>
                                <th style="width: 140px; text-align: center;">दल</th>
                                <th style="width: 90px; text-align: center;">प्रतीक</th>
                                <th style="width: 190px; text-align: center;">
                                    भाग ${partNumber} मत (EVM)
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            ${candRows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // Consolidated Real-time Summary Card
    let summaryRowsHtml = '';
    ward.candidates.forEach((c) => {
        let partBreakdownTd = '';
        for (let p = 0; p < partCount; p++) {
            partBreakdownTd += `
                <td id="sum_c${c.id}_p${p}" style="font-weight: 800; color: #1e40af; text-align: center; background: #f8fafc; font-size: 14px;">0</td>
            `;
        }
        const postal = countingState.postalVotes[c.id] || 0;

        summaryRowsHtml += `
            <tr class="summary-cand-row" id="sum_row_${c.id}">
                <td style="width: 50px; text-align: center;">
                    <div class="cand-serial-chip">${c.candidate_no}</div>
                </td>
                <td style="text-align: left;">
                    <span style="font-weight: 800; font-size: 15px; color: #0f172a; letter-spacing: -0.2px;">${c.name}</span>
                </td>
                <td style="text-align: center; width: 140px;">
                    <span class="party-badge-modern ${getPartyCssClass(c.party)}">${getPartyShortLabel(c.party)}</span>
                </td>
                ${partBreakdownTd}
                <td style="text-align: center; width: 90px; background: #fffbeb;">
                    <input type="number" 
                           class="postal-vote-input counting-postal-input" 
                           id="postal_${c.id}"
                           data-cand-id="${c.id}"
                           value="${postal}" 
                           min="0"
                           placeholder="0"
                           oninput="updateLiveCalculations()">
                </td>
                <td style="width: 110px; text-align: center; background: #f1f5f9;">
                    <b id="sum_c${c.id}_total" style="font-size: 16px; font-weight: 900; color: #0f172a;">0</b>
                </td>
                <td style="width: 130px; text-align: center;">
                    <div style="display:flex; align-items:center; justify-content:center;">
                        <div class="vote-share-track"><div class="vote-share-fill" id="sum_c${c.id}_bar" style="width:0%;"></div></div>
                        <span id="sum_c${c.id}_share" style="font-size: 13px; font-weight: 800; color: #334155;">0%</span>
                    </div>
                </td>
            </tr>
        `;
    });

    let partHeaders = '';
    let partFooterTotals = '';
    for (let p = 0; p < partCount; p++) {
        partHeaders += `<th style="width: 95px; text-align: center;">भाग ${parts[p].part}</th>`;
        partFooterTotals += `<td id="sum_foot_p${p}" style="font-weight: 900; color: #1e40af; text-align: center; background: #e0f2fe; font-size: 14px;">0</td>`;
    }

    const isWardDeclared = (ward.status === 'Declared');
    const dynamicInstruction = partCount > 1 
        ? "जैसे ही आप नीचे भाग 1 एवं भाग 2 में मत दर्ज करेंगे, विजेता व जीत का अंतर तुरंत स्वतः निकलेगा।"
        : "जैसे ही आप नीचे भाग 1 में मत दर्ज करेंगे, विजेता व जीत का अंतर तुरंत स्वतः निकलेगा।";

    const formHtml = `
        <div style="display:flex; flex-direction:column; gap:18px;">
            <!-- Hero Live Winner / Leaderboard Showcase Banner -->
            <div id="liveWinnerBanner" class="counting-hero-banner ${isWardDeclared ? 'declared' : 'counting'}">
                <div class="hero-banner-inner">
                    <div class="hero-leader-info">
                        <div class="hero-avatar">
                            <i class="fas ${isWardDeclared ? 'fa-award' : 'fa-trophy'}"></i>
                        </div>
                        <div class="hero-text-block">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span class="hero-sub-pill">
                                    <i class="fas fa-bolt" style="color: #eab308;"></i> रीयल-टाइम गणना एवं परिणाम विश्लेषण
                                </span>
                                <span id="bannerStatusTag" class="${isWardDeclared ? 'status-pill-declared' : 'status-pill-counting'}">
                                    ${isWardDeclared ? '🏆 आधिकारिक परिणाम घोषित' : '⚡ मतगणना प्रगति पर'}
                                </span>
                            </div>
                            <div id="liveLeaderName" class="hero-leader-name">
                                मत प्रविष्टि प्रारंभ करें...
                            </div>
                            <div id="liveLeaderStats" class="hero-stats-line">
                                ${dynamicInstruction}
                            </div>
                        </div>
                    </div>

                    <div class="hero-actions-block">
                        <div id="liveReconcileBadge" class="reconciliation-badge neutral">
                            <i class="fas fa-scale-balanced"></i> कुल गिने: 0 / ${ward.total_polled_votes || 0}
                        </div>
                        <div id="bannerActionBtnContainer">
                            ${isWardDeclared ? `
                                <button type="button" class="btn-counting-form21" onclick="openForm21Certificate(${ward.ward})">
                                    <i class="fas fa-certificate"></i> प्ररूप 21 प्रमाण-पत्र देखें
                                </button>
                            ` : `
                                <button type="button" class="btn-counting-declare" onclick="saveCountingData('Declared', true)">
                                    <i class="fas fa-award"></i> 🏆 आधिकारिक परिणाम घोषित करें
                                </button>
                            `}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Sequential EVM Part Cards -->
            ${partsCardsHtml}

            <!-- Consolidated Summary Table Card -->
            <div class="summary-card-modern">
                <div class="summary-header-modern">
                    <div class="summary-header-title">
                        <i class="fas fa-chart-pie" style="color: #2563eb;"></i>
                        <span>वार्ड ${ward.ward} — समेकित परिणाम सारणी (Candidate Totals & Final Margin)</span>
                    </div>
                    <div style="font-size: 12px; color: #64748b; font-weight: 600;">
                        * समस्त भागों के मत + डाक मत स्वतः गणना
                    </div>
                </div>

                <div class="table-responsive">
                    <table class="counting-table-modern">
                        <thead>
                            <tr>
                                <th style="width: 50px; text-align: center;">क्र.</th>
                                <th style="text-align: left;">प्रत्याशी का नाम</th>
                                <th style="width: 140px; text-align: center;">दल</th>
                                ${partHeaders}
                                <th style="width: 90px; text-align: center; background: #fef3c7; color: #92400e;">डाक मत</th>
                                <th style="width: 110px; text-align: center; background: #e2e8f0; color: #0f172a; font-weight: 800;">कुल मत</th>
                                <th style="width: 130px; text-align: center;">मत प्रतिशत (Share)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${summaryRowsHtml}
                        </tbody>
                        <tfoot>
                            <tr style="background: #f8fafc; font-weight: 900;">
                                <td colspan="3" style="text-align: right; padding-right: 14px; color: #0f172a; font-size: 13px;">
                                    उप-योग (Sub-Totals):
                                </td>
                                ${partFooterTotals}
                                <td id="sum_foot_postal" style="text-align: center; background: #fef3c7; color: #92400e; font-size: 14px;">0</td>
                                <td id="sum_foot_grand" style="font-size: 17px; font-weight: 900; text-align: center; background: #cbd5e1; color: #0f172a;">0</td>
                                <td id="sum_foot_pct" style="text-align: center; color: #475569; font-size: 13px;">100%</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <!-- Tendered, Rejected & NOTA Strip -->
                <div class="tendered-rejected-strip-modern">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-weight: 800; color: #92400e; font-size: 13.5px;"><i class="fas fa-ban"></i> कुल NOTA मत:</span>
                        <b id="summaryTotalNotaText" style="font-size: 16px; color: #78350f;">0 मत</b>
                    </div>
                    <div style="display: flex; gap: 14px; align-items: center; flex-wrap: wrap;">
                        <div class="tendered-chip-box">
                            <label style="font-size: 12px; font-weight: 700; color: #78350f;">निविदत्त (Tendered):</label>
                            <input type="number" id="countingTenderedVotes" class="tendered-input" value="${countingState.tendered_votes}" min="0" oninput="countingState.tendered_votes = parseInt(this.value) || 0">
                        </div>
                        <div class="tendered-chip-box">
                            <label style="font-size: 12px; font-weight: 700; color: #78350f;">अस्वीकृत (Rejected):</label>
                            <input type="number" id="countingRejectedVotes" class="tendered-input" value="${countingState.rejected_votes}" min="0" oninput="countingState.rejected_votes = parseInt(this.value) || 0">
                        </div>
                    </div>
                </div>

                <!-- Help / Guidance Note Banner -->
                <div style="padding: 12px 22px; background: #eff6ff; border-top: 1px solid #bfdbfe; font-size: 12.5px; color: #1e40af; display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-circle-info" style="font-size: 18px; color: #2563eb; flex-shrink: 0;"></i>
                    <div>
                        <b>💡 परिणाम घोषित करने की प्रक्रिया:</b> 
                        मतगणना जारी रहने तक <b>'💾 केवल प्रगति सेव करें'</b> का प्रयोग करें। समस्त बूथों व डाक मतों की प्रविष्टि पूर्ण होने पर <b>'🏆 आधिकारिक परिणाम घोषित करें'</b> पर क्लिक करें &mdash; इससे दलगत स्थिति अपडेट होगी और <b>प्ररूप 21 (निर्वाचन प्रमाण-पत्र)</b> स्वतः निर्गत हो जाएगा।
                    </div>
                </div>

                <!-- Sticky Actions Bar -->
                <div class="counting-actions-bar-modern">
                    <div class="counting-status-select-wrap">
                        <label style="font-size: 13px; font-weight: 800; color: #0f172a;">परिणाम स्थिति (Status):</label>
                        <select id="countingStatusSelect" class="counting-status-select" onchange="countingState.status = this.value">
                            <option value="Counting" ${countingState.status === 'Counting' ? 'selected' : ''}>मतगणना जारी (Counting)</option>
                            <option value="Declared" ${countingState.status === 'Declared' ? 'selected' : ''}>आधिकारिक परिणाम घोषित (Declared)</option>
                        </select>
                    </div>

                    <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                        <button type="button" 
                                id="btnSaveProgressCounting"
                                class="btn-counting-save-progress" 
                                onclick="saveCountingData('Counting', true)">
                            <i class="fas fa-save"></i> 💾 केवल प्रगति सेव करें (Save Progress)
                        </button>

                        <button type="button" 
                                id="btnDeclareResultCounting"
                                class="btn-counting-declare" 
                                onclick="saveCountingData('Declared', true)">
                            <i class="fas fa-award"></i> 🏆 आधिकारिक परिणाम घोषित करें (Declare Result)
                        </button>

                        ${isWardDeclared ? `
                            <button type="button" 
                                    class="btn-counting-form21" 
                                    onclick="openForm21Certificate(${ward.ward})">
                                <i class="fas fa-certificate"></i> 📄 प्ररूप 21 देखें व मुद्रित करें
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;

    containers.forEach(c => c.innerHTML = formHtml);

    // Initial Live Calculation pass
    updateLiveCalculations();

    // Setup fast keyboard navigation (Enter key automatically advances to next input)
    setupFastKeyboardNavigation();
}

function updateLiveCalculations() {
    if (!countingState.ward) return;
    const { ward, parts, partCount } = countingState;

    // 1. Read all part inputs and nota inputs from DOM
    let partTotals = new Array(partCount).fill(0);
    let partNotaTotals = new Array(partCount).fill(0);

    for (let p = 0; p < partCount; p++) {
        let pSum = 0;
        ward.candidates.forEach(c => {
            const inputEl = document.getElementById(`cand_p${p}_${c.id}`);
            const val = inputEl ? (parseInt(inputEl.value) || 0) : ((countingState.candVotes[c.id] || [])[p] || 0);
            if (!countingState.candVotes[c.id]) countingState.candVotes[c.id] = [];
            countingState.candVotes[c.id][p] = val;
            pSum += val;

            // Update candidate part cell in summary table
            const sumPartEl = document.getElementById(`sum_c${c.id}_p${p}`);
            if (sumPartEl) sumPartEl.innerText = val.toLocaleString('hi-IN');
        });

        const notaEl = document.getElementById(`nota_p${p}`);
        const nVal = notaEl ? (parseInt(notaEl.value) || 0) : (countingState.notaVotes[p] || 0);
        countingState.notaVotes[p] = nVal;
        partNotaTotals[p] = nVal;
        pSum += nVal;
        partTotals[p] = pSum;

        // Update Part subtotal & progress meter
        const targetPolled = parts[p]?.polled_votes || 0;
        const countedEl = document.getElementById(`part_${p}_counted_num`);
        if (countedEl) countedEl.innerText = pSum.toLocaleString('hi-IN');

        const fillEl = document.getElementById(`part_${p}_progress_fill`);
        const statusBadgeEl = document.getElementById(`part_${p}_status_badge`);

        const diff = pSum - targetPolled;
        const pct = targetPolled > 0 ? Math.min(100, (pSum / targetPolled) * 100) : 0;

        if (fillEl) {
            fillEl.style.width = pct + '%';
            if (targetPolled > 0 && diff === 0) {
                fillEl.style.background = '#10b981';
            } else if (pSum > targetPolled) {
                fillEl.style.background = '#ef4444';
            } else {
                fillEl.style.background = (p === 0 ? '#2563eb' : '#0d9488');
            }
        }

        if (statusBadgeEl) {
            if (targetPolled > 0 && diff === 0) {
                statusBadgeEl.innerHTML = `<span style="color:#16a34a;"><i class="fas fa-check-circle"></i> 100% सटीक मिलान</span>`;
            } else if (pSum > 0) {
                statusBadgeEl.innerHTML = `<span style="color:${diff > 0 ? '#dc2626' : '#d97706'};">(अंतर: ${diff > 0 ? '+' : ''}${diff})</span>`;
            } else {
                statusBadgeEl.innerHTML = `<span style="color:#94a3b8;">0% गिने गए</span>`;
            }
        }

        const sumFootPartEl = document.getElementById(`sum_foot_p${p}`);
        if (sumFootPartEl) sumFootPartEl.innerText = pSum.toLocaleString('hi-IN');
    }

    // 2. Read postal inputs
    let totalPostal = 0;
    ward.candidates.forEach(c => {
        const postalEl = document.getElementById(`postal_${c.id}`);
        const pVal = postalEl ? (parseInt(postalEl.value) || 0) : (countingState.postalVotes[c.id] || 0);
        countingState.postalVotes[c.id] = pVal;
        totalPostal += pVal;
    });
    const footPostalEl = document.getElementById('sum_foot_postal');
    if (footPostalEl) footPostalEl.innerText = totalPostal.toLocaleString('hi-IN');

    // 3. Compute grand candidate totals and percentages
    let candRankList = [];
    let grandCandTotal = 0;

    ward.candidates.forEach(c => {
        const rVotes = countingState.candVotes[c.id] || [];
        let cSum = 0;
        for (let p = 0; p < partCount; p++) {
            cSum += (rVotes[p] || 0);
        }
        const post = countingState.postalVotes[c.id] || 0;
        const total = cSum + post;
        grandCandTotal += total;

        candRankList.push({
            id: c.id,
            name: c.name,
            party: c.party,
            symbol: c.symbol,
            total: total
        });

        const sumTotEl = document.getElementById(`sum_c${c.id}_total`);
        if (sumTotEl) sumTotEl.innerText = total.toLocaleString('hi-IN');
    });

    const totalNota = countingState.notaVotes.reduce((a, b) => a + b, 0);
    const summaryNotaEl = document.getElementById('summaryTotalNotaText');
    if (summaryNotaEl) {
        const breakdownStr = partCount > 1 
            ? ` (${countingState.notaVotes.map((n, i) => `भाग ${i+1}: ${n}`).join(' + ')})` 
            : '';
        summaryNotaEl.innerText = `${totalNota.toLocaleString('hi-IN')} मत${breakdownStr}`;
    }

    const grandWardCounted = grandCandTotal + totalNota;
    const footGrandEl = document.getElementById('sum_foot_grand');
    if (footGrandEl) footGrandEl.innerText = grandWardCounted.toLocaleString('hi-IN');

    // Candidate Vote Share % & Progress Bars
    ward.candidates.forEach(c => {
        const total = candRankList.find(item => item.id === c.id)?.total || 0;
        const sharePctNum = grandWardCounted > 0 ? ((total / grandWardCounted) * 100).toFixed(1) : '0';
        const shareEl = document.getElementById(`sum_c${c.id}_share`);
        if (shareEl) shareEl.innerText = sharePctNum + '%';
        const barEl = document.getElementById(`sum_c${c.id}_bar`);
        if (barEl) barEl.style.width = sharePctNum + '%';
    });

    // 4. Update Winner / Leader Card & Table Row Highlights
    candRankList.sort((a, b) => b.total - a.total);

    // Highlight leading candidate row in summary table
    const isWardDeclared = (countingState.status === 'Declared' || ward.status === 'Declared');
    ward.candidates.forEach(c => {
        const rowEl = document.getElementById(`sum_row_${c.id}`);
        if (rowEl) rowEl.classList.remove('is-leader', 'is-winner');
    });
    if (candRankList.length > 0 && candRankList[0].total > 0) {
        const topCandId = candRankList[0].id;
        const topRowEl = document.getElementById(`sum_row_${topCandId}`);
        if (topRowEl) {
            topRowEl.classList.add(isWardDeclared ? 'is-winner' : 'is-leader');
        }
    }

    const leaderNameEl = document.getElementById("liveLeaderName");
    const leaderStatsEl = document.getElementById("liveLeaderStats");
    const recBadgeEl = document.getElementById("liveReconcileBadge");

    const targetPolled = ward.total_polled_votes || 0;
    const wardDiff = grandWardCounted - targetPolled;

    if (recBadgeEl) {
        recBadgeEl.className = "reconciliation-badge";
        if (targetPolled > 0 && wardDiff === 0) {
            recBadgeEl.classList.add("matched");
            recBadgeEl.innerHTML = `<i class="fas fa-check-circle"></i> कुल गिने: <b>${grandWardCounted.toLocaleString('hi-IN')}</b> / ${targetPolled} (100% सटीक मिलान)`;
        } else if (grandWardCounted > 0) {
            recBadgeEl.classList.add("mismatched");
            recBadgeEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> कुल गिने: <b>${grandWardCounted.toLocaleString('hi-IN')}</b> / ${targetPolled} (अंतर: ${wardDiff > 0 ? '+' : ''}${wardDiff})`;
        } else {
            recBadgeEl.classList.add("neutral");
            recBadgeEl.innerHTML = `<i class="fas fa-scale-balanced"></i> कुल गिने: 0 / ${targetPolled}`;
        }
    }

    if (leaderNameEl && leaderStatsEl) {
        if (grandCandTotal === 0) {
            leaderNameEl.innerHTML = `<span style="color: #64748b;">मत प्रविष्टि प्रारंभ करें...</span>`;
            leaderStatsEl.innerText = partCount > 1 
                ? `जैसे ही आप नीचे भाग 1 एवं भाग 2 में मत दर्ज करेंगे, विजेता व जीत का अंतर तुरंत स्वतः निकलेगा।`
                : `जैसे ही आप नीचे भाग 1 में मत दर्ज करेंगे, विजेता व जीत का अंतर तुरंत स्वतः निकलेगा।`;
        } else {
            const leader = candRankList[0];
            const runnerUp = candRankList[1] || null;
            const margin = runnerUp ? (leader.total - runnerUp.total) : leader.total;
            const leaderPct = grandWardCounted > 0 ? ((leader.total / grandWardCounted) * 100).toFixed(1) : '0';

            if (margin === 0 && runnerUp && leader.total > 0) {
                leaderNameEl.innerHTML = `<span style="color: #d97706;">बराबर मुकाबला (Tie): ${leader.name} एवं ${runnerUp.name}</span>`;
                leaderStatsEl.innerHTML = `दोनों प्रत्याशियों को समान <b>${leader.total.toLocaleString('hi-IN')}</b> मत प्राप्त हुए हैं।`;
            } else {
                leaderNameEl.innerHTML = `
                    <span>${leader.name}</span> 
                    <span class="party-badge-modern ${getPartyCssClass(leader.party)}" style="font-size: 13.5px;">${getPartyShortLabel(leader.party)}</span>
                    <span style="font-size: 16px; font-weight: 800; color: #15803d;">(${leader.total.toLocaleString('hi-IN')} मत &bull; ${leaderPct}%)</span>
                `;
                if (runnerUp && runnerUp.total > 0) {
                    leaderStatsEl.innerHTML = `
                        निकटतम प्रतिद्वंदी: <b>${runnerUp.name} (${getPartyShortLabel(runnerUp.party)} - ${runnerUp.total} मत)</b> &bull; 
                        जीत का अंतर (Margin): <b style="color: #15803d; font-size: 15px;">+${margin.toLocaleString('hi-IN')} मतों से आगे</b>
                    `;
                } else {
                    leaderStatsEl.innerHTML = `
                        अग्रणी बढ़त: <b style="color: #15803d; font-size: 15px;">+${margin.toLocaleString('hi-IN')} मत</b> (एकतरफा रुझान)
                    `;
                }
            }
        }
    }
}

function setupFastKeyboardNavigation() {
    const inputs = Array.from(document.querySelectorAll('.counting-vote-input-stepper, .counting-postal-input'));
    inputs.forEach((input, index) => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const next = inputs[index + 1];
                if (next) {
                    next.focus();
                    next.select();
                } else {
                    const saveBtn = document.getElementById('btnSaveProgressCounting') || document.getElementById('btnDeclareResultCounting');
                    if (saveBtn) saveBtn.focus();
                }
            }
        });
        input.addEventListener('focus', () => {
            input.select();
        });
    });
}


async function saveCountingData(statusOverride = null, isOnPage = true) {
    if (!resultsData || !resultsData.wards || !countingState.ward) return;
    const ward = countingState.ward;
    const { partCount } = countingState;

    updateLiveCalculations();

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

    // Calculate total votes entered across all candidates and NOTA
    let totalCandidateVotesEntered = 0;
    candidateVotes.forEach(c => {
        const rSum = (c.votes_rounds || []).reduce((a, b) => a + b, 0);
        totalCandidateVotesEntered += rSum + (c.votes_postal || 0);
    });
    const totalGrandCounted = totalCandidateVotesEntered + total_nota;

    // VALIDATION 1: Block empty data saving (0 votes)
    if (totalGrandCounted === 0 && ward.ward !== 26 && !ward.isNirvirodh) {
        alert(
            "⚠️ मत प्रविष्टि रिक्त है (No Data Entered)!\n\n" +
            "आपने किसी भी प्रत्याशी या NOTA के मत दर्ज नहीं किए हैं।\n" +
            "बिना डेटा दर्ज किए (शून्य मतों के साथ) प्रविष्टि सुरक्षित नहीं की जा सकती।\n\n" +
            "👉 कृपया पहले संबंधित भाग/बूथ में प्रत्याशियों के ईवीएम मत भरें।"
        );
        // Highlight first input
        const firstInput = document.querySelector('.counting-vote-input-stepper') || document.querySelector('.counting-vote-input');
        if (firstInput) {
            firstInput.focus();
            firstInput.style.borderColor = '#ef4444';
            setTimeout(() => { firstInput.style.borderColor = '#cbd5e1'; }, 3000);
        }
        return;
    }

    const tenderedEl = document.getElementById("countingTenderedVotes");
    const tendered_votes = tenderedEl ? (parseInt(tenderedEl.value) || 0) : (countingState.tendered_votes || 0);
    const rejectedEl = document.getElementById("countingRejectedVotes");
    const rejected_votes = rejectedEl ? (parseInt(rejectedEl.value) || 0) : (countingState.rejected_votes || 0);
    
    // Status resolution
    let status = statusOverride;
    if (!status) {
        const statusSelect = document.getElementById("countingStatusSelect");
        status = statusSelect ? statusSelect.value : (countingState.status || 'Counting');
    }
    
    const tableEl = isOnPage ? document.getElementById("onPageTableNo") : document.getElementById("countingTableNo");
    const counting_table_no = tableEl ? (parseInt(tableEl.value) || 1) : (countingState.table_no || 1);

    // VALIDATION 2: If declaring result, candidate votes must exist
    if (status === 'Declared') {
        if (totalCandidateVotesEntered === 0 && ward.ward !== 26 && !ward.isNirvirodh) {
            alert(
                "❌ परिणाम घोषित नहीं किया जा सकता!\n\n" +
                "अभी तक किसी भी प्रत्याशी को कोई मत प्राप्त नहीं हुआ है।\n" +
                "कृपया पहले प्रत्येक प्रत्याशी के मत दर्ज करें, उसके बाद ही आधिकारिक परिणाम घोषित करें।"
            );
            return;
        }

        // Check against polled target
        const targetPolled = ward.total_polled_votes || 0;
        const diff = totalGrandCounted - targetPolled;
        if (targetPolled > 0 && diff !== 0 && ward.ward !== 26 && !ward.isNirvirodh) {
            const pollWarningConfirm = confirm(
                `⚠️ मतों में अंतर चेतावनी (Reconciliation Discrepancy)!\n\n` +
                `• कुल गिने गए मत: ${totalGrandCounted}\n` +
                `• 11-09 पोलिंग लक्ष्य (Polled Target): ${targetPolled}\n` +
                `• अंतर: ${diff > 0 ? '+' : ''}${diff} मत\n\n` +
                `गिने गए कुल मत, मतदान दिवस के कुल पोल (${targetPolled}) से शत-प्रतिशत मेल नहीं खा रहे हैं।\n\n` +
                `क्या आप फिर भी इस अंतर के साथ परिणाम "आधिकारिक घोषित (Declared)" करना चाहते हैं?`
            );
            if (!pollWarningConfirm) return;
        }

        let leaderName = '';
        let leaderParty = '';
        let margin = 0;
        
        let cSums = ward.candidates.map(c => {
            const rVotes = countingState.candVotes[c.id] || [];
            let sum = rVotes.reduce((a, b) => a + b, 0) + (countingState.postalVotes[c.id] || 0);
            return { name: c.name, party: c.party, total: sum };
        });
        cSums.sort((a, b) => b.total - a.total);
        if (cSums.length > 0 && cSums[0].total > 0) {
            leaderName = cSums[0].name;
            leaderParty = cSums[0].party;
            margin = cSums.length > 1 ? (cSums[0].total - cSums[1].total) : cSums[0].total;
        }

        const isConfirm = confirm(
            `🏆 वार्ड संख्या ${ward.ward} — परिणाम आधिकारिक घोषित करें?\n\n` +
            `• विजयी प्रत्याशी: ${leaderName} (${getPartyShortLabel(leaderParty)})\n` +
            `• जीत का अंतर: ${margin} मत\n\n` +
            `क्या आप इस वार्ड का चुनाव परिणाम "आधिकारिक घोषित (Declared)" करना चाहते हैं?\n` +
            `(यह दलगत स्थिति/बोर्ड बहुमत में सीट जोड़ देगा एवं प्ररूप 21 निर्वाचन प्रमाण-पत्र जारी करेगा)`
        );
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
                operator_username: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.username : 'op_counting'
            })
        });

        const data = await res.json();
        if (data.success) {
            const modal = document.getElementById("countingEntryModal");
            if (modal && modal.style.display !== "none") {
                closeCountingEntryModal();
            }
            if (status === 'Declared') {
                showToast(`🏆 वार्ड ${ward.ward} का परिणाम घोषित व प्ररूप 21 जारी हुआ!`);
            } else {
                showToast(`✅ वार्ड ${ward.ward} का मतगणना डेटा सुरक्षित हुआ!`);
            }
            await fetchResultsData(false);
            if (typeof initOnPageCountingEntry === 'function') {
                initOnPageCountingEntry(ward.ward, true);
            }
            if (status === 'Declared') {
                setTimeout(() => {
                    openForm21Certificate(ward.ward);
                }, 400);
            }
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

// 10. Official Gazette Form 21 (अन्तिम परिणाम पत्र) Hub & Batch PDF Generator
function populateForm21Dropdowns() {
    const selects = [
        document.getElementById("reportsWardForm21Select"),
        document.getElementById("modalForm21WardSelect")
    ].filter(Boolean);

    selects.forEach(selectEl => {
        const curVal = selectEl.value || 'ALL';
        selectEl.innerHTML = `<option value="ALL">📋 समस्त 35 वार्ड (एक साथ संयुक्त PDF)</option>`;
        for (let w = 1; w <= 35; w++) {
            const opt = document.createElement("option");
            opt.value = w;
            opt.innerText = `वार्ड संख्या ${w}${w === 26 ? ' (निर्विरोध)' : ''}`;
            selectEl.appendChild(opt);
        }
        selectEl.value = curVal;
    });
}

function openSelectedWardForm21() {
    const sel = document.getElementById("reportsWardForm21Select");
    const val = sel ? sel.value : 'ALL';
    openForm21Certificate(val);
}

function onModalForm21WardChanged(val) {
    openForm21Certificate(val);
}

function generateSingleForm21SheetHtml(w) {
    const isNirvirodh = (w.ward === 26 || w.isNirvirodh);
    let candRows = '';
    let col4Total = 0;

    if (isNirvirodh) {
        candRows = `
            <tr>
                <td class="col-cno">1</td>
                <td class="col-cname">श्रीमती वीणा देवड़ा</td>
                <td class="col-party">भारतीय जनता पार्टी</td>
                <td class="col-votes">निर्विरोध निर्वाचित</td>
            </tr>
        `;
    } else if (w.candidates && w.candidates.length > 0) {
        w.candidates.forEach((c) => {
            const votes = c.total_votes || 0;
            col4Total += votes;
            candRows += `
                <tr>
                    <td class="col-cno">${c.candidate_no}</td>
                    <td class="col-cname">${c.name}</td>
                    <td class="col-party">${c.party || 'निर्दलीय'}</td>
                    <td class="col-votes">${votes.toLocaleString('hi-IN')}</td>
                </tr>
            `;
        });
    } else {
        candRows = `
            <tr>
                <td colspan="4" style="text-align:center; padding:15px;">मतगणना डेटा प्रतीक्षारत</td>
            </tr>
        `;
    }

    const validVotesPolled = isNirvirodh ? 'निर्विरोध निर्वाचित' : col4Total.toLocaleString('hi-IN');
    const col4Display = isNirvirodh ? '-' : col4Total.toLocaleString('hi-IN');
    const notaVotes = isNirvirodh ? '0' : (w.nota_votes || 0).toLocaleString('hi-IN');
    const rejectedVotes = (w.rejected_votes || 0).toLocaleString('hi-IN');
    const tenderedVotes = (w.tendered_votes || 0).toLocaleString('hi-IN');

    return `
        <div class="form21-sheet" id="sheet_ward_${w.ward}">
            <!-- Gazette Header -->
            <div class="form21-header">
                <div class="header-title-1">प्ररूप — 21</div>
                <div class="header-rule">(नियम — 66 देखिये)</div>
                <div class="header-title-2">अन्तिम परिणाम पत्र</div>
            </div>

            <!-- Meta Lines -->
            <div class="form21-meta">
                <div class="meta-row">
                    <span class="meta-label">नगरपालिका :</span>
                    <span class="meta-val">सुमेरपुर</span>
                </div>
                <div class="meta-row">
                    <span class="meta-label">वार्ड संख्या :</span>
                    <span class="meta-val">${w.ward}</span>
                </div>
            </div>

            <!-- Gazette Table -->
            <table class="form21-table">
                <thead>
                    <tr class="border-top-header">
                        <th class="col-cno">क्रम संख्या</th>
                        <th class="col-cname">अभ्यर्थी का नाम</th>
                        <th class="col-party">संबद्ध दल</th>
                        <th class="col-votes">डाले गये मतों की संख्या</th>
                    </tr>
                    <tr class="sub-numbers">
                        <th class="col-cno">1</th>
                        <th class="col-cname">2</th>
                        <th class="col-party">3</th>
                        <th class="col-votes">4</th>
                    </tr>
                </thead>
                <tbody>
                    ${candRows}
                </tbody>
            </table>

            <!-- Statistics Section -->
            <div class="form21-stats">
                <div class="stats-nota-title">नोटा (इनमें से कोई नहीं)</div>
                
                <div class="stats-line">
                    <span class="stats-lbl">डाले गये विधि मान्य मतों की कुल संख्या :</span>
                    <span class="stats-num">${validVotesPolled}</span>
                </div>
                <div class="stats-line">
                    <span class="stats-lbl">ऊपर अंकित सारणी के कालम 4 का भाग :</span>
                    <span class="stats-num">${col4Display}</span>
                </div>
                <div class="stats-line">
                    <span class="stats-lbl">नोटा को दिये गये कुल मतों की संख्या :</span>
                    <span class="stats-num">${notaVotes}</span>
                </div>
                <div class="stats-line">
                    <span class="stats-lbl">अस्वीकृत मतों की संख्या :</span>
                    <span class="stats-num">${rejectedVotes}</span>
                </div>
                <div class="stats-line">
                    <span class="stats-lbl">निविदत्त मतों की कुल संख्या :</span>
                    <span class="stats-num">${tenderedVotes}</span>
                </div>
            </div>

            <!-- Footer -->
            <div class="form21-footer">
                <div class="date-block">
                    <span class="date-lbl">तारीख :</span>
                    <span class="date-val">14-09-2026</span>
                </div>
                <div class="sign-block">
                    <div style="height: 32px;"></div>
                    <div class="sign-officer-name">कालुराम कुम्हार (आर.ए.एस.)</div>
                    <div class="sign-officer-title">रिटर्निंग अधिकारी (उपखण्ड मजिस्ट्रेट)</div>
                    <div class="sign-officer-sub">नगर पालिका सुमेरपुर (पाली)</div>
                </div>
            </div>
        </div>
    `;
}

async function openForm21Certificate(wardNo = 'ALL') {
    try {
        showToast("📄 प्ररूप — 21 तैयार हो रहा है...");
        if (!resultsData || !resultsData.wards) {
            const res = await fetch('/api/results/data');
            resultsData = await res.json();
        }

        populateForm21Dropdowns();

        const selectEl = document.getElementById("modalForm21WardSelect");
        if (selectEl) selectEl.value = wardNo;

        const extLink = document.getElementById("modalForm21ExternalLink");
        if (extLink) extLink.href = `/form21?ward=${wardNo}`;

        const printArea = document.getElementById("form21PrintArea");
        if (!printArea) return;

        let wardsToRender = [];
        if (wardNo === 'ALL') {
            wardsToRender = resultsData.wards;
        } else {
            const targetW = parseInt(wardNo);
            const found = resultsData.wards.find(w => w.ward === targetW);
            if (found) wardsToRender = [found];
        }

        if (wardsToRender.length === 0) {
            alert("चयनित वार्ड का डेटा नहीं मिला।");
            return;
        }

        let sheetsHtml = '<div class="form21-sheet-container">';
        wardsToRender.forEach(w => {
            sheetsHtml += generateSingleForm21SheetHtml(w);
        });
        sheetsHtml += '</div>';

        printArea.innerHTML = sheetsHtml;
        document.getElementById("form21Modal").style.display = "flex";
    } catch(err) {
        alert("प्ररूप 21 प्राप्त करने में त्रुटि: " + err.message);
    }
}

function printForm21Certificate() {
    const printArea = document.getElementById("form21PrintArea");
    if (!printArea) return;
    const selectEl = document.getElementById("modalForm21WardSelect");
    const isAll = selectEl ? (selectEl.value === 'ALL') : false;
    const title = isAll ? "प्ररूप 21 - समस्त 35 वार्ड अंतिम परिणाम पत्र" : `प्ररूप 21 - वार्ड ${selectEl?.value || 1} परिणाम पत्र`;

    const printWin = window.open('', '_blank', 'width=950,height=950');
    printWin.document.write(`
        <!DOCTYPE html>
        <html lang="hi">
        <head>
            <meta charset="UTF-8">
            <title>${title} | सुमेरपुर चुनाव 2026</title>
            <link rel="stylesheet" href="css/style.css">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Tiro+Devanagari+Hindi:ital@0;1&family=Yatra+One&display=swap" rel="stylesheet">
            <style>
                @page { size: A4 portrait; margin: 15mm 15mm 15mm 15mm; }
                body { background: white !important; margin: 0; padding: 0; font-family: 'Tiro Devanagari Hindi', 'Mangal', 'Segoe UI', Arial, sans-serif; color: black; }
                .form21-sheet-container { gap: 0 !important; }
                .form21-sheet { box-shadow: none !important; border: none !important; width: 100% !important; padding: 5mm 5mm !important; page-break-after: always !important; break-after: page !important; }
                .form21-sheet:last-child { page-break-after: avoid !important; break-after: avoid !important; }
            </style>
        </head>
        <body>
            ${printArea.innerHTML}
            <script>
                window.onload = function() {
                    window.print();
                };
            <\/script>
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
        const winner = w.winner_name || (isNirvirodh ? 'श्रीमती वीणा देवड़ा (निर्विरोध)' : '-');
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
                <h2 style="margin: 0 0 4px 0; font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: 0.5px;">कार्यालय रिटर्निंग अधिकारी (SDM), सुमेरपुर (पाली)</h2>
                <h3 style="margin: 4px 0; font-size: 15px; font-weight: 600; color: #334155;">नगर पालिका आम चुनाव 2026 — समस्त 35 वार्डों का संकलित परिणाम पत्रक (प्ररूप 20)</h3>
                <p style="font-size: 12px; color: #475569; margin: 3px 0 0 0;">मतगणना दिवस: 14 सितम्बर 2026 | बहुमत: 18 सीटें (कुल 35 सीटें)</p>
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

const getPartyClass = getPartyCssClass;

function getPartyShortLabel(partyName) {
    if (!partyName) return 'अन्य (OTH)';
    const p = String(partyName).toUpperCase();
    if (partyName.includes('भारतीय जनता') || p.includes('BJP')) return 'भाजपा (BJP)';
    if (partyName.includes('कांग्रेस') || p.includes('INC')) return 'कांग्रेस (INC)';
    if (partyName.includes('निर्दलीय') || p.includes('IND') || p.includes('INDEPENDENT')) return 'निर्दलीय (IND)';
    if (partyName.includes('आम आदमी') || p.includes('AAP')) return 'आप (AAP)';
    if (partyName.includes('माकपा') || partyName.includes('कम्युनिस्ट') || p.includes('CPM') || p.includes('CPI')) return 'माकपा (CPM)';
    if (partyName.includes('बसपा') || p.includes('BSP')) return 'बसपा (BSP)';
    if (partyName.includes('रालोद') || p.includes('RLD')) return 'रालोद (RLD)';
    return partyName.length > 16 ? partyName.substring(0, 14) + '..' : partyName;
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

// 12. Mock Rehearsal & Clean Reset Functions (35 वार्ड डमी टेस्ट एवं स्वच्छ रीसेट)
async function triggerMockTest() {
    if (!confirm("क्या आप समस्त 35 वार्डों का सम्पूर्ण डमी टेस्ट (Mock Test / Rehearsal) चलाना चाहते हैं?\n\nइससे सभी 35 वार्डों के परिणाम, EVM चक्र, प्रत्याशी मत, अंतर और प्ररूप 21 का लाइव परीक्षण हो जाएगा ताकि कल वास्तविक मतगणना में कोई समस्या न आए।")) {
        return;
    }
    try {
        showToast("⏳ समस्त 35 वार्डों का डमी टेस्ट डेटा लोड हो रहा है...");
        const res = await fetch('/api/results/mock-test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.success) {
            showToast("✅ समस्त 35 वार्ड डमी टेस्ट सफलतापूर्वक लोड हो गया!");
            await fetchResultsData(false);
            if (typeof renderResultsGrid === 'function') renderResultsGrid();
            if (typeof renderDashboardSummaryTable === 'function') renderDashboardSummaryTable();
            if (typeof renderHighlights === 'function') renderHighlights();
            if (typeof renderLiveDisplayData === 'function') renderLiveDisplayData();
            alert("✅ 35 वार्ड डमी टेस्ट सफल!\n\n• समस्त 35 वार्ड परिणाम घोषित स्थिति में लोड हो चुके हैं।\n• आप RO डैशबोर्ड, 35 वार्ड पत्रक, प्ररूप-21, लाइव LED स्क्रीन आदि का परीक्षण कर सकते हैं।\n• परीक्षण के बाद 'स्वच्छ रीसेट' बटन दबाकर डेटा कल के लिए 0 पर रीसेट कर सकते हैं।");
        } else {
            alert("त्रुटि: " + (data.message || "डमी टेस्ट लोड नहीं हो सका"));
        }
    } catch (e) {
        console.error("Mock test trigger error:", e);
        alert("सर्वर से संपर्क नहीं हो सका: " + e.message);
    }
}

async function triggerResetCountingTest() {
    const confirmInput = prompt("⚠️ सावधानी: क्या आप मतगणना डेटा को कल की वास्तविक मतगणना हेतु प्रारंभिक स्वच्छ स्थिति (0 वोट, केवल वार्ड 26 निर्विरोध) में रीसेट करना चाहते हैं?\n\nकृपया पुष्टि के लिए अंग्रेजी में 'RESET' लिखें:");
    if (!confirmInput || confirmInput.trim().toUpperCase() !== 'RESET') {
        if (confirmInput !== null) alert("रीसेट रद्द किया गया। (गलत पुष्टि कोड)");
        return;
    }
    try {
        showToast("⏳ मतगणना डेटा स्वच्छ स्थिति में रीसेट हो रहा है...");
        const res = await fetch('/api/results/reset-test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.success) {
            showToast("✅ डेटा सफलतापूर्वक 0 पर रीसेट हो गया!");
            await fetchResultsData(false);
            if (typeof renderResultsGrid === 'function') renderResultsGrid();
            if (typeof renderDashboardSummaryTable === 'function') renderDashboardSummaryTable();
            if (typeof renderHighlights === 'function') renderHighlights();
            if (typeof renderLiveDisplayData === 'function') renderLiveDisplayData();
            alert("✅ स्वच्छ रीसेट सफल!\n\nमतगणना डेटा कल की वास्तविक मतगणना के लिए पूरी तरह से तैयार है (0 वोट, केवल वार्ड 26 निर्विरोध घोषित)।");
        } else {
            alert("त्रुटि: " + (data.message || "रीसेट नहीं हो सका"));
        }
    } catch (e) {
        console.error("Reset trigger error:", e);
        alert("सर्वर से संपर्क नहीं हो सका: " + e.message);
    }
}
