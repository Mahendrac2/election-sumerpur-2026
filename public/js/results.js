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

// 1. Initialize on DOM Load
document.addEventListener("DOMContentLoaded", () => {
    checkSavedSession();
    initClock();
    fetchResultsData();
    initSSE();
    handleHashNavigation();
    window.addEventListener("hashchange", handleHashNavigation);

    // Auto-refresh results every 15 seconds as fallback
    setInterval(() => {
        fetchResultsData(true);
    }, 15000);
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
        initOnPageCountingEntry(currentCountingWard);
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

        sseConnection.addEventListener('winner_declared', (e) => {
            try {
                const d = JSON.parse(e.data);
                showToast(`🏆 वार्ड ${d.ward} परिणाम घोषित: ${d.winner_name || d.winner} (${d.winner_party || d.party}) विजयी!`);
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

            if (currentTab === 'entry') {
                initOnPageCountingEntry(currentCountingWard);
            } else if (currentTab === 'livedisplay') {
                renderLiveDisplay();
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
        statusMsg = leadParty ? `अग्रणी: ${leadParty} | बहुमत हेतु ${needed} सीटें शेष` : `बहुमत हेतु 18 सीटें आवश्यक (जादुई आंकड़ा)`;
    }

    const majTextEl = document.getElementById("majorityStatusText");
    if (majTextEl) majTextEl.innerText = statusMsg;

    const tvMajTextEl = document.getElementById("tvMajorityText");
    if (tvMajTextEl) tvMajTextEl.innerText = statusMsg;

    // TV Pills
    const tvPills = document.getElementById("tvPartyPillsContainer");
    if (tvPills) {
        tvPills.innerHTML = `
            <span class="badge" style="background:#f97316; color:white; font-size:13px; padding:6px 14px;">BJP: <b>${bjp.total || 0}</b> (जीते: ${bjp.won || 0}, बढ़त: ${bjp.leading || 0})</span>
            <span class="badge" style="background:#0ea5e9; color:white; font-size:13px; padding:6px 14px;">INC: <b>${inc.total || 0}</b> (जीते: ${inc.won || 0}, बढ़त: ${inc.leading || 0})</span>
            <span class="badge" style="background:#a855f7; color:white; font-size:13px; padding:6px 14px;">IND: <b>${ind.total || 0}</b> (जीते: ${ind.won || 0}, बढ़त: ${ind.leading || 0})</span>
            <span class="badge" style="background:#eab308; color:black; font-size:13px; padding:6px 14px;">AAP: <b>${aap.total || 0}</b> (जीते: ${aap.won || 0}, बढ़त: ${aap.leading || 0})</span>
        `;
    }
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
            statusBadge = `<span class="badge" style="background:#15803d; color:white;"><i class="fas fa-check-circle"></i> ${isNirvirodh ? 'निर्विरोध' : 'घोषित'}</span>`;
        } else if (isCounting) {
            statusBadge = `<span class="badge" style="background:#d97706; color:white; animation:pulse 1.5s infinite;"><i class="fas fa-bolt"></i> गणना जारी</span>`;
        } else {
            statusBadge = `<span class="badge" style="background:#64748b; color:white;"><i class="far fa-clock"></i> प्रतीक्षारत</span>`;
        }

        let leaderName = '-';
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
        } else if (isCounting && w.leader) {
            leaderName = `<span style="font-weight:700; color:#b45309;"><i class="fas fa-bolt"></i> ${w.leader.name}</span>`;
            const pClass = getPartyClass(w.leader.party || '');
            const pLabel = getPartyShortLabel(w.leader.party || '');
            partyTag = `<span class="party-tag ${pClass.replace('party-','')}">${pLabel}</span>`;
            votes = (w.leader.votes || 0).toLocaleString('hi-IN');
            marginStr = `+${(w.margin || 0).toLocaleString('hi-IN')}`;
        }

        const canEdit = currentUser && (currentUser.role === 'RO' || currentUser.role.startsWith('OP'));
        const actionButtons = `
            <div style="display:flex; gap:4px; justify-content:center;">
                ${isDeclared ? `
                    <button class="btn-primary" style="padding:3px 8px; font-size:11px; background:#0f172a; border-color:#0f172a;" onclick="openForm21Certificate(${w.ward})" title="प्ररूप 21 देखें">
                        <i class="fas fa-award"></i> प्ररूप 21
                    </button>
                ` : ''}
                ${canEdit ? `
                    <button class="btn-secondary" style="padding:3px 8px; font-size:11px; font-weight:600; background:#fff7ed; border-color:#fdba74; color:#c2410c;" onclick="openCountingEntryModal(${w.ward})" title="गणना प्रविष्टि">
                        <i class="fas fa-pen-to-square"></i> प्रविष्टि
                    </button>
                ` : ''}
            </div>
        `;

        html += `
            <tr class="${isNirvirodh ? 'nirvirodh-row' : ''}">
                <td><b>वार्ड ${w.ward}</b></td>
                <td>${(w.total_electors || 0).toLocaleString('hi-IN')}</td>
                <td>${(w.total_polled_votes || 0).toLocaleString('hi-IN')}</td>
                <td>
                    ${partsCount > 1 
                        ? `<span class="badge" style="background:#0284c7; color:white; font-size:10.5px;">${partsCount} भाग (EVM)</span>` 
                        : `<span style="color:#64748b; font-size:11.5px;">1 भाग</span>`}
                </td>
                <td style="text-align:left;">${leaderName}</td>
                <td>${partyTag}</td>
                <td><b>${votes}</b></td>
                <td><b style="color:#0284c7;">${marginStr}</b></td>
                <td>${statusBadge}</td>
                <td>${actionButtons}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// 10. Dedicated On-Page Counting Entry Initializer
function initOnPageCountingEntry(targetWard = 1) {
    if (!resultsData || !resultsData.wards) {
        fetchResultsData(false).then(() => initOnPageCountingEntry(targetWard));
        return;
    }

    const selectEl = document.getElementById("onPageWardSelect");
    if (selectEl) {
        selectEl.innerHTML = '';
        resultsData.wards.forEach(w => {
            const opt = document.createElement("option");
            opt.value = w.ward;
            const statusIcon = w.status === 'Declared' ? '🏆 ' : (w.status === 'Counting' ? '⚡ ' : '⏳ ');
            opt.innerText = `${statusIcon}वार्ड संख्या ${w.ward} (${w.status})`;
            selectEl.appendChild(opt);
        });
        selectEl.value = targetWard;
    }

    onCountingWardSelected(targetWard);
}

function onOnPageWardSelected(wardNo) {
    onCountingWardSelected(wardNo);
}

// 11. Big Screen TV / Control Room Display
function renderLiveDisplay() {
    if (!resultsData || !resultsData.summary) return;
    const summary = resultsData.summary;

    const tvDec = document.getElementById("tvDeclaredWards");
    const tvCount = document.getElementById("tvCountingWards");
    const tvVotes = document.getElementById("tvCountedVotes");
    const tvPct = document.getElementById("tvCountedPct");
    const tvLead = document.getElementById("tvLeadingParty");

    if (tvDec) tvDec.innerText = `${summary.declaredWards || 0} / 35`;
    if (tvCount) tvCount.innerText = summary.countingWards || 0;
    if (tvVotes) tvVotes.innerText = (summary.totalCountedVotes || 0).toLocaleString('hi-IN');
    if (tvPct) tvPct.innerText = `${summary.countedPercentage || 0}%`;

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

    const marqueeEl = document.getElementById("tvMarqueeText");
    if (marqueeEl && resultsData.wards) {
        const declared = resultsData.wards.filter(w => w.status === 'Declared');
        const counting = resultsData.wards.filter(w => w.status === 'Counting');

        let tickerItems = [];
        tickerItems.push(`⚡ कुल 35 वार्डों में से ${summary.declaredWards || 0} घोषित | गिने गए कुल मत: ${(summary.totalCountedVotes || 0).toLocaleString('hi-IN')}`);

        declared.forEach(w => {
            tickerItems.push(`🏆 वार्ड ${w.ward}: ${w.winner_name} (${w.winner_party}) विजयी ${w.ward === 26 ? '[निर्विरोध]' : `[अंतर: ${w.margin} मत]`}`);
        });

        counting.forEach(w => {
            if (w.leader) {
                tickerItems.push(`⚡ वार्ड ${w.ward}: ${w.leader.name} (${w.leader.party}) ${w.margin} मतों से आगे`);
            }
        });

        marqueeEl.innerText = tickerItems.join('   ✦✦✦   ');
    }
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

    const opElectors = document.getElementById("onPageElectors");
    const opPolled = document.getElementById("onPagePolled");
    const opStatus = document.getElementById("onPageStatus");
    if (opElectors) opElectors.innerText = (ward.total_electors || 0).toLocaleString('hi-IN');
    if (opPolled) opPolled.innerText = (ward.total_polled_votes || 0).toLocaleString('hi-IN');
    if (opStatus) opStatus.innerText = ward.status;

    const tableInput = document.getElementById("countingTableNo");
    if (tableInput) tableInput.value = ward.counting_table_no || 1;
    const opTableInput = document.getElementById("onPageTableNo");
    if (opTableInput) opTableInput.value = ward.counting_table_no || 1;

    const wardSelect = document.getElementById("countingWardSelect");
    if (wardSelect) wardSelect.value = currentCountingWard;
    const opWardSelect = document.getElementById("onPageWardSelect");
    if (opWardSelect) opWardSelect.value = currentCountingWard;

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
    const opSelect = document.getElementById("onPagePartSelect");
    if ((!selectEl && !opSelect) || !countingState.ward) return;

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

    if (selectEl) {
        selectEl.innerHTML = optionsHtml;
        selectEl.value = currentTab;
    }
    if (opSelect) {
        opSelect.innerHTML = optionsHtml;
        opSelect.value = currentTab;
    }
}

function switchCountingPart(tabIndex) {
    countingState.currentTab = parseInt(tabIndex);
    const selectEl = document.getElementById("countingPartSelect");
    if (selectEl) selectEl.value = countingState.currentTab;
    const opSelect = document.getElementById("onPagePartSelect");
    if (opSelect) opSelect.value = countingState.currentTab;

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

    if (isMatched) {
        return `
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 5px solid #16a34a; border-radius: var(--radius-sm); padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-check-circle" style="color: #16a34a; font-size: 20px;"></i>
                    <div>
                        <div style="font-weight: 700; color: #166534; font-size: 13px;">
                            100% सटीक मिलान पूर्ण — कुल दर्ज मत: ${totalCounted.toLocaleString('hi-IN')} मत
                        </div>
                        <div style="font-size: 11.5px; color: #475569; margin-top: 2px;">
                            11-09 पोल लक्ष्य: <b>${targetVotes.toLocaleString('hi-IN')} मत</b> | (अभ्यर्थी मत योग: <b>${cSum}</b> + NOTA: <b>${notaVal}</b>)
                        </div>
                    </div>
                </div>
                <span class="status-badge badge-active" style="padding: 5px 12px; font-size: 11.5px;">
                    <i class="fas fa-check"></i> 100% सटीक मिलान पूर्ण
                </span>
            </div>
        `;
    } else if (hasVotes) {
        return `
            <div style="background: #fef2f2; border: 1px solid #fca5a5; border-left: 5px solid #ef4444; border-radius: var(--radius-sm); padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-triangle-exclamation" style="color: #ef4444; font-size: 20px;"></i>
                    <div>
                        <div style="font-weight: 700; color: #991b1b; font-size: 13px;">
                            मत गणना में अंतर — पोल लक्ष्य: ${targetVotes.toLocaleString('hi-IN')} मत | कुल दर्ज मत: ${totalCounted.toLocaleString('hi-IN')} मत
                        </div>
                        <div style="font-size: 11.5px; color: #7f1d1d; margin-top: 2px;">
                            अंतर: <b>${diff > 0 ? '+' : ''}${diff} मत</b> (अभ्यर्थी मत: <b>${cSum}</b> + NOTA: <b>${notaVal}</b>) &bull; प्ररूप 17ग रिकॉर्ड से जांचें
                        </div>
                    </div>
                </div>
                <span class="status-badge badge-locked" style="padding: 5px 12px; font-size: 11.5px;">
                    <i class="fas fa-exclamation"></i> अंतर: ${diff > 0 ? '+' : ''}${diff} मत
                </span>
            </div>
        `;
    } else {
        return `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-left: 5px solid #64748b; border-radius: var(--radius-sm); padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="far fa-clock" style="color: #64748b; font-size: 20px;"></i>
                    <div>
                        <div style="font-weight: 700; color: #334155; font-size: 13px;">
                            भाग ${pt.part} (राउंड ${partIdx + 1}) की ईवीएम मतगणना प्रविष्टि करें
                        </div>
                        <div style="font-size: 11.5px; color: #64748b; margin-top: 2px;">
                            11-09 मतदान दिवस पोल लक्ष्य: <b>${targetVotes.toLocaleString('hi-IN')} मत</b>
                        </div>
                    </div>
                </div>
                <span class="status-badge badge-waiting" style="padding: 5px 12px; font-size: 11.5px;">
                    <i class="far fa-clock"></i> प्रविष्टि प्रतीक्षारत
                </span>
            </div>
        `;
    }
}

function renderSinglePartEntry(partIdx) {
    const containers = [
        document.getElementById("countingActiveTabContainer"),
        document.getElementById("onPageActiveContainer")
    ].filter(Boolean);
    if (containers.length === 0) return;

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
                <td style="font-weight: 700; color: #64748b; width: 45px;">${c.candidate_no}</td>
                <td style="text-align: left;">
                    <div style="font-weight: 700; font-size: 13.5px; color: var(--primary);">${c.name}</div>
                    <div style="font-size: 11px; color: var(--text-muted);">${c.address || `वार्ड ${ward.ward}, सुमेरपुर`}</div>
                </td>
                <td style="text-align: left; width: 140px;">
                    <span class="party-tag ${getPartyCssClass(c.party)}">${getPartyShortLabel(c.party)}</span>
                </td>
                <td style="width: 100px; font-weight: 600; color: #475569;">
                    ${c.symbol || '-'}
                </td>
                <td style="width: 160px;">
                    <input type="number" class="form-control cand-part-input" 
                           id="cand_vote_${c.id}_${partIdx}" 
                           value="${candPartVal}" min="0" 
                           placeholder="0"
                           tabindex="${idx + 1}"
                           style="text-align: center; font-size: 14px; font-weight: 700; max-width: 130px; margin: 0 auto; color: var(--primary);"
                           oninput="onPartVoteChanged(${c.id}, ${partIdx}, this.value)">
                </td>
            </tr>
        `;
    });

    const formHtml = `
        <div class="card" style="margin-bottom: 0; border: 1px solid var(--border); box-shadow: var(--shadow-sm);">
            
            <!-- Card Header matching Matdan Control -->
            <div class="card-header" style="background: #fafcff; padding: 12px 18px;">
                <h3>
                    <i class="fas fa-vote-yea" style="color: var(--accent);"></i>
                    <span>भाग ${pt.part} (राउंड ${partIdx + 1}) — ${pt.name || `मतदान केंद्र संख्या ${pt.booth_no}`}</span>
                </h3>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <span class="pct-pill" style="font-size: 11.5px; padding: 4px 10px;">
                        <i class="fas fa-bullseye"></i> लक्ष्य: ${targetVotes.toLocaleString('hi-IN')} मत
                    </span>
                    <span class="zone-pill" style="font-size: 11.5px; padding: 4px 10px;">
                        चरण ${partIdx + 1} / ${partCount}
                    </span>
                </div>
            </div>

            <!-- Table Responsive matching data-table -->
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 45px;">क्र.सं.</th>
                            <th style="text-align: left;">प्रत्याशी का नाम एवं विवरण</th>
                            <th style="text-align: left; width: 140px;">दल (Party)</th>
                            <th style="width: 100px;">चुनाव प्रतीक</th>
                            <th style="width: 160px;">ईवीएम मत संख्या (Votes)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${candRows}
                        <!-- Statutory NOTA Row -->
                        <tr style="background: #fffbeb;">
                            <td style="font-weight: 700; color: #92400e;">-</td>
                            <td style="text-align: left;">
                                <div style="font-weight: 700; font-size: 13px; color: #92400e;">
                                    <i class="fas fa-ban" style="margin-right: 5px;"></i> NOTA (उपरोक्त में से कोई नहीं)
                                </div>
                                <div style="font-size: 11px; color: #b45309;">None of the Above</div>
                            </td>
                            <td style="text-align: left; color: #92400e; font-weight: 600;">-</td>
                            <td style="font-weight: 700; color: #92400e;">NOTA</td>
                            <td>
                                <input type="number" class="form-control" id="partNotaInput"
                                       value="${notaVal}" min="0" placeholder="0"
                                       tabindex="${ward.candidates.length + 1}"
                                       style="text-align: center; font-size: 14px; font-weight: 700; max-width: 130px; margin: 0 auto; border-color: #f59e0b; background: white; color: #78350f;"
                                       oninput="onPartNotaChanged(${partIdx}, this.value)">
                            </td>
                        </tr>
                    </tbody>
                    <tfoot>
                        <tr style="background: #f8fafc; color: var(--primary);">
                            <td colspan="4" style="text-align: right; padding-right: 16px; font-size: 13px; font-weight: 700; border-top: 2px solid var(--border);">
                                <i class="fas fa-calculator" style="color: var(--accent); margin-right: 4px;"></i> 
                                भाग ${pt.part} कुल दर्ज मत (प्रत्याशी + NOTA):
                            </td>
                            <td class="part-grand-subtotal" id="partGrandSubtotal" style="text-align: center; font-size: 16px; font-weight: 900; color: var(--primary); background: #e2e8f0; border-top: 2px solid var(--border);">
                                ${grandTotalPart.toLocaleString('hi-IN')}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <!-- Live Match & Reconciliation Strip -->
            <div class="part-reconcile-box" id="partReconcileBox" style="padding: 12px 18px; border-top: 1px solid var(--border);">
                ${getPartMatchHtml(partIdx)}
            </div>

            <!-- Clean Navigation Bar Between Parts -->
            <div style="padding: 12px 18px; background: #f8fafc; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div>
                    ${partIdx > 0 ? `
                        <button type="button" class="btn-secondary" style="font-size: 12px;" onclick="switchCountingPart(${partIdx - 1})">
                            <i class="fas fa-arrow-left"></i> पिछला भाग (भाग ${parts[partIdx - 1].part})
                        </button>
                    ` : `
                        <span style="font-size: 11.5px; color: var(--text-muted);"><i class="fas fa-flag"></i> प्रथम भाग की प्रविष्टि</span>
                    `}
                </div>
                <div style="font-size: 12px; color: var(--text-muted); font-weight: 600;">
                    प्रविष्टि चरण ${partIdx + 1} / ${partCount} (भाग ${pt.part})
                </div>
                <div>
                    ${partIdx < partCount - 1 ? `
                        <button type="button" class="btn-primary" style="font-size: 12px; padding: 7px 14px;" onclick="switchCountingPart(${partIdx + 1})">
                            अगला भाग (भाग ${parts[partIdx + 1].part}) <i class="fas fa-arrow-right"></i>
                        </button>
                    ` : `
                        <button type="button" class="btn-primary" style="font-size: 12px; padding: 7px 14px; background: #7e22ce;" onclick="switchCountingPart(-1)">
                            समेकित परिणाम पत्रक देखें <i class="fas fa-chart-pie"></i>
                        </button>
                    `}
                </div>
            </div>

        </div>
    `;

    containers.forEach(c => c.innerHTML = formHtml);
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

    const subtotalEls = document.querySelectorAll(".part-grand-subtotal, #partGrandSubtotal");
    subtotalEls.forEach(el => el.innerText = totalCounted.toLocaleString('hi-IN'));

    const recBoxes = document.querySelectorAll(".part-reconcile-box, #partReconcileBox");
    const recHtml = getPartMatchHtml(partIdx);
    recBoxes.forEach(el => el.innerHTML = recHtml);

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

    const subtotalEls = document.querySelectorAll(".part-grand-subtotal, #partGrandSubtotal");
    subtotalEls.forEach(el => el.innerText = totalCounted.toLocaleString('hi-IN'));

    const recBoxes = document.querySelectorAll(".part-reconcile-box, #partReconcileBox");
    const recHtml = getPartMatchHtml(partIdx);
    recBoxes.forEach(el => el.innerHTML = recHtml);

    renderCountingPartDropdown();
    updateModalFooterSummary();
}

function renderConsolidatedResultView() {
    const containers = [
        document.getElementById("countingActiveTabContainer"),
        document.getElementById("onPageActiveContainer")
    ].filter(Boolean);
    if (containers.length === 0) return;

    const { ward, parts, partCount } = countingState;

    // Dynamic columns for parts in consolidated table
    let thParts = '';
    for (let i = 0; i < partCount; i++) {
        thParts += `
            <th style="width: 95px; text-align: center;">
                भाग ${parts[i].part}
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
                <td style="font-weight: 700; color: #1e40af; background: #f0f9ff;">
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
                <td style="font-weight: 700; color: #64748b;">${c.candidate_no}</td>
                <td style="text-align: left; font-weight: 700; color: var(--primary);">${c.name}</td>
                <td style="text-align: left;">
                    <span class="party-tag ${getPartyCssClass(c.party)}">${getPartyShortLabel(c.party)}</span>
                </td>
                <td style="font-weight: 600;">${c.symbol || '-'}</td>
                ${tdParts}
                <td style="background: #fffbeb;">
                    <input type="number" class="form-control cand-postal-input" 
                           value="${postal}" min="0" 
                           style="width: 75px; text-align: center; margin: 0 auto; font-weight: 700; border-color: #d97706; padding: 4px;" 
                           oninput="onPostalVoteChanged(${c.id}, this.value)">
                </td>
                <td id="cand_tot_${c.id}" class="cand-tot-${c.id}" style="font-size: 15px; font-weight: 900; background: #f1f5f9; color: var(--primary);">
                    ${tot.toLocaleString('hi-IN')}
                </td>
            </tr>
        `;
    });

    let footParts = '';
    for (let i = 0; i < partCount; i++) {
        footParts += `
            <td style="font-weight: 800; color: #0369a1; background: #e0f2fe;">
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

    const consolidatedHtml = `
        <div class="card" style="margin-bottom: 0; border: 1px solid var(--border); box-shadow: var(--shadow-sm);">
            <div class="card-header" style="background: #fafcff; padding: 12px 18px;">
                <h3>
                    <i class="fas fa-balance-scale" style="color: #7e22ce;"></i>
                    <span>वार्ड ${ward.ward} — समेकित परिणाम पत्रक (समस्त ${partCount} भाग + डाक मतपत्र)</span>
                </h3>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <span class="pct-pill" style="font-size: 11.5px; padding: 4px 10px;">
                        <i class="fas fa-bullseye"></i> 11-09 पोल: ${targetPolled.toLocaleString('hi-IN')} मत
                    </span>
                    <span class="zone-pill" style="font-size: 11.5px; padding: 4px 10px;">
                        कुल भाग: ${partCount}
                    </span>
                </div>
            </div>

            <!-- Consolidated Table -->
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 40px;">क्र.</th>
                            <th style="text-align: left;">अभ्यर्थी का नाम</th>
                            <th style="width: 120px; text-align: left;">दल</th>
                            <th style="width: 75px;">प्रतीक</th>
                            ${thParts}
                            <th style="width: 90px;">डाक मत</th>
                            <th style="width: 110px;">कुल मत</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                    <tfoot>
                        <tr style="background: #f8fafc; color: var(--primary);">
                            <td colspan="4" style="text-align: right; padding-right: 14px; font-size: 12.5px; font-weight: 700; border-top: 2px solid var(--border);">
                                <i class="fas fa-calculator" style="color: var(--accent);"></i> भागवार प्रत्याशी उप-योग:
                            </td>
                            ${footParts}
                            <td class="foot-postal-total" id="foot_postal_total" style="font-weight: 800; color: #92400e; background: #fef3c7; border-top: 2px solid var(--border);">
                                ${totalPostalSum.toLocaleString('hi-IN')}
                            </td>
                            <td class="foot-cand-grand-total" id="foot_cand_grand_total" style="font-size: 15px; font-weight: 900; background: #e2e8f0; color: var(--primary); border-top: 2px solid var(--border);">
                                ${grandCandidateTotal.toLocaleString('hi-IN')}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <!-- NOTA & Tendered / Rejected Strip -->
            <div style="padding: 12px 18px; background: #fffbeb; border-top: 1px solid #fde68a; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div>
                    <span style="font-weight: 700; color: #92400e;"><i class="fas fa-ban"></i> कुल NOTA मत:</span>
                    <b style="font-size: 15px; color: #78350f; margin-left: 6px;">${totalNota} मत</b>
                    <span style="font-size: 11.5px; color: #92400e; margin-left: 8px;">(${notaPartsBreakdown})</span>
                </div>
                <div style="display: flex; gap: 14px; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <label style="font-size: 12px; font-weight: 700; color: #78350f;">निविदत्त (Tendered):</label>
                        <input type="number" id="countingTenderedVotes" class="form-control" style="width: 70px; padding: 4px; text-align: center; font-weight: 700;" value="${countingState.tendered_votes}" min="0" onchange="countingState.tendered_votes = parseInt(this.value) || 0">
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <label style="font-size: 12px; font-weight: 700; color: #78350f;">अस्वीकृत (Rejected):</label>
                        <input type="number" id="countingRejectedVotes" class="form-control" style="width: 70px; padding: 4px; text-align: center; font-weight: 700;" value="${countingState.rejected_votes}" min="0" onchange="countingState.rejected_votes = parseInt(this.value) || 0">
                    </div>
                </div>
            </div>

            <!-- Grand Total & Reconciliation Status Box -->
            <div style="padding: 12px 18px; background: #f0fdf4; border-top: 1px solid #bbf7d0; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div>
                    <div style="font-size: 13.5px; color: #166534; font-weight: 800;">
                        सम्पूर्ण वार्ड कुल गिने गए मत: <span class="grand-counted-text" id="grand_counted_text" style="font-size: 16px; color: #15803d;">${grandCounted.toLocaleString('hi-IN')} मत</span>
                        <span class="grand-match-badge" id="grand_match_badge">
                            ${targetPolled > 0 ? (diff === 0 ? `<span style="font-size: 12px; color: #16a34a; margin-left: 8px;"><i class="fas fa-check-circle"></i> 100% सटीक पोल मिलान (${targetPolled} मत)</span>` : `<span style="font-size: 12px; color: #dc2626; margin-left: 8px;">(पोल: ${targetPolled} | अंतर: ${diff > 0 ? '+' : ''}${diff})</span>`) : ''}
                        </span>
                    </div>
                    <div class="grand-lead-text" id="grand_lead_text" style="font-size: 12.5px; margin-top: 4px; color: #15803d;">
                        ${leadText}
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <label style="font-size: 12px; font-weight: 700; color: #166534;">वार्ड परिणाम स्थिति:</label>
                    <select id="countingStatusSelect" class="form-control" style="width: auto; padding: 6px 12px; font-weight: 700;" onchange="countingState.status = this.value">
                        <option value="Counting" ${countingState.status === 'Counting' ? 'selected' : ''}>मतगणना जारी (Counting)</option>
                        <option value="Declared" ${countingState.status === 'Declared' ? 'selected' : ''}>आधिकारिक परिणाम घोषित (Declared)</option>
                    </select>
                </div>
            </div>

            <!-- Card Bottom Navigation to parts -->
            <div style="padding: 12px 18px; background: #f8fafc; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <button type="button" class="btn-secondary" style="font-size: 12px;" onclick="switchCountingPart(0)">
                    <i class="fas fa-arrow-left"></i> भाग 1 प्रविष्टि पर जाएँ
                </button>
                <div style="font-size: 11.5px; color: var(--text-muted); font-style: italic;">
                    * रिटर्निंग ऑफिसर (SDM) सुमेरपुर — समेकित परिणाम पत्रक
                </div>
            </div>

        </div>
    `;

    containers.forEach(c => c.innerHTML = consolidatedHtml);
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

        const candTotEls = document.querySelectorAll(`.cand-tot-${c.id}, #cand_tot_${c.id}`);
        candTotEls.forEach(el => el.innerText = tot.toLocaleString('hi-IN'));
    });

    const footPostalEls = document.querySelectorAll(".foot-postal-total, #foot_postal_total");
    footPostalEls.forEach(el => el.innerText = totalPostal.toLocaleString('hi-IN'));

    const footGrandEls = document.querySelectorAll(".foot-cand-grand-total, #foot_cand_grand_total");
    footGrandEls.forEach(el => el.innerText = grandCandTotal.toLocaleString('hi-IN'));

    const totalNota = countingState.notaVotes.reduce((a, b) => a + b, 0);
    const grandCounted = grandCandTotal + totalNota;
    const targetPolled = ward.total_polled_votes || 0;
    const diff = grandCounted - targetPolled;

    const grandCountedEls = document.querySelectorAll(".grand-counted-text, #grand_counted_text");
    grandCountedEls.forEach(el => el.innerText = `${grandCounted.toLocaleString('hi-IN')} मत`);

    const grandBadgeEls = document.querySelectorAll(".grand-match-badge, #grand_match_badge");
    const badgeContent = (targetPolled > 0)
        ? (diff === 0 
            ? `<span style="font-size: 12px; color: #16a34a; margin-left: 8px;"><i class="fas fa-check-circle"></i> 100% सटीक पोल मिलान (${targetPolled} मत)</span>` 
            : `<span style="font-size: 12px; color: #dc2626; margin-left: 8px;">(पोल: ${targetPolled} | अंतर: ${diff > 0 ? '+' : ''}${diff})</span>`)
        : '';
    grandBadgeEls.forEach(el => el.innerHTML = badgeContent);

    candSums.sort((a, b) => b.total - a.total);
    const leadEls = document.querySelectorAll(".grand-lead-text, #grand_lead_text");
    let leadHtml = '';
    if (candSums.length > 1 && candSums[0].total > 0) {
        const margin = candSums[0].total - candSums[1].total;
        leadHtml = `अग्रणी: <b style="color:#15803d;">${candSums[0].name} (${getPartyShortLabel(candSums[0].party)})</b> &mdash; <b>+${margin} मतों से आगे</b>`;
    } else if (candSums.length === 1) {
        leadHtml = `एकमात्र प्रत्याशी (निर्विरोध)`;
    }
    leadEls.forEach(el => el.innerHTML = leadHtml);

    updateModalFooterSummary();
}

function updateModalFooterSummary() {
    if (!countingState.ward) return;
    const ward = countingState.ward;
    const tabName = countingState.currentTab === -1 
        ? `📊 समेकित परिणाम पत्रक (Form 20)` 
        : `🗳️ भाग ${countingState.parts[countingState.currentTab]?.part || (countingState.currentTab + 1)} EVM प्रविष्टि (Form 17C-II)`;
    
    const summaryHtml = `
        <i class="fas fa-landmark" style="color: #0284c7;"></i> <b>वार्ड संख्या ${ward.ward}</b> (${countingState.partCount} भाग) &bull; 
        सक्रिय चरण: <b style="color: #0369a1;">${tabName}</b> &bull; 
        11-09 पोल: <b>${(ward.total_polled_votes || 0).toLocaleString('hi-IN')} मत</b>
    `;

    const badgeEls = [document.getElementById("modalFooterSummaryBadge"), document.getElementById("onPageSummaryBadge")].filter(Boolean);
    badgeEls.forEach(b => b.innerHTML = summaryHtml);

    let quickBadgeHtml = '';
    if (countingState.currentTab === -1) {
        quickBadgeHtml = `<span style="color: #7e22ce; background: #faf5ff; border: 1px solid #d8b4fe; padding: 2px 8px; border-radius: 4px;">📊 समेकित परिणाम पत्रक</span>`;
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
            quickBadgeHtml = `<span style="color: #166534; background: #dcfce7; border: 1px solid #86efac; padding: 2px 8px; border-radius: 4px;">✓ भाग ${pt?.part} 100% मिलान (${target} मत)</span>`;
        } else if (counted > 0) {
            const diff = counted - target;
            quickBadgeHtml = `<span style="color: #991b1b; background: #fee2e2; border: 1px solid #fca5a5; padding: 2px 8px; border-radius: 4px;">⚠️ भाग ${pt?.part} अंतर: ${diff > 0 ? '+' : ''}${diff} मत</span>`;
        } else {
            quickBadgeHtml = `<span style="color: #64748b; background: #f1f5f9; border: 1px solid #cbd5e1; padding: 2px 8px; border-radius: 4px;">⏳ भाग ${pt?.part} प्रविष्टि लंबित</span>`;
        }
    }

    const quickBadges = [document.getElementById("cModalQuickBadge"), document.getElementById("onPageQuickBadge")].filter(Boolean);
    quickBadges.forEach(qb => qb.innerHTML = quickBadgeHtml);
}

async function saveCountingData(isOnPage = false) {
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
    
    const tableEl = isOnPage ? document.getElementById("onPageTableNo") : document.getElementById("countingTableNo");
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
            const modal = document.getElementById("countingEntryModal");
            if (modal && modal.style.display !== "none") {
                closeCountingEntryModal();
            }
            showToast(`✅ वार्ड ${ward.ward} का भागवार मतगणना डेटा सुरक्षित व प्रसारित हुआ!`);
            await fetchResultsData(false);
            if (isOnPage) {
                initOnPageCountingEntry(ward.ward);
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
