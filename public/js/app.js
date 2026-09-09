// Global State
let portalData = null;
let currentUser = null;
let currentTab = 'dashboard';
let simulatedMinutes = null;
let turnoutChart = null;

// Time Windows Config (Minutes from Midnight)
const timeWindows = {
    mock:    { start: 390,  end: 435,  name: "Mock Poll (07:00 AM)", input: "inpMock",    badge: "badgeMock" },
    started: { start: 435,  end: 465,  name: "07:15 AM Start",       input: "inpStarted", badge: "badgeStarted" },
    v10:     { start: 600,  end: 630,  name: "10:00 AM Slot",        input: "inpV10",     badge: "badge10" },
    v13:     { start: 780,  end: 810,  name: "01:00 PM Slot",        input: "inpV13",     badge: "badge13" },
    v15:     { start: 900,  end: 930,  name: "03:00 PM Slot",        input: "inpV15",     badge: "badge15" },
    v18:     { start: 1080, end: 1110, name: "06:00 PM Slot",        input: "inpV18",     badge: "badge18" },
    vQueue:  { start: 1080, end: 1130, name: "6 PM Queue (Gate)",    input: "inpQueue",   badge: "badgeQueue" },
    vFinal:  { start: 1110, end: 1440, name: "Final Closing",        input: "inpVFinal",  badge: "badgeFinal" }
};

// Robust helper to parse SQLite UTC timestamps into accurate Indian Standard Time (IST) Date
function parseSqliteDate(rawTs) {
    if (!rawTs) return null;
    let s = String(rawTs).trim();
    if (!s) return null;
    // If SQLite raw UTC 'YYYY-MM-DD HH:MM:SS' without timezone indicator, convert to ISO UTC
    if (!s.endsWith('Z') && !s.includes('+')) {
        s = s.replace(' ', 'T') + 'Z';
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

// Formats timestamp specifically for Indian Standard Time (Asia/Kolkata, UTC+5:30)
function formatISTDateTime(rawTs, includeDate = true) {
    const d = parseSqliteDate(rawTs);
    if (!d) return null;
    
    const timeStr = d.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });

    const dateStr = d.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });

    return {
        time: timeStr,
        date: dateStr,
        full: `${dateStr}, ${timeStr}`,
        badgeHtml: `
            <div style="font-weight:700; font-size:12px; color:var(--text); white-space:nowrap;">
                <i class="far fa-clock" style="color:#0284c7; margin-right:4px;"></i>${timeStr}
            </div>
            <div style="font-size:10px; color:#64748b; white-space:nowrap; margin-top:2px;">
                ${dateStr}
            </div>
        `
    };
}

// Initialize Application on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
    checkSavedSession();
    initClock();
    initLiveStream();
    handleHashNavigation();
    window.addEventListener("hashchange", handleHashNavigation);
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

        if (currentUser && currentTab === 'entry') {
            applyStrictTimeLocks();
        }
    }, 1000);
}

// Check saved user session or public direct navigation
function checkSavedSession() {
    const saved = sessionStorage.getItem("sumerpur_user");
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            updateUserInterface();
            fetchData();
        } catch(e) {
            currentUser = null;
        }
    } else {
        const hash = window.location.hash.replace('#', '');
        // If user specifically navigated to livedisplay, auto-enter Public Guest Mode!
        if (hash === 'livedisplay') {
            enterPublicGuestMode();
            return;
        }
        document.getElementById("loginOverlay").style.display = "flex";
    }
}

// Switch between Auth tabs (Operator Login, Operator Register, RO Login, Forgot Password)
function switchAuthTab(tab) {
    const opLoginBtn = document.getElementById("authTabOpLoginBtn");
    const opRegBtn = document.getElementById("authTabOpRegBtn");
    const roLoginBtn = document.getElementById("authTabRoLoginBtn");

    const opLoginContainer = document.getElementById("opLoginFormContainer");
    const opRegContainer = document.getElementById("opRegisterFormContainer");
    const roLoginContainer = document.getElementById("roLoginFormContainer");
    const forgotContainer = document.getElementById("forgotPasswordFormContainer");

    // Reset buttons
    if (opLoginBtn) opLoginBtn.className = "btn-secondary";
    if (opRegBtn) opRegBtn.className = "btn-secondary";
    if (roLoginBtn) { roLoginBtn.className = "btn-secondary"; roLoginBtn.style.background = ""; roLoginBtn.style.borderColor = ""; }

    // Hide all containers
    if (opLoginContainer) opLoginContainer.style.display = "none";
    if (opRegContainer) opRegContainer.style.display = "none";
    if (roLoginContainer) roLoginContainer.style.display = "none";
    if (forgotContainer) forgotContainer.style.display = "none";

    if (tab === 'op_login') {
        if (opLoginBtn) opLoginBtn.className = "btn-primary";
        if (opLoginContainer) opLoginContainer.style.display = "block";
        const el = document.getElementById("opUsername");
        if (el) el.focus();
    } else if (tab === 'op_register') {
        if (opRegBtn) opRegBtn.className = "btn-success";
        if (opRegContainer) opRegContainer.style.display = "block";
        const el = document.getElementById("regName");
        if (el) el.focus();
    } else if (tab === 'ro_login') {
        if (roLoginBtn) { roLoginBtn.className = "btn-primary"; roLoginBtn.style.background = "#0f172a"; roLoginBtn.style.borderColor = "#0f172a"; }
        if (roLoginContainer) roLoginContainer.style.display = "block";
        const el = document.getElementById("roUsername");
        if (el) el.focus();
    } else if (tab === 'forgot_password') {
        if (forgotContainer) forgotContainer.style.display = "block";
        const el = document.getElementById("resetUsername");
        if (el) el.focus();
    }
}

// Self-Service Forgot / Reset Password Handler
async function attemptSelfResetPassword() {
    const username = document.getElementById("resetUsername").value.trim();
    const mobile = document.getElementById("resetMobile").value.trim();
    const newPassword = document.getElementById("resetNewPassword").value.trim();
    const confirmPassword = document.getElementById("resetConfirmPassword").value.trim();

    if (!username) {
        alert("कृपया यूज़रनेम दर्ज करें!");
        document.getElementById("resetUsername").focus();
        return;
    }
    if (!newPassword || newPassword.length < 4) {
        alert("कृपया कम से कम 4 अक्षरों का नया पासवर्ड दर्ज करें!");
        document.getElementById("resetNewPassword").focus();
        return;
    }
    if (newPassword !== confirmPassword) {
        alert("नया पासवर्ड और पुष्टि पासवर्ड मेल नहीं खाते हैं!");
        document.getElementById("resetConfirmPassword").focus();
        return;
    }

    try {
        const res = await fetch('/api/user/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, mobile, newPassword })
        });
        const result = await res.json();
        if (result.success) {
            alert(result.message);
            // Switch to login tab and prefill username
            switchAuthTab('op_login');
            const opUserEl = document.getElementById("opUsername");
            if (opUserEl) opUserEl.value = username;
            const opPassEl = document.getElementById("opPassword");
            if (opPassEl) {
                opPassEl.value = "";
                opPassEl.focus();
            }
        } else {
            alert(result.message || "पासवर्ड रीसेट विफल!");
        }
    } catch(err) {
        alert("सर्वर से कनेक्ट करने में त्रुटि!");
    }
}

// Operator Login Attempt
async function attemptOpLogin() {
    const username = document.getElementById("opUsername").value.trim();
    const password = document.getElementById("opPassword").value.trim();

    if (!username || !password) {
        alert("कृपया ऑपरेटर यूज़रनेम एवं पासवर्ड भरें!");
        return;
    }

    await executeLogin(username, password);
}

// RO (SDM) Login Attempt
async function attemptRoLogin() {
    const username = document.getElementById("roUsername").value.trim();
    const password = document.getElementById("roPassword").value.trim();

    if (!username || !password) {
        alert("कृपया RO यूज़रनेम एवं पासवर्ड भरें!");
        return;
    }

    await executeLogin(username, password);
}

// Common Authentication Executor
async function executeLogin(username, password) {
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const result = await res.json();

        if (result.success) {
            currentUser = result.user;
            sessionStorage.setItem("sumerpur_user", JSON.stringify(currentUser));
            document.getElementById("loginOverlay").style.display = "none";
            updateUserInterface();
            showToast(`नमस्ते ${currentUser.name}! लॉगिन सफल।`);
            await fetchData();
            if (currentUser.role.startsWith('OP')) {
                navigateTo('entry');
            } else {
                navigateTo('dashboard');
            }
        } else {
            alert(result.message || "गलत लॉगिन विवरण!");
        }
    } catch(err) {
        alert("सर्वर से कनेक्ट करने में त्रुटि! क्या बैकएंड सर्वर चल रहा है?");
    }
}

// Register New Operator Attempt (Zone 1 to 6)
async function attemptRegister() {
    const name = document.getElementById("regName").value.trim();
    const mobile = document.getElementById("regMobile").value.trim();
    const designation = document.getElementById("regDesignation").value.trim();
    const role = document.getElementById("regRole").value;
    const username = document.getElementById("regUsername").value.trim();
    const password = document.getElementById("regPassword").value.trim();

    if (!name) {
        alert("कृपया ऑपरेटर का पूरा नाम दर्ज करें!");
        document.getElementById("regName").focus();
        return;
    }
    if (!username) {
        alert("कृपया एक यूज़रनेम दर्ज करें!");
        document.getElementById("regUsername").focus();
        return;
    }
    if (!password || password.length < 4) {
        alert("कृपया कम से कम 4 अक्षरों का पासवर्ड दर्ज करें!");
        document.getElementById("regPassword").focus();
        return;
    }

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, mobile, designation, role, username, password })
        });
        const result = await res.json();

        if (result.success) {
            currentUser = result.user;
            sessionStorage.setItem("sumerpur_user", JSON.stringify(currentUser));
            document.getElementById("loginOverlay").style.display = "none";
            updateUserInterface();
            showToast(`🎉 बधाई हो! ऑपरेटर '${currentUser.name}' का पंजीयन सफल।`);
            await fetchData();
            if (currentUser.role.startsWith('OP')) {
                navigateTo('entry');
            } else {
                navigateTo('dashboard');
            }
        } else {
            alert(result.message || "पंजीयन विफल!");
        }
    } catch(err) {
        alert("सर्वर से कनेक्ट करने में त्रुटि! क्या बैकएंड सर्वर चल रहा है?");
    }
}

// Public / Citizen Guest Mode (Read-Only)
function enterPublicGuestMode() {
    currentUser = {
        role: 'GUEST',
        name: 'नागरिक दर्शक',
        username: 'guest',
        isGuest: true
    };
    sessionStorage.setItem("sumerpur_user", JSON.stringify(currentUser));
    document.getElementById("loginOverlay").style.display = "none";
    updateUserInterface();
    if (window.location.hash !== '#reports') {
        navigateTo('livedisplay');
    } else {
        renderCurrentView();
    }
    fetchData();
    showToast("🌐 नागरिक लाइव डिस्प्ले मोड सक्रिय। सुमेरपुर आम चुनाव 2026 में आपका स्वागत है!");
}

function handleHeaderAuthAction() {
    if (currentUser && currentUser.isGuest) {
        document.getElementById("loginOverlay").style.display = "flex";
        switchAuthTab('op_login');
    } else {
        logout();
    }
}

function logout() {
    sessionStorage.removeItem("sumerpur_user");
    currentUser = null;
    document.getElementById("loginOverlay").style.display = "flex";
    document.getElementById("currentUserName").innerText = "लॉगिन नहीं";
    const authBtn = document.getElementById("headerAuthBtn");
    if (authBtn) {
        authBtn.innerHTML = `<i class="fas fa-sign-out-alt"></i> बाहर निकलें`;
        authBtn.style.background = "";
        authBtn.style.borderColor = "";
    }
    switchAuthTab('op_login');
}

function updateUserInterface() {
    if (!currentUser) return;
    document.getElementById("loginOverlay").style.display = "none";
    
    const authBtn = document.getElementById("headerAuthBtn");
    const entryLink = document.getElementById("navEntryLink");
    const adminLink = document.getElementById("navAdminLink");

    if (currentUser.isGuest) {
        document.getElementById("currentUserName").innerHTML = `<span style="color:#10b981; font-weight:700;"><i class="fas fa-eye"></i> नागरिक / पब्लिक मोड</span>`;
        if (authBtn) {
            authBtn.innerHTML = `<i class="fas fa-right-to-bracket"></i> ऑपरेटर / RO लॉगिन`;
            authBtn.style.background = "#0284c7";
            authBtn.style.borderColor = "#0284c7";
            authBtn.title = "चुनाव ड्यूटी कार्मिक लॉगिन";
        }
        if (entryLink) entryLink.style.display = "none";
        if (adminLink) adminLink.style.display = "none";
    } else {
        const roleLabel = currentUser.role === 'RO' ? 'RO SDM' : `जोन ${currentUser.role.replace('OP','')}`;
        const desigLabel = currentUser.designation ? ` (${currentUser.designation})` : '';
        document.getElementById("currentUserName").innerText = `${currentUser.name}${desigLabel} [${roleLabel}]`;
        
        if (authBtn) {
            authBtn.innerHTML = `<i class="fas fa-sign-out-alt"></i> बाहर निकलें`;
            authBtn.style.background = "";
            authBtn.style.borderColor = "";
            authBtn.title = "लॉगआउट";
        }
        if (entryLink) entryLink.style.display = (currentUser.role.startsWith('OP') || currentUser.role === 'RO') ? "inline-flex" : "none";
        if (adminLink) adminLink.style.display = (currentUser.role === "RO") ? "inline-flex" : "none";
    }
}

// Server-Sent Events (SSE) Live Stream Listener
function initLiveStream() {
    const syncStatus = document.getElementById("syncStatusText");
    const es = new EventSource('/api/live-stream');

    es.addEventListener('connected', () => {
        if (syncStatus) syncStatus.innerText = "लाइव सिंक सक्रिय";
    });

    es.addEventListener('booth_updated', (e) => {
        const data = JSON.parse(e.data);
        if (data.zone) {
            showToast(`⚡ ज़ोन ${data.zone} के बूथों का डेटा अपडेट हुआ!`);
        } else {
            showToast(`⚡ बूथ संख्या ${data.boothId} का डेटा अपडेट हुआ!`);
        }
        fetchData(false); // background fetch without loader
    });

    es.addEventListener('config_updated', () => {
        showToast("⚙️ सिस्टम टाइम-लॉक सेटिंग्स अपडेट हुई!");
        fetchData(false);
    });

    es.addEventListener('data_reset', () => {
        showToast("⚠️ सभी बूथों का डेटा रिसेट हुआ!");
        fetchData(false);
    });

    es.onerror = () => {
        if (syncStatus) syncStatus.innerText = "पुनः कनेक्ट हो रहा है...";
    };
}

// Fetch Full Dataset from Server
async function fetchData(showStatus = true) {
    try {
        const res = await fetch('/api/data');
        const data = await res.json();
        if (data.success) {
            portalData = data;
            renderCurrentView();
            renderZonesDirectory();
        }
    } catch (err) {
        console.error("Fetch Data Error:", err);
    }
}

// Navigation & Tab Switching
function navigateTo(tabName) {
    window.location.hash = tabName;
}

function handleHashNavigation() {
    const hash = window.location.hash.replace('#', '') || 'dashboard';

    // Strict Route Protection for RO Admin Tool
    if (hash === 'admin') {
        if (!currentUser || currentUser.role !== 'RO') {
            showToast("⛔ अनधिकृत: केवल रिटर्निंग ऑफिसर (SDM) को इस नियंत्रण कक्ष की अनुमति है!");
            window.location.hash = (currentUser && currentUser.isGuest) ? 'livedisplay' : 'dashboard';
            return;
        }
    }

    // Strict Route Protection for Data Entry
    if (hash === 'entry') {
        if (!currentUser || currentUser.isGuest) {
            showToast("🔒 मतदान प्रविष्टि केवल अधिकृत चुनाव कार्मिकों हेतु है। कृपया ऑपरेटर लॉगिन करें।");
            document.getElementById("loginOverlay").style.display = "flex";
            switchAuthTab('op_login');
            window.location.hash = (currentUser && currentUser.isGuest) ? 'livedisplay' : 'dashboard';
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

    renderCurrentView();
}

function renderCurrentView() {
    if (!portalData) return;

    if (currentTab === 'dashboard') {
        renderDashboard();
    } else if (currentTab === 'booths') {
        renderBoothsTable();
    } else if (currentTab === 'entry') {
        initEntryForm();
    } else if (currentTab === 'zones') {
        renderZonesDirectory();
    } else if (currentTab === 'reports') {
        renderReportsStudio();
    } else if (currentTab === 'livedisplay') {
        renderLiveDisplay();
    } else if (currentTab === 'admin') {
        renderAdminPanel();
    }
}

// -------------------------------------------------------------
// VIEW 1: RO MASTER DASHBOARD
// -------------------------------------------------------------
function renderDashboard() {
    const kpi = portalData.kpi;
    if (!kpi) return;

    // Highlights
    if (kpi.highestBooth) {
        document.getElementById("hiVotingBooth").innerText = `बूथ ${kpi.highestBooth.booth} (वार्ड ${kpi.highestBooth.ward})`;
        document.getElementById("hiVotingPct").innerText = `${kpi.highestBooth.pct}% (${kpi.highestBooth.votes}/${kpi.highestBooth.electors} मत)`;
    }
    if (kpi.lowestBooth) {
        document.getElementById("loVotingBooth").innerText = `बूथ ${kpi.lowestBooth.booth} (वार्ड ${kpi.lowestBooth.ward})`;
        document.getElementById("loVotingPct").innerText = `${kpi.lowestBooth.pct}% (${kpi.lowestBooth.votes}/${kpi.lowestBooth.electors} मत)`;
    }

    // Top KPIs
    document.getElementById("kpiMock").innerText = `${kpi.mockDoneCount} / 35`;
    document.getElementById("kpiStarted").innerText = `${kpi.startedCount} / 35`;
    document.getElementById("kpiVotes").innerText = kpi.totalLatestVotes.toLocaleString('hi-IN');
    document.getElementById("kpiTurnout").innerText = `${kpi.overallPct}%`;

    // Slot Summaries
    document.getElementById("slotSum10").innerText = kpi.slotSums.s10.toLocaleString('hi-IN');
    document.getElementById("slotPct10").innerText = `${kpi.slotSums.s10Pct}% मतदान`;
    document.getElementById("slotSum13").innerText = kpi.slotSums.s13.toLocaleString('hi-IN');
    document.getElementById("slotPct13").innerText = `${kpi.slotSums.s13Pct}% मतदान`;
    document.getElementById("slotSum15").innerText = kpi.slotSums.s15.toLocaleString('hi-IN');
    document.getElementById("slotPct15").innerText = `${kpi.slotSums.s15Pct}% मतदान`;
    document.getElementById("slotSum18").innerText = kpi.slotSums.s18.toLocaleString('hi-IN');
    document.getElementById("slotPct18").innerText = `${kpi.slotSums.s18Pct}% मतदान`;
    document.getElementById("slotSumQueue").innerText = `${kpi.slotSums.sQueue.toLocaleString('hi-IN')} वोटर`;
    document.getElementById("slotSumFinal").innerText = kpi.slotSums.sFinal.toLocaleString('hi-IN');
    document.getElementById("slotPctFinal").innerText = `${kpi.slotSums.sFinalPct}% मतदान`;

    // Render Pending Booths Tracker
    renderPendingTracker();

    // Render Top High & Top Low Leaderboard Lists
    renderRankingMiniLists(kpi);

    // Render Turnout Chart
    renderTurnoutChart(kpi.slotSums, kpi.overallPct);

    // Render Quick Master Overview Table
    const tbody = document.getElementById("dashSummaryTbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    portalData.booths.forEach(r => {
        if (r.is_nirvirodh) {
            let tr = document.createElement("tr");
            tr.className = "nirvirodh-row";
            tr.innerHTML = `
                <td><b>${r.id}</b></td>
                <td><span class="zone-pill">जोन ${r.zone}</span></td>
                <td>वार्ड ${r.ward}</td>
                <td style="text-align:left;">${r.name}</td>
                <td><b>${r.electors}</b></td>
                <td colspan="7" style="font-weight:bold;color:#701a75;">
                    <i class="fas fa-trophy"></i> वार्ड 26 निर्विरोध निर्वाचित (No Election)
                </td>
                <td><span class="pct-pill">N/A</span></td>
                <td style="font-size:11px;text-align:left;">${r.praganak_name}</td>
            `;
            tbody.appendChild(tr);
            return;
        }

        let isHigh = kpi.highestBooth && r.id === kpi.highestBooth.booth && kpi.highestBooth.pct > 0;
        let isLow = kpi.lowestBooth && r.id === kpi.lowestBooth.booth && kpi.totalLatestVotes > 0;

        let tr = document.createElement("tr");
        if (isHigh) tr.className = "high-row";
        if (isLow) tr.className = "low-row";

        tr.innerHTML = `
            <td><b>${r.id}</b></td>
            <td><span class="zone-pill">जोन ${r.zone}</span></td>
            <td>वार्ड ${r.ward}</td>
            <td style="text-align:left;">${r.name}</td>
            <td><b>${r.electors}</b></td>
            <td><span class="status-badge ${r.mock_done==='Yes'?'badge-active':'badge-locked'}">${r.mock_done}</span></td>
            <td><span class="status-badge ${r.started==='Yes'?'badge-active':'badge-locked'}">${r.started}</span></td>
            <td>${r.v10 || '-'}</td>
            <td>${r.v13 || '-'}</td>
            <td>${r.v15 || '-'}</td>
            <td>${r.v18 || '-'}</td>
            <td><b>${r.v_queue || '0'}</b></td>
            <td><b>${r.v_final || '-'}</b></td>
            <td><span class="pct-pill">${r.turnoutPct}%</span></td>
            <td style="font-size:11px;text-align:left;">${r.praganak_name}<br><small style="color:#64748b;">${r.praganak_mob}</small></td>
        `;
        tbody.appendChild(tr);
    });
}

// Chart.js Turnout Growth Chart
function renderTurnoutChart(slotSums, finalPct) {
    const ctx = document.getElementById("turnoutChart");
    if (!ctx) return;

    const labels = ["10:00 AM", "01:00 PM", "03:00 PM", "06:00 PM", "अंतिम (Final)"];
    const percentages = [slotSums.s10Pct, slotSums.s13Pct, slotSums.s15Pct, slotSums.s18Pct, slotSums.sFinalPct || finalPct];

    if (turnoutChart) {
        turnoutChart.data.datasets[0].data = percentages;
        turnoutChart.update();
        return;
    }

    turnoutChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'मतदान प्रतिशत (% Turnout)',
                data: percentages,
                borderColor: '#ff6b35',
                backgroundColor: 'rgba(255, 107, 53, 0.12)',
                borderWidth: 3,
                pointBackgroundColor: '#0a2540',
                pointBorderColor: '#ff6b35',
                pointRadius: 6,
                tension: 0.35,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { callback: v => v + '%' }
                }
            }
        }
    });
}

// Render Top 5 High & Low Lists on Dashboard
function renderRankingMiniLists(kpi) {
    const highContainer = document.getElementById("topHighListContainer");
    const lowContainer = document.getElementById("topLowListContainer");

    if (highContainer && kpi.topHighBooths) {
        if (kpi.topHighBooths.length === 0 || kpi.totalLatestVotes === 0) {
            highContainer.innerHTML = `<div style="padding:15px; text-align:center; color:var(--text-muted); font-size:12px;">मतदान प्रारंभ होने पर रैंकिंग प्रदर्शित होगी।</div>`;
        } else {
            highContainer.innerHTML = kpi.topHighBooths.map(b => {
                const rankClass = b.rank === 1 ? 'gold' : b.rank === 2 ? 'silver' : b.rank === 3 ? 'bronze' : 'high-tag';
                return `
                    <div class="ranking-item">
                        <div class="r-left">
                            <span class="r-badge ${rankClass}">#${b.rank}</span>
                            <div class="r-info">
                                <div class="r-title">बूथ ${b.id} — वार्ड ${b.ward} [जोन ${b.zone}]</div>
                                <div class="r-sub">${b.name}</div>
                            </div>
                        </div>
                        <div class="r-right">
                            <div class="r-pct green">${b.turnoutPct}%</div>
                            <div class="r-votes">${b.votes} / ${b.electors} मत</div>
                            ${b.praganak_mob && b.praganak_mob !== '-' ? `<a href="tel:${b.praganak_mob}" class="r-contact-btn"><i class="fas fa-phone"></i> कॉल</a>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    if (lowContainer && kpi.topLowBooths) {
        if (kpi.topLowBooths.length === 0 || kpi.totalLatestVotes === 0) {
            lowContainer.innerHTML = `<div style="padding:15px; text-align:center; color:var(--text-muted); font-size:12px;">मतदान प्रारंभ होने पर धीमी गति वाले बूथ यहाँ दिखेंगे।</div>`;
        } else {
            lowContainer.innerHTML = kpi.topLowBooths.map(b => {
                return `
                    <div class="ranking-item">
                        <div class="r-left">
                            <span class="r-badge low-tag">#${b.rank}</span>
                            <div class="r-info">
                                <div class="r-title">बूथ ${b.id} — वार्ड ${b.ward} [जोन ${b.zone}]</div>
                                <div class="r-sub">${b.name}</div>
                            </div>
                        </div>
                        <div class="r-right">
                            <div class="r-pct red">${b.turnoutPct}%</div>
                            <div class="r-votes">${b.votes} / ${b.electors} मत</div>
                            ${b.praganak_mob && b.praganak_mob !== '-' ? `<a href="tel:${b.praganak_mob}" class="r-contact-btn" style="background:#fee2e2; color:#b91c1c;"><i class="fas fa-phone"></i> कॉल</a>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

// Rankings Modal Controller
let currentModalRankingType = 'high';

function openRankingsModal(type = 'high') {
    currentModalRankingType = type;
    const modal = document.getElementById("rankingModal");
    if (modal) {
        modal.classList.add("active");
        renderRankingsModalList(type);
    }
}

function closeRankingsModal() {
    const modal = document.getElementById("rankingModal");
    if (modal) modal.classList.remove("active");
}

function renderRankingsModalList(type = 'high') {
    currentModalRankingType = type;
    const btnHigh = document.getElementById("btnModalTabHigh");
    const btnLow = document.getElementById("btnModalTabLow");
    const title = document.getElementById("rankingModalTitle");
    const tbody = document.getElementById("rankingModalTbody");

    if (!tbody || !portalData) return;
    tbody.innerHTML = "";

    if (type === 'high') {
        if (btnHigh) { btnHigh.className = "btn-primary"; btnHigh.style.background = "var(--accent)"; }
        if (btnLow) { btnLow.className = "btn-secondary"; }
        if (title) title.innerHTML = `<i class="fas fa-arrow-trend-up" style="color:var(--success);"></i> सर्वाधिक मतदान केंद्र रैंकिंग (High Turnout)`;
    } else {
        if (btnHigh) { btnHigh.className = "btn-secondary"; }
        if (btnLow) { btnLow.className = "btn-primary"; btnLow.style.background = "#e11d48"; }
        if (title) title.innerHTML = `<i class="fas fa-triangle-exclamation" style="color:var(--danger);"></i> धीमी गति मतदान केंद्र रैंकिंग (Slow Turnout)`;
    }

    const activeBooths = portalData.booths.filter(b => !b.is_nirvirodh);
    const sorted = [...activeBooths].sort((a, b) => {
        return type === 'high' ? (b.turnoutPct - a.turnoutPct) : (a.turnoutPct - b.turnoutPct);
    });

    sorted.forEach((b, idx) => {
        let isTop3 = idx < 3;
        let badgeStyle = type === 'high' 
            ? (idx === 0 ? 'background:#fef08a; color:#854d0e;' : idx === 1 ? 'background:#e2e8f0; color:#475569;' : idx === 2 ? 'background:#fed7aa; color:#9a3412;' : 'background:#dcfce7; color:#15803d;')
            : (idx < 3 ? 'background:#fee2e2; color:#b91c1c; font-weight:bold;' : 'background:#f1f5f9; color:#475569;');

        let pctColor = type === 'high' ? 'color:#15803d;' : 'color:#b91c1c;';

        let tr = document.createElement("tr");
        tr.innerHTML = `
            <td><span style="display:inline-block; width:24px; height:24px; border-radius:50%; text-align:center; line-height:24px; font-size:11px; font-weight:bold; ${badgeStyle}">#${idx + 1}</span></td>
            <td><b>${b.id}</b></td>
            <td><span class="zone-pill">जोन ${b.zone}</span></td>
            <td>वार्ड ${b.ward}</td>
            <td style="text-align:left;">${b.name}</td>
            <td><b>${b.latestVotes || '0'}</b></td>
            <td>${b.electors}</td>
            <td><span class="pct-pill" style="${pctColor}">${b.turnoutPct}%</span></td>
            <td style="text-align:left; font-size:11.5px;">
                ${b.praganak_name}<br>
                ${b.praganak_mob && b.praganak_mob !== '-' ? `<a href="tel:${b.praganak_mob}" style="color:#0284c7; text-decoration:none; font-weight:bold;"><i class="fas fa-phone"></i> ${b.praganak_mob}</a>` : '-'}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// =============================================================
// PENDING BOOTHS TRACKER CONTROLLER (लंबित प्रविष्टि ट्रैकर)
// =============================================================
let currentPendingSlot = '10';

function setPendingTrackerSlot(slot) {
    currentPendingSlot = slot;
    document.querySelectorAll("#pendingSlotTabs .slot-tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.slot === slot);
    });
    renderPendingTracker();
}

function getSlotDisplayName(slot) {
    switch(slot) {
        case '10': return '10:00 AM';
        case '13': return '01:00 PM';
        case '15': return '03:00 PM';
        case '18': return '06:00 PM';
        case 'Final': return 'अंतिम क्लोजिंग';
        case 'mock': return 'मॉक पोल (Mock Poll)';
        case 'started': return '7:15 AM मतदान प्रारंभ';
        default: return slot;
    }
}

function isBoothSlotFilled(booth, slot) {
    if (!booth || booth.is_nirvirodh) return true; // excluded
    if (slot === 'mock') return booth.mock_done === 'Yes';
    if (slot === 'started') return booth.started === 'Yes';
    if (slot === '10') return Boolean(booth.v10 && String(booth.v10).trim() !== '');
    if (slot === '13') return Boolean(booth.v13 && String(booth.v13).trim() !== '');
    if (slot === '15') return Boolean(booth.v15 && String(booth.v15).trim() !== '');
    if (slot === '18') return Boolean(booth.v18 && String(booth.v18).trim() !== '');
    if (slot === 'Final') return Boolean(booth.v_final && String(booth.v_final).trim() !== '');
    return false;
}

function calculatePendingStats(slot, zoneFilter = 'ALL') {
    if (!portalData || !portalData.booths) return { total: 0, received: 0, missing: 0, pendingBooths: [] };

    let booths = portalData.booths.filter(b => !b.is_nirvirodh);
    if (zoneFilter !== 'ALL') {
        booths = booths.filter(b => b.zone === parseInt(zoneFilter));
    }

    const total = booths.length;
    let received = 0;
    const pendingBooths = [];

    booths.forEach(b => {
        if (isBoothSlotFilled(b, slot)) {
            received++;
        } else {
            pendingBooths.push(b);
        }
    });

    const missing = total - received;
    const receivedPct = total > 0 ? ((received / total) * 100).toFixed(1) : 0;
    const missingPct = total > 0 ? ((missing / total) * 100).toFixed(1) : 0;

    return { total, received, missing, receivedPct, missingPct, pendingBooths };
}

function renderPendingTracker() {
    if (!portalData || !portalData.booths) return;

    // Update all slot tab badges
    const slots = ['10', '13', '15', '18', 'Final', 'mock', 'started'];
    slots.forEach(s => {
        const stats = calculatePendingStats(s, 'ALL');
        const badge = document.getElementById(`slotBadge${s.charAt(0).toUpperCase() + s.slice(1)}`);
        if (badge) {
            badge.innerText = stats.missing;
            if (stats.missing === 0) {
                badge.classList.add("badge-all-clear");
            } else {
                badge.classList.remove("badge-all-clear");
            }
        }
    });

    // Get current selected slot & zone
    const zoneFilterEl = document.getElementById("pendingZoneFilter");
    const zoneFilter = zoneFilterEl ? zoneFilterEl.value : 'ALL';
    const currentStats = calculatePendingStats(currentPendingSlot, zoneFilter);

    // Update progress numbers
    const receivedEl = document.getElementById("pendingReceivedCount");
    const receivedPctEl = document.getElementById("pendingReceivedPct");
    const missingEl = document.getElementById("pendingMissingCount");
    const missingPctEl = document.getElementById("pendingMissingPct");
    const barReceived = document.getElementById("pendingBarReceived");
    const barMissing = document.getElementById("pendingBarMissing");

    if (receivedEl) receivedEl.innerText = currentStats.received;
    if (receivedPctEl) receivedPctEl.innerText = `${currentStats.receivedPct}%`;
    if (missingEl) missingEl.innerText = currentStats.missing;
    if (missingPctEl) missingPctEl.innerText = `${currentStats.missingPct}%`;
    if (barReceived) barReceived.style.width = `${currentStats.receivedPct}%`;
    if (barMissing) barMissing.style.width = `${currentStats.missingPct}%`;

    // Render Table
    const tbody = document.getElementById("pendingBoothsTbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (currentStats.missing === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="padding:28px; text-align:center; background:#f0fdf4; color:#15803d; font-size:14px; font-weight:700;">
                    <i class="fas fa-circle-check" style="font-size:24px; vertical-align:middle; margin-right:8px;"></i>
                    बहुत खूब! ${getSlotDisplayName(currentPendingSlot)} के लिए ${zoneFilter === 'ALL' ? 'सभी 35' : `जोन ${zoneFilter} के समस्त`} मतदान केंद्रों की प्रविष्टियां प्राप्त हो चुकी हैं।
                </td>
            </tr>
        `;
        return;
    }

    currentStats.pendingBooths.forEach(b => {
        const tr = document.createElement("tr");
        tr.style.background = "#fffdfb";
        tr.innerHTML = `
            <td><b style="color:var(--danger); font-size:13px;">${b.id}</b></td>
            <td><span class="zone-pill">जोन ${b.zone}</span></td>
            <td>वार्ड ${b.ward}</td>
            <td style="text-align:left; font-weight:600; color:var(--text-dark);">${b.name}</td>
            <td><b>${b.electors}</b></td>
            <td><span class="status-badge badge-waiting">${b.operator_role}</span></td>
            <td style="text-align:left; font-size:12px;">
                <b>${b.praganak_name || '-'}</b>
            </td>
            <td>
                ${b.praganak_mob && b.praganak_mob !== '-' ? `
                    <a href="tel:${b.praganak_mob}" class="call-btn" title="सीधे कॉल करें">
                        <i class="fas fa-phone-volume"></i> ${b.praganak_mob}
                    </a>
                ` : `<span style="color:#94a3b8;">-</span>`}
            </td>
            <td>
                <button class="quick-entry-btn" onclick="jumpToBoothEntry(${b.zone}, ${b.id})">
                    <i class="fas fa-pen-to-square"></i> एंट्री करें
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function jumpToBoothEntry(zone, boothId) {
    navigateTo('entry');
    setTimeout(() => {
        const zoneSelect = document.getElementById("entryZoneSelect");
        if (zoneSelect) {
            zoneSelect.value = zone;
            onZoneSelectChange(zone);
            setTimeout(() => {
                const row = document.getElementById(`entryRow_${boothId}`);
                if (row) {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    row.style.boxShadow = "0 0 15px rgba(234, 88, 12, 0.6)";
                    row.style.transition = "box-shadow 0.4s ease";
                    setTimeout(() => { row.style.boxShadow = "none"; }, 2500);
                }
            }, 200);
        }
    }, 100);
}

function copyPendingBoothsList() {
    const zoneFilterEl = document.getElementById("pendingZoneFilter");
    const zoneFilter = zoneFilterEl ? zoneFilterEl.value : 'ALL';
    const stats = calculatePendingStats(currentPendingSlot, zoneFilter);

    if (stats.missing === 0) {
        showToast(`🎉 ${getSlotDisplayName(currentPendingSlot)} के लिए कोई प्रविष्टि लंबित नहीं है!`);
        return;
    }

    let text = `🏛️ *सुमेरपुर नगर पालिका चुनाव 2026 — लंबित प्रविष्टि अलर्ट*\n`;
    text += `⏰ *समय स्लॉट:* ${getSlotDisplayName(currentPendingSlot)}\n`;
    text += `📍 *दायरा:* ${zoneFilter === 'ALL' ? 'समस्त 6 जोन' : `जोन ${zoneFilter}`}\n`;
    text += `🔴 *लंबित बूथ संख्या:* ${stats.missing} / ${stats.total} (${stats.missingPct}% लंबित)\n`;
    text += `------------------------------------\n`;
    text += `*लंबित मतदान केंद्र व प्रगणक संपर्क सूची:*\n\n`;

    stats.pendingBooths.forEach((b, idx) => {
        text += `${idx + 1}. *बूथ ${b.id}* (वार्ड ${b.ward}) [जोन ${b.zone}]\n`;
        text += `   🏫 ${b.name}\n`;
        text += `   👤 प्रभारी: ${b.praganak_name}\n`;
        text += `   📞 मोबाइल: ${b.praganak_mob}\n\n`;
    });

    text += `------------------------------------\n`;
    text += `_कृपया संबंधित प्रभारी से संपर्क कर तत्काल डेटा पोर्टल पर दर्ज कराएं।_`;

    navigator.clipboard.writeText(text).then(() => {
        showToast("📋 लंबित बूथों की सूची कॉपी हो गई! WhatsApp पर पेस्ट करें।");
    }).catch(err => {
        alert("कॉपी करने में त्रुटि: " + err);
    });
}

function exportPendingCsv() {
    const zoneFilterEl = document.getElementById("pendingZoneFilter");
    const zoneFilter = zoneFilterEl ? zoneFilterEl.value : 'ALL';
    const stats = calculatePendingStats(currentPendingSlot, zoneFilter);

    if (stats.missing === 0) {
        alert("इस स्लॉट के लिए कोई प्रविष्टि लंबित नहीं है!");
        return;
    }

    let csv = "\uFEFF"; // UTF-8 BOM for Hindi characters in Excel
    csv += "लंबित स्लॉट,बूथ संख्या,जोन,वार्ड,मतदान केंद्र,कुल मतदाता,ऑपरेटर,प्रगणक/प्रभारी,मोबाइल नंबर\n";

    stats.pendingBooths.forEach(b => {
        csv += `"${getSlotDisplayName(currentPendingSlot)}",${b.id},${b.zone},${b.ward},"${b.name.replace(/"/g, '""')}",${b.electors},"${b.operator_role}","${(b.praganak_name || '').replace(/"/g, '""')}","${b.praganak_mob || ''}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Sumerpur_Pending_Booths_Slot_${currentPendingSlot}.csv`;
    link.click();
}

// -------------------------------------------------------------
// VIEW 2: COMPREHENSIVE BOOTHS MONITORING
// -------------------------------------------------------------
function renderBoothsTable() {
    const tbody = document.getElementById("allBoothsTbody");
    if (!tbody || !portalData) return;
    tbody.innerHTML = "";

    const zoneFilter = document.getElementById("filterZoneSelect") ? document.getElementById("filterZoneSelect").value : "ALL";
    const pendingSlotFilter = document.getElementById("filterPendingSlotSelect") ? document.getElementById("filterPendingSlotSelect").value : "ALL";
    const searchVal = document.getElementById("searchBoothInput") ? document.getElementById("searchBoothInput").value.trim().toLowerCase() : "";

    portalData.booths.forEach(r => {
        if (zoneFilter !== "ALL" && String(r.zone) !== zoneFilter) return;
        if (searchVal && !r.name.toLowerCase().includes(searchVal) && !String(r.id).includes(searchVal) && !String(r.ward).includes(searchVal)) return;

        // Check pending filter
        if (pendingSlotFilter !== "ALL") {
            if (r.is_nirvirodh) return; // ignore uncontested in pending filter
            if (isBoothSlotFilled(r, pendingSlotFilter)) return; // skip already filled
        }

        let tr = document.createElement("tr");
        if (r.is_nirvirodh) tr.className = "nirvirodh-row";

        tr.innerHTML = `
            <td><b>${r.id}</b></td>
            <td><span class="zone-pill">जोन ${r.zone}</span></td>
            <td>वार्ड ${r.ward}</td>
            <td style="text-align:left;">${r.name}</td>
            <td><b>${r.electors}</b></td>
            <td>${r.is_nirvirodh ? 'N/A' : r.mock_done}</td>
            <td>${r.is_nirvirodh ? 'N/A' : r.started}</td>
            <td>${r.is_nirvirodh ? '-' : (r.v10 || '<span style="color:#dc2626; font-weight:bold;">लंबित</span>')}</td>
            <td>${r.is_nirvirodh ? '-' : (r.v13 || '<span style="color:#dc2626; font-weight:bold;">लंबित</span>')}</td>
            <td>${r.is_nirvirodh ? '-' : (r.v15 || '<span style="color:#dc2626; font-weight:bold;">लंबित</span>')}</td>
            <td>${r.is_nirvirodh ? '-' : (r.v18 || '<span style="color:#dc2626; font-weight:bold;">लंबित</span>')}</td>
            <td><b>${r.is_nirvirodh ? '-' : (r.v_queue || '0')}</b></td>
            <td><b>${r.is_nirvirodh ? '-' : (r.v_final || '<span style="color:#dc2626; font-weight:bold;">लंबित</span>')}</b></td>
            <td><span class="pct-pill">${r.is_nirvirodh ? 'N/A' : r.turnoutPct + '%'}</span></td>
            <td style="font-size:11px;text-align:left;">
                ${r.praganak_name}<br>
                ${r.praganak_mob && r.praganak_mob !== '-' ? `<a href="tel:${r.praganak_mob}" style="color:#0284c7; text-decoration:none; font-weight:bold;"><i class="fas fa-phone"></i> ${r.praganak_mob}</a>` : '-'}
            </td>
            <td style="font-size:11px;text-align:left;">${r.remark || ''}</td>
        `;
        tbody.appendChild(tr);
    });
}

// -------------------------------------------------------------
// VIEW 3: OPERATOR DATA ENTRY PORTAL (ZONE-WISE ALL BOOTHS)
// -------------------------------------------------------------
function initEntryForm() {
    if (!currentUser || !portalData) return;

    // Show time simulator bar only to RO SDM, hide for regular operators
    const simBar = document.getElementById("timeSimulatorBar");
    if (simBar) {
        simBar.style.display = (currentUser.role === 'RO') ? 'flex' : 'none';
    }

    const zoneSelect = document.getElementById("entryZoneSelect");
    if (!zoneSelect) return;

    // Operator to Zone mapping
    let defaultZone = "1";
    if (currentUser.role.startsWith("OP")) {
        const opNum = currentUser.role.replace("OP", "");
        defaultZone = opNum;
        zoneSelect.value = defaultZone;

        // Restrict operator to their assigned zone
        Array.from(zoneSelect.options).forEach(opt => {
            if (opt.value === defaultZone) {
                opt.disabled = false;
                opt.innerText = opt.innerText.replace(' [आपका आवंटित ज़ोन]', '') + ' [आपका आवंटित ज़ोन]';
            } else {
                opt.disabled = true;
            }
        });
    } else {
        // RO has access to all 6 zones
        Array.from(zoneSelect.options).forEach(opt => {
            opt.disabled = false;
            opt.innerText = opt.innerText.replace(' [आपका आवंटित ज़ोन]', '');
        });
    }

    onZoneSelectChange(zoneSelect.value || defaultZone);
}

function onZoneSelectChange(zoneVal) {
    if (!portalData || !portalData.zones) return;
    const zNum = parseInt(zoneVal);
    const zm = portalData.zones[zNum];

    const areaEl = document.getElementById("entryZoneAreaText");
    const zonalEl = document.getElementById("entryZoneZonalText");
    const hqEl = document.getElementById("entryZoneHqText");
    const electorsEl = document.getElementById("entryZoneElectorsText");
    const titleEl = document.getElementById("entryZoneTableTitle");

    const zoneBooths = portalData.booths.filter(b => b.zone === zNum);
    const totalZoneElectors = zoneBooths.reduce((sum, b) => sum + b.electors, 0);

    if (zm) {
        if (areaEl) areaEl.innerText = zm.area;
        if (zonalEl) zonalEl.innerText = zm.zonal;
        if (hqEl) hqEl.innerText = zm.hq;
        if (electorsEl) electorsEl.innerText = `${totalZoneElectors.toLocaleString('hi-IN')} वोटर (${zm.booths.length} बूथ)`;
        if (titleEl) titleEl.innerText = `${zm.name} — समस्त ${zm.booths.length} मतदान केंद्रों का लाइव मतदान प्रविष्टि पत्रक`;
    }

    renderZoneBulkTable(zNum);
    applyStrictTimeLocks();
}

function renderZoneBulkTable(zoneNum) {
    const tbody = document.getElementById("zoneBulkEntryTbody");
    if (!tbody || !portalData) return;
    tbody.innerHTML = "";

    const zoneBooths = portalData.booths.filter(b => b.zone === zoneNum);

    zoneBooths.forEach(b => {
        let tr = document.createElement("tr");
        tr.id = `zoneRow_${b.id}`;

        if (b.is_nirvirodh) {
            tr.className = "nirvirodh-row";
            tr.innerHTML = `
                <td><b>${b.id}</b></td>
                <td>वार्ड ${b.ward}</td>
                <td style="text-align:left;">${b.name}</td>
                <td><b>${b.electors}</b></td>
                <td colspan="9" style="font-weight:bold; color:#701a75; letter-spacing:0.5px;">
                    <i class="fas fa-award"></i> वार्ड 26 निर्विरोध निर्वाचित (No Election)
                </td>
                <td><span class="pct-pill">N/A</span></td>
            `;
            tbody.appendChild(tr);
            return;
        }

        tr.innerHTML = `
            <td><b>${b.id}</b></td>
            <td>वार्ड ${b.ward}</td>
            <td style="text-align:left;">
                <b>${b.name}</b><br>
                <small style="color:#64748b;">प्रभारी: ${b.praganak_name} (${b.praganak_mob})</small>
            </td>
            <td><b>${b.electors}</b></td>
            <td>
                <select id="mock_${b.id}" class="form-control" style="padding:4px; font-size:11.5px; font-weight:600; color:${b.mock_done==='Yes'?'#15803d':'#dc2626'};" onchange="this.style.color=this.value==='Yes'?'#15803d':'#dc2626'; updateBoothInputsLock(${b.id});">
                    <option value="No" ${b.mock_done !== 'Yes' ? 'selected' : ''}>No</option>
                    <option value="Yes" ${b.mock_done === 'Yes' ? 'selected' : ''}>Yes</option>
                </select>
            </td>
            <td>
                <select id="started_${b.id}" class="form-control" style="padding:4px; font-size:11.5px; font-weight:600; color:${b.started==='Yes'?'#15803d':'#dc2626'};" onchange="this.style.color=this.value==='Yes'?'#15803d':'#dc2626'; updateBoothInputsLock(${b.id});">
                    <option value="No" ${b.started !== 'Yes' ? 'selected' : ''}>No</option>
                    <option value="Yes" ${b.started === 'Yes' ? 'selected' : ''}>Yes</option>
                </select>
            </td>
            <td>
                <input type="number" id="v10_${b.id}" class="form-control slot-v10" value="${b.v10 || ''}" placeholder="0" min="0" max="${b.electors}" style="padding:5px; font-size:12px; text-align:center;" oninput="validateLiveBoothRow(${b.id}, 'v10')">
            </td>
            <td>
                <input type="number" id="v13_${b.id}" class="form-control slot-v13" value="${b.v13 || ''}" placeholder="0" min="0" max="${b.electors}" style="padding:5px; font-size:12px; text-align:center;" oninput="validateLiveBoothRow(${b.id}, 'v13')">
            </td>
            <td>
                <input type="number" id="v15_${b.id}" class="form-control slot-v15" value="${b.v15 || ''}" placeholder="0" min="0" max="${b.electors}" style="padding:5px; font-size:12px; text-align:center;" oninput="validateLiveBoothRow(${b.id}, 'v15')">
            </td>
            <td>
                <input type="number" id="v18_${b.id}" class="form-control slot-v18" value="${b.v18 || ''}" placeholder="0" min="0" max="${b.electors}" style="padding:5px; font-size:12px; text-align:center;" oninput="autoCalcFinalRow(${b.id}); validateLiveBoothRow(${b.id}, 'v18');">
            </td>
            <td>
                <input type="number" id="vQueue_${b.id}" class="form-control slot-vQueue" value="${b.v_queue !== undefined && b.v_queue !== '' ? b.v_queue : '0'}" placeholder="0" min="0" style="padding:5px; font-size:12px; text-align:center; background:#fffbeb;" oninput="autoCalcFinalRow(${b.id}); validateLiveBoothRow(${b.id}, 'vQueue');">
            </td>
            <td>
                <input type="number" id="vFinal_${b.id}" class="form-control slot-vFinal" value="${b.v_final || ''}" placeholder="0" min="0" max="${b.electors}" style="padding:5px; font-size:12px; text-align:center; font-weight:bold; color:var(--primary);" oninput="validateLiveBoothRow(${b.id}, 'vFinal')">
            </td>
            <td>
                <input type="text" id="remark_${b.id}" class="form-control" value="${b.remark || 'शांतिपूर्ण'}" placeholder="रिमार्क" style="padding:5px; font-size:11px;">
            </td>
            <td>
                <button class="btn-primary" style="padding:5px 8px; font-size:11px;" onclick="saveSingleBoothFromZone(${b.id})">
                    <i class="fas fa-save"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Apply initial lock state and live validation for all rendered booths
    zoneBooths.forEach(b => {
        updateBoothInputsLock(b.id);
        validateLiveBoothRow(b.id);
    });
}

// Dynamically lock/unlock slot inputs based on Mock Poll and 7:15 Start
function updateBoothInputsLock(boothId) {
    const mockEl = document.getElementById(`mock_${boothId}`);
    const startedEl = document.getElementById(`started_${boothId}`);
    if (!mockEl || !startedEl) return;

    // Mock Poll and 7:15 Start must ALWAYS remain enabled for operators to set/change
    mockEl.disabled = false;
    startedEl.disabled = false;

    const isPrereqMet = (mockEl.value === 'Yes' && startedEl.value === 'Yes');
    const slotKeys = ['v10', 'v13', 'v15', 'v18', 'vQueue', 'vFinal'];

    slotKeys.forEach(key => {
        const el = document.getElementById(`${key}_${boothId}`);
        if (!el) return;

        if (isPrereqMet) {
            el.classList.remove('input-locked-mock');
            el.placeholder = '0';
            el.title = '';
        } else {
            el.classList.add('input-locked-mock');
            el.disabled = true;
            el.placeholder = '🔒 7:15 Yes करें';
            el.title = "जब तक 'मॉक पोल' एवं '7:15 प्रारंभ' दोनों 'Yes' नहीं होते, तब तक यह स्लॉट लॉक रहेगा।";
        }
    });

    // Re-synchronize time window locks
    applyStrictTimeLocks();
}

function autoCalcFinalRow(boothId) {
    const v18El = document.getElementById(`v18_${boothId}`);
    const qEl = document.getElementById(`vQueue_${boothId}`);
    const finEl = document.getElementById(`vFinal_${boothId}`);
    if (v18El && qEl && finEl) {
        const v18 = parseInt(v18El.value) || 0;
        const q = parseInt(qEl.value) || 0;
        if (v18 > 0) {
            finEl.value = v18 + q;
        }
    }
}

// Real-Time Visual Validation on Typing
function validateLiveBoothRow(boothId, changedField) {
    const booth = portalData && portalData.booths ? portalData.booths.find(b => b.id === boothId) : null;
    if (!booth || booth.is_nirvirodh) return;
    const electors = booth.electors;

    const el10 = document.getElementById(`v10_${boothId}`);
    const el13 = document.getElementById(`v13_${boothId}`);
    const el15 = document.getElementById(`v15_${boothId}`);
    const el18 = document.getElementById(`v18_${boothId}`);
    const elQueue = document.getElementById(`vQueue_${boothId}`);
    const elFinal = document.getElementById(`vFinal_${boothId}`);

    const num10 = el10 && el10.value !== '' ? parseInt(el10.value) : null;
    const num13 = el13 && el13.value !== '' ? parseInt(el13.value) : null;
    const num15 = el15 && el15.value !== '' ? parseInt(el15.value) : null;
    const num18 = el18 && el18.value !== '' ? parseInt(el18.value) : null;
    const numQueue = elQueue && elQueue.value !== '' ? parseInt(elQueue.value) : 0;
    const numFinal = elFinal && elFinal.value !== '' ? parseInt(elFinal.value) : null;

    const slots = [
        { key: 'v10', name: '10:00 AM', el: el10, val: num10 },
        { key: 'v13', name: '01:00 PM', el: el13, val: num13 },
        { key: 'v15', name: '03:00 PM', el: el15, val: num15 },
        { key: 'v18', name: '06:00 PM', el: el18, val: num18 },
        { key: 'vFinal', name: 'अंतिम मत', el: elFinal, val: numFinal }
    ];

    // Reset visual error state
    slots.forEach(s => {
        if (s.el) {
            s.el.classList.remove('input-invalid');
            s.el.title = '';
        }
    });
    if (elQueue) {
        elQueue.classList.remove('input-invalid');
        elQueue.title = '';
    }

    // 1. Total electors ceiling check
    slots.forEach(s => {
        if (s.el && s.val !== null) {
            if (s.val > electors) {
                s.el.classList.add('input-invalid');
                s.el.title = `त्रुटि: मतों की संख्या (${s.val}) कुल मतदाताओं (${electors}) से अधिक है!`;
            }
        }
    });

    if (num18 !== null && (num18 + numQueue) > electors && elQueue) {
        elQueue.classList.add('input-invalid');
        elQueue.title = `त्रुटि: 06:00 PM मत + कतारबद्ध मत का योग (${num18 + numQueue}) कुल मतदाताओं (${electors}) से अधिक है!`;
    }

    // 2. Monotonic non-decreasing order check (हर स्लॉट पिछले स्लॉट से कम नहीं हो सकता)
    let prev = null;
    for (const s of slots) {
        if (s.val !== null) {
            if (prev !== null && s.val < prev.val) {
                if (s.el) {
                    s.el.classList.add('input-invalid');
                    s.el.title = `त्रुटि: ${s.name} के मत (${s.val}) पिछले स्लॉट ${prev.name} (${prev.val}) से कम नहीं हो सकते!`;
                }
            }
            prev = s;
        }
    }
}

// Comprehensive Booth Entry Validation Function
function validateSingleBoothEntry(boothId) {
    const booth = portalData.booths.find(b => b.id === boothId);
    if (!booth || booth.is_nirvirodh) return { valid: true };
    const elQueue = document.getElementById(`vQueue_${boothId}`);
    const elFinal = document.getElementById(`vFinal_${boothId}`);

    const mockVal = mockEl ? mockEl.value : 'No';
    const startedVal = startedEl ? startedEl.value : 'No';

    const num10 = el10 && el10.value !== '' ? parseInt(el10.value) : null;
    const num13 = el13 && el13.value !== '' ? parseInt(el13.value) : null;
    const num15 = el15 && el15.value !== '' ? parseInt(el15.value) : null;
    const num18 = el18 && el18.value !== '' ? parseInt(el18.value) : null;
    const numQueue = elQueue && elQueue.value !== '' ? parseInt(elQueue.value) : 0;
    let numFinal = elFinal && elFinal.value !== '' ? parseInt(elFinal.value) : null;

    if (numFinal === null && num18 !== null) {
        numFinal = num18 + numQueue;
        if (elFinal) elFinal.value = numFinal;
    }

    const hasVoteData = (num10 !== null || num13 !== null || num15 !== null || num18 !== null || numFinal !== null);

    // Rule 1: Mock Poll & 7:15 Start prerequisite
    if (hasVoteData) {
        if (mockVal !== 'Yes') {
            return {
                valid: false,
                message: `⛔ बूथ संख्या ${boothId} (${booth.name}):\n\nकृपया पहले 'मॉक पोल (07:00 AM)' को 'Yes' चुनें!\n\nजब तक मॉक पोल पूर्ण नहीं होता, तब तक मतदान के आंकड़े दर्ज नहीं किए जा सकते।`,
                focusEl: mockEl
            };
        }
        if (startedVal !== 'Yes') {
            return {
                valid: false,
                message: `⛔ बूथ संख्या ${boothId} (${booth.name}):\n\nकृपया '07:15 AM मतदान प्रारंभ' को 'Yes' चुनें!\n\nजब तक मतदान प्रारंभ नहीं होता, तब तक आगे के समय स्लॉट का डेटा दर्ज नहीं किया जा सकता।`,
                focusEl: startedEl
            };
        }
    }

    const slots = [
        { name: '10:00 AM', val: num10, el: el10 },
        { name: '01:00 PM', val: num13, el: el13 },
        { name: '03:00 PM', val: num15, el: el15 },
        { name: '06:00 PM', val: num18, el: el18 },
        { name: 'अंतिम मत', val: numFinal, el: elFinal }
    ];

    // Rule 2: Elector Ceiling (बूथ के कुल मतदाताओं से अधिक नहीं हो सकता)
    for (const slot of slots) {
        if (slot.val !== null) {
            if (isNaN(slot.val) || slot.val < 0) {
                return {
                    valid: false,
                    message: `⛔ बूथ संख्या ${boothId} (${booth.name}):\n\n${slot.name} में दर्ज मतों की संख्या अमान्य है!`,
                    focusEl: slot.el
                };
            }
            if (slot.val > electors) {
                return {
                    valid: false,
                    message: `⛔ बूथ संख्या ${boothId} (${booth.name}):\n\n${slot.name} के मत (${slot.val}) इस बूथ के कुल मतदाताओं (${electors}) से अधिक नहीं हो सकते!`,
                    focusEl: slot.el
                };
            }
        }
    }

    if (numQueue < 0) {
        return {
            valid: false,
            message: `⛔ बूथ संख्या ${boothId} (${booth.name}):\n\n06:00 PM कतारबद्ध मतदाताओं की संख्या ऋणात्मक नहीं हो सकती!`,
            focusEl: elQueue
        };
    }
    if (num18 !== null && (num18 + numQueue) > electors) {
        return {
            valid: false,
            message: `⛔ बूथ संख्या ${boothId} (${booth.name}):\n\n06:00 PM मत (${num18}) + कतारबद्ध मत (${numQueue}) का योग (${num18 + numQueue}) कुल मतदाताओं (${electors}) से अधिक नहीं हो सकता!`,
            focusEl: elQueue
        };
    }

    // Rule 3: Monotonic Sequence Check (आगे का स्लॉट पिछले स्लॉट से कम नहीं हो सकता)
    let lastFilled = null;
    for (const slot of slots) {
        if (slot.val !== null) {
            if (lastFilled !== null && slot.val < lastFilled.val) {
                return {
                    valid: false,
                    message: `⛔ बूथ संख्या ${boothId} (${booth.name}):\n\n${slot.name} के मत (${slot.val}) पिछले स्लॉट ${lastFilled.name} के मतों (${lastFilled.val}) से कम नहीं हो सकते!\n\n(मतदान के आंकड़े क्रमानुसार बराबर या बढ़ते क्रम में होने चाहिए)`,
                    focusEl: slot.el
                };
            }
            lastFilled = slot;
        }
    }

    return { valid: true };
}

function getEffectiveMinutes() {
    if (simulatedMinutes !== null) return simulatedMinutes;
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
}

function changeSimulatedTime(val) {
    if (val === "REAL") {
        simulatedMinutes = null;
        document.getElementById("slotModeText").innerText = "सिस्टम वास्तविक समय से सिंक है। केवल 30-मिनट विंडो वाला स्लॉट खुलेगा।";
    } else {
        const parts = val.split(":");
        simulatedMinutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        document.getElementById("slotModeText").innerText = `टेस्ट मोड सक्रिय: समय सेट किया गया ${val} बजे।`;
    }
    applyStrictTimeLocks();
}

function applyStrictTimeLocks() {
    const currentMins = getEffectiveMinutes();
    const isRO = (currentUser && currentUser.role === "RO");
    const globalOverride = portalData && portalData.config && portalData.config.global_override === "true";
    const statusBanner = document.getElementById("activeSlotStatusBanner");

    let activeSlotName = "कोई स्लॉट सक्रिय नहीं (Locked)";

    // Always ensure Mock Poll and 7:15 Poll Start dropdowns are enabled for operator selection
    document.querySelectorAll('[id^="mock_"], [id^="started_"]').forEach(el => {
        el.disabled = false;
        el.classList.remove('input-locked-mock');
    });

    // Identify current active slot for status banner
    for (const key in timeWindows) {
        const slot = timeWindows[key];
        const isCurrentlyOpen = (currentMins >= slot.start && currentMins <= slot.end);
        if (isRO || globalOverride) {
            activeSlotName = "RO मास्टर / रिहर्सल मोड (सभी स्लॉट अनलॉक)";
        } else if (isCurrentlyOpen) {
            const remaining = slot.end - currentMins;
            activeSlotName = `${slot.name} खुला (${remaining} मिनट शेष)`;
        }
    }

    // Only apply time-window and prerequisite locks to VOTING input slots
    const voteSlotKeys = ['v10', 'v13', 'v15', 'v18', 'vQueue', 'vFinal'];

    voteSlotKeys.forEach(key => {
        const slot = timeWindows[key];
        if (!slot) return;
        const isCurrentlyOpen = (currentMins >= slot.start && currentMins <= slot.end);

        const inputs = document.querySelectorAll(`.slot-${key}`);
        inputs.forEach(el => {
            const bIdMatch = el.id.match(/\d+$/);
            const bId = bIdMatch ? bIdMatch[0] : null;
            const mockEl = bId ? document.getElementById(`mock_${bId}`) : null;
            const startedEl = bId ? document.getElementById(`started_${bId}`) : null;
            const isMockLocked = mockEl && startedEl && (mockEl.value !== 'Yes' || startedEl.value !== 'Yes');

            // If Mock Poll or 7:15 is not Yes, vote inputs must stay locked!
            if (isMockLocked) {
                el.disabled = true;
                el.classList.add('input-locked-mock');
                el.placeholder = '🔒 7:15 Yes करें';
                el.title = "जब तक 'मॉक पोल' एवं '7:15 प्रारंभ' दोनों 'Yes' नहीं होते, तब तक यह स्लॉट लॉक रहेगा।";
                return;
            } else {
                el.classList.remove('input-locked-mock');
                el.placeholder = '0';
                el.title = '';
            }

            if (isRO || globalOverride) {
                el.disabled = false;
                el.classList.remove("active-field");
            } else if (isCurrentlyOpen) {
                el.disabled = false;
                el.classList.add("active-field");
            } else {
                el.disabled = true;
                el.classList.remove("active-field");
            }
        });
    });

    if (statusBanner) {
        statusBanner.className = isRO || globalOverride ? "status-badge badge-active" : "status-badge badge-ok";
        statusBanner.innerHTML = `<i class="fas fa-clock"></i> ${activeSlotName}`;
    }
}

// Save Single Booth from Zone Spreadsheet
async function saveSingleBoothFromZone(boothId) {
    const booth = portalData.booths.find(b => b.id === boothId);
    if (!booth || booth.is_nirvirodh) return;

    // Run client-side validation
    const validation = validateSingleBoothEntry(boothId);
    if (!validation.valid) {
        alert(validation.message);
        if (validation.focusEl) {
            validation.focusEl.focus();
            if (validation.focusEl.select) validation.focusEl.select();
        }
        return;
    }

    const payload = {
        username: currentUser ? currentUser.name : "Operator",
        userRole: currentUser ? currentUser.role : "OP1",
        mock_done: document.getElementById(`mock_${boothId}`).value,
        started: document.getElementById(`started_${boothId}`).value,
        v10: document.getElementById(`v10_${boothId}`).value,
        v13: document.getElementById(`v13_${boothId}`).value,
        v15: document.getElementById(`v15_${boothId}`).value,
        v18: document.getElementById(`v18_${boothId}`).value,
        v_queue: document.getElementById(`vQueue_${boothId}`).value,
        v_final: document.getElementById(`vFinal_${boothId}`).value,
        remark: document.getElementById(`remark_${boothId}`).value
    };

    try {
        const res = await fetch(`/api/booth/${boothId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
            showToast(result.message);
            await fetchData(false);
        } else {
            alert(result.message);
        }
    } catch(e) {
        alert("डेटा सुरक्षित करने में त्रुटि!");
    }
}

// Save All Booths in the Selected Zone at once (Bulk Batch Save)
async function saveAllZoneBooths() {
    const zoneVal = document.getElementById("entryZoneSelect").value;
    const zoneNum = parseInt(zoneVal);
    const zoneBooths = portalData.booths.filter(b => b.zone === zoneNum && !b.is_nirvirodh);

    // Pre-validate all booths in the zone
    for (const b of zoneBooths) {
        const validation = validateSingleBoothEntry(b.id);
        if (!validation.valid) {
            alert(validation.message);
            if (validation.focusEl) {
                validation.focusEl.focus();
                if (validation.focusEl.select) validation.focusEl.select();
            }
            return;
        }
    }

    const entries = zoneBooths.map(b => {
        const mockEl = document.getElementById(`mock_${b.id}`);
        const startedEl = document.getElementById(`started_${b.id}`);
        const v10El = document.getElementById(`v10_${b.id}`);
        const v13El = document.getElementById(`v13_${b.id}`);
        const v15El = document.getElementById(`v15_${b.id}`);
        const v18El = document.getElementById(`v18_${b.id}`);
        const qEl = document.getElementById(`vQueue_${b.id}`);
        const finEl = document.getElementById(`vFinal_${b.id}`);
        const remEl = document.getElementById(`remark_${b.id}`);

        return {
            boothId: b.id,
            mock_done: mockEl ? mockEl.value : b.mock_done,
            started: startedEl ? startedEl.value : b.started,
            v10: v10El ? v10El.value : b.v10,
            v13: v13El ? v13El.value : b.v13,
            v15: v15El ? v15El.value : b.v15,
            v18: v18El ? v18El.value : b.v18,
            v_queue: qEl ? qEl.value : b.v_queue,
            v_final: finEl ? finEl.value : b.v_final,
            remark: remEl ? remEl.value : b.remark
        };
    });

    try {
        const res = await fetch('/api/booths/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                zone: zoneNum,
                entries,
                username: currentUser ? currentUser.name : "Operator",
                userRole: currentUser ? currentUser.role : `OP${zoneNum}`
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast(`✅ ${result.message}`);
            await fetchData(false);
        } else {
            alert(result.message);
        }
    } catch(e) {
        alert("ज़ोन बल्क डेटा सुरक्षित करने में त्रुटि!");
    }
}

// -------------------------------------------------------------
// VIEW 4: ZONAL DIRECTORY
// -------------------------------------------------------------
function renderZonesDirectory() {
    const grid = document.getElementById("zonesCardGrid");
    if (!grid || !portalData || !portalData.zones) return;
    grid.innerHTML = "";

    for (let z = 1; z <= 6; z++) {
        const zm = portalData.zones[z];
        if (!zm) continue;

        const card = document.createElement("div");
        card.className = "zone-box";
        card.innerHTML = `
            <h4><span><i class="fas fa-map-marker-alt" style="color:var(--accent);"></i> ${zm.name}</span> <span class="zone-pill">${zm.booths.length} मतदान केंद्र</span></h4>
            <div class="meta-row"><b>एरिया मजिस्ट्रेट:</b> ${zm.area}</div>
            <div class="meta-row"><b>जोनल मजिस्ट्रेट:</b> ${zm.zonal}</div>
            <div class="meta-row"><b>जोनल मुख्यालय:</b> ${zm.hq}</div>
            <div class="meta-row" style="margin-top:8px; border-top:1px dashed #e2e8f0; padding-top:6px;">
                <b>शामिल बूथ:</b> ${zm.booths.map(b => b===27?'<b>27 (निर्विरोध)</b>':b).join(', ')}
            </div>
        `;
        grid.appendChild(card);
    }
}

// -------------------------------------------------------------
// VIEW 5: OFFICIAL REPORTS & PDF STUDIO
// -------------------------------------------------------------
function renderReportsStudio() {
    // studio preview
}

function openReportInNewTab(autoPrint = false) {
    const slot = document.getElementById("pdfSlotSelector") ? document.getElementById("pdfSlotSelector").value : "10";
    const url = `report.html?slot=${encodeURIComponent(slot)}${autoPrint ? '&print=1' : ''}`;
    window.open(url, '_blank');
}

function generateOfficialPDF() {
    openReportInNewTab(true);
}

// -------------------------------------------------------------
// VIEW 6: BIG-SCREEN LIVE TV DISPLAY
// -------------------------------------------------------------
function toggleTvFullscreen() {
    const tvEl = document.getElementById("liveTvContainer");
    if (!tvEl) return;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (tvEl.requestFullscreen) {
            tvEl.requestFullscreen();
        } else if (tvEl.webkitRequestFullscreen) {
            tvEl.webkitRequestFullscreen();
        } else if (tvEl.msRequestFullscreen) {
            tvEl.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    }
}

document.addEventListener("fullscreenchange", updateTvFullscreenBtn);
document.addEventListener("webkitfullscreenchange", updateTvFullscreenBtn);

function updateTvFullscreenBtn() {
    const btn = document.getElementById("btnTvFullscreen");
    const container = document.getElementById("liveTvContainer");
    if (!btn || !container) return;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
        btn.innerHTML = `<i class="fas fa-compress"></i> ✖ सामान्य स्क्रीन (Exit)`;
        container.classList.add("is-fullscreen");
    } else {
        btn.innerHTML = `<i class="fas fa-expand"></i> ⛶ फुल स्क्रीन (Full Screen)`;
        container.classList.remove("is-fullscreen");
    }
}

function renderLiveDisplay() {
    const kpi = portalData.kpi;
    if (!kpi) return;

    // 1. Primary Big KPIs
    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };

    setTxt("tvTurnout", `${kpi.overallPct}%`);
    setTxt("tvTotalVotes", kpi.totalLatestVotes.toLocaleString('hi-IN'));
    setTxt("tvElectors", kpi.votingElectors.toLocaleString('hi-IN'));
    setTxt("tvMockCount", `${kpi.mockDoneCount}/35`);
    setTxt("tvStartedCount", `${kpi.startedCount}/35`);

    const qVotes = (kpi.slotSums && kpi.slotSums.sQueue) ? kpi.slotSums.sQueue : 0;
    setTxt("tvQueueCount", qVotes.toLocaleString('hi-IN'));

    // 2. Hourly Turnout Trend Timeline
    const ss = kpi.slotSums || {};
    setTxt("tvSlotMock", `${kpi.mockDoneCount}/35`);
    setTxt("tvSlotStarted", `${kpi.startedCount}/35`);
    setTxt("tvSlot10", `${ss.s10Pct || 0}%`);
    setTxt("tvSlotVotes10", `${(ss.s10 || 0).toLocaleString('hi-IN')} मत`);
    setTxt("tvSlot13", `${ss.s13Pct || 0}%`);
    setTxt("tvSlotVotes13", `${(ss.s13 || 0).toLocaleString('hi-IN')} मत`);
    setTxt("tvSlot15", `${ss.s15Pct || 0}%`);
    setTxt("tvSlotVotes15", `${(ss.s15 || 0).toLocaleString('hi-IN')} मत`);
    setTxt("tvSlot18", `${ss.s18Pct || 0}%`);
    setTxt("tvSlotVotes18", `${(ss.s18 || 0).toLocaleString('hi-IN')} मत`);
    setTxt("tvSlotQueue", `${(ss.sQueue || 0).toLocaleString('hi-IN')}`);
    setTxt("tvSlotFinal", `${ss.sFinalPct || 0}%`);
    setTxt("tvSlotVotesFinal", `${(ss.sFinal || 0).toLocaleString('hi-IN')} मत`);

    // Highlight current active slot card in timeline
    const curMins = getEffectiveMinutes();
    document.querySelectorAll('.tv-slot-card').forEach(c => c.classList.remove('active-slot'));
    if (curMins >= 390 && curMins < 435) document.getElementById("slotCard_mock")?.classList.add('active-slot');
    else if (curMins >= 435 && curMins < 600) document.getElementById("slotCard_started")?.classList.add('active-slot');
    else if (curMins >= 600 && curMins < 780) document.getElementById("slotCard_10")?.classList.add('active-slot');
    else if (curMins >= 780 && curMins < 900) document.getElementById("slotCard_13")?.classList.add('active-slot');
    else if (curMins >= 900 && curMins < 1080) document.getElementById("slotCard_15")?.classList.add('active-slot');
    else if (curMins >= 1080 && curMins < 1110) document.getElementById("slotCard_18")?.classList.add('active-slot');
    else if (curMins >= 1110) document.getElementById("slotCard_final")?.classList.add('active-slot');

    // 3. Highest / Lowest Booths
    if (kpi.highestBooth && kpi.highestBooth.booth !== '-') {
        setTxt("tvHiBooth", `बूथ ${kpi.highestBooth.booth} (${kpi.highestBooth.pct}%)`);
    } else {
        setTxt("tvHiBooth", "-");
    }
    if (kpi.lowestBooth && kpi.lowestBooth.booth !== '-') {
        setTxt("tvLoBooth", `बूथ ${kpi.lowestBooth.booth} (${kpi.lowestBooth.pct}%)`);
    } else {
        setTxt("tvLoBooth", "-");
    }

    // 4. Pending Reporting Booths for the Current Time-Window
    const activeBooths = portalData.booths.filter(b => !b.is_nirvirodh);
    let targetSlotField = 'v10';
    let targetSlotLabel = '10:00 AM';

    if (curMins < 435) {
        targetSlotField = 'mock_done';
        targetSlotLabel = 'मॉक पोल (07:05 AM)';
    } else if (curMins < 600) {
        targetSlotField = 'started';
        targetSlotLabel = '07:15 AM प्रारंभ';
    } else if (curMins < 780) {
        targetSlotField = 'v10';
        targetSlotLabel = '10:00 AM';
    } else if (curMins < 900) {
        targetSlotField = 'v13';
        targetSlotLabel = '01:00 PM';
    } else if (curMins < 1080) {
        targetSlotField = 'v15';
        targetSlotLabel = '03:00 PM';
    } else if (curMins < 1110) {
        targetSlotField = 'v18';
        targetSlotLabel = '06:00 PM';
    } else {
        targetSlotField = 'v_final';
        targetSlotLabel = 'अंतिम क्लोजिंग';
    }

    let pendingBooths = [];
    if (targetSlotField === 'mock_done') {
        pendingBooths = activeBooths.filter(b => b.mock_done !== 'Yes');
    } else if (targetSlotField === 'started') {
        pendingBooths = activeBooths.filter(b => b.started !== 'Yes');
    } else {
        pendingBooths = activeBooths.filter(b => b[targetSlotField] === null || b[targetSlotField] === undefined || b[targetSlotField] === '');
    }

    const reportedCount = activeBooths.length - pendingBooths.length;
    const badgeEl = document.getElementById("tvReportingBadge");
    const pendingTextEl = document.getElementById("tvPendingText");

    if (pendingBooths.length === 0) {
        if (badgeEl) {
            badgeEl.style.background = "#10b981";
            badgeEl.style.color = "white";
            badgeEl.innerText = `35/35 पूर्ण (100%)`;
        }
        if (pendingTextEl) {
            pendingTextEl.style.color = "#4ade80";
            pendingTextEl.innerHTML = `<i class="fas fa-circle-check"></i> ${targetSlotLabel} स्लॉट: समस्त 35 मतदान केंद्रों का डेटा प्राप्त!`;
        }
    } else {
        if (badgeEl) {
            badgeEl.style.background = "#f59e0b";
            badgeEl.style.color = "black";
            badgeEl.innerText = `${reportedCount}/35 रिपोर्टेड (${pendingBooths.length} प्रतीक्षारत)`;
        }
        if (pendingTextEl) {
            const pendingIds = pendingBooths.map(b => b.id).slice(0, 10).join(", ");
            const extra = pendingBooths.length > 10 ? `...व अन्य ${pendingBooths.length - 10}` : "";
            pendingTextEl.style.color = "#facc15";
            pendingTextEl.innerHTML = `<i class="fas fa-clock"></i> ${targetSlotLabel} स्लॉट में लंबित बूथ: <b>${pendingIds}${extra}</b>`;
        }
    }

    // 5. Zone-wise turnout aggregations for TV
    const zGrid = document.getElementById("tvZoneBarsGrid");
    if (zGrid) {
        zGrid.innerHTML = "";
        for (let z = 1; z <= 6; z++) {
            const zoneBooths = portalData.booths.filter(b => b.zone === z && !b.is_nirvirodh);
            const zElectors = zoneBooths.reduce((acc, b) => acc + b.electors, 0);
            const zVotes = zoneBooths.reduce((acc, b) => acc + (b.latestVotes || 0), 0);
            const zPct = zElectors > 0 ? ((zVotes / zElectors) * 100).toFixed(1) : 0;

            const box = document.createElement("div");
            box.style.background = "#0e243f";
            box.style.padding = "14px";
            box.style.borderRadius = "8px";
            box.style.border = "1px solid #1e3a5f";
            box.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:13px; font-weight:bold;">
                    <span style="color:#38bdf8;">जोन ${z}</span>
                    <span style="color:#4ade80;">${zPct}%</span>
                </div>
                <div style="background:#1e293b; height:10px; border-radius:5px; overflow:hidden;">
                    <div style="background:#38bdf8; width:${zPct}%; height:100%; transition:width 0.5s;"></div>
                </div>
                <div style="font-size:11px; color:#94a3b8; margin-top:4px;">${zVotes.toLocaleString('hi-IN')} / ${zElectors.toLocaleString('hi-IN')} मत</div>
            `;
            zGrid.appendChild(box);
        }
    }

    // 6. All 35 Booths Live Heatmap Matrix
    const hmGrid = document.getElementById("tvBoothsHeatmapGrid");
    if (hmGrid) {
        hmGrid.innerHTML = "";
        portalData.booths.forEach(b => {
            const cell = document.createElement("div");
            cell.className = "tv-heat-cell";

            if (b.is_nirvirodh) {
                cell.classList.add("heat-nirv");
                cell.innerHTML = `
                    <div class="tv-heat-bnum">बूथ ${b.id}</div>
                    <div class="tv-heat-ward">वार्ड ${b.ward}</div>
                    <div class="tv-heat-pct">निर्विरोध</div>
                `;
            } else {
                const pct = b.turnoutPct || 0;
                if (pct >= 60) cell.classList.add("heat-high");
                else if (pct >= 40) cell.classList.add("heat-mid");
                else cell.classList.add("heat-low");

                cell.innerHTML = `
                    <div class="tv-heat-bnum">बूथ ${b.id}</div>
                    <div class="tv-heat-ward">वार्ड ${b.ward}</div>
                    <div class="tv-heat-pct">${pct}%</div>
                `;
                cell.title = `बूथ सं. ${b.id} (वार्ड ${b.ward}): ${b.latestVotes || 0}/${b.electors} मत (${pct}%)`;
            }
            hmGrid.appendChild(cell);
        });
    }

    // 7. TV Live Ticker Text Update
    const tickerEl = document.getElementById("tvLiveTickerText");
    if (tickerEl) {
        const pendingMsg = pendingBooths.length === 0
            ? 'समस्त 35 बूथों का डेटा समय पर प्राप्त'
            : `${targetSlotLabel} स्लॉट में ${pendingBooths.length} बूथ प्रतीक्षारत (${pendingBooths.map(b => b.id).slice(0, 5).join(', ')}${pendingBooths.length > 5 ? '...' : ''})`;

        tickerEl.innerHTML = `🏛️ सुमेरपुर नगर पालिका आम चुनाव 2026 लाइव कंट्रोल रूम &nbsp;&nbsp;|&nbsp;&nbsp; <b>कुल मतदान: ${kpi.overallPct}% (${kpi.totalLatestVotes.toLocaleString('hi-IN')} मत)</b> &nbsp;&nbsp;|&nbsp;&nbsp; कुल मतदाता: 29,696 &nbsp;&nbsp;|&nbsp;&nbsp; 35 मतदान केंद्र सक्रिय &nbsp;&nbsp;|&nbsp;&nbsp; मॉक पोल: ${kpi.mockDoneCount}/35 &nbsp;&nbsp;|&nbsp;&nbsp; 7:15 प्रारंभ: ${kpi.startedCount}/35 &nbsp;&nbsp;|&nbsp;&nbsp; स्थिति: ${pendingMsg} &nbsp;&nbsp;|&nbsp;&nbsp; शांतिपूर्ण एवं निष्पक्ष मतदान निरंतर जारी`;
    }
}

// -------------------------------------------------------------
// VIEW 7: RO ADMIN CONTROL PANEL
// -------------------------------------------------------------
async function renderAdminPanel() {
    if (!currentUser || currentUser.role !== "RO") return;

    loadAdminUsersList();

    // Render Reset Lock Status
    const isLocked = portalData && portalData.config && portalData.config.reset_locked === 'true';
    const lockBadge = document.getElementById("adminResetLockBadge");
    const resetBtn = document.getElementById("btnOpenResetModal");
    const lockNotice = document.getElementById("resetLockedNotice");

    if (lockBadge) {
        lockBadge.className = isLocked ? "status-badge badge-locked" : "status-badge badge-ok";
        lockBadge.style.background = isLocked ? "#15803d" : "#fef3c7";
        lockBadge.style.color = isLocked ? "#ffffff" : "#b45309";
        lockBadge.innerHTML = isLocked 
            ? `<i class="fas fa-shield-halved"></i> 🛡️ लाइव लॉक सक्रिय (डेटा रीसेट बंद)` 
            : `<i class="fas fa-lock-open"></i> 🔓 रिहर्सल मोड (अनलॉक)`;
    }

    if (resetBtn) {
        resetBtn.disabled = false;
        resetBtn.style.opacity = isLocked ? "0.6" : "1";
        resetBtn.style.cursor = "pointer";
    }

    if (lockNotice) {
        lockNotice.style.display = isLocked ? "block" : "none";
    }

    renderAdminLogs();
}

// Render System Audit Logs with accurate IST Timezone formatting
async function renderAdminLogs() {
    const tbody = document.getElementById("adminLogsTbody");
    if (!tbody) return;

    try {
        const res = await fetch('/api/logs');
        const data = await res.json();
        if (tbody && data.logs) {
            tbody.innerHTML = "";
            if (data.logs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:15px; color:#64748b;">कोई ऑडिट लॉग उपलब्ध नहीं है।</td></tr>`;
                return;
            }
            data.logs.forEach(l => {
                let tr = document.createElement("tr");
                const ist = formatISTDateTime(l.timestamp, true);
                const timeHtml = ist ? ist.badgeHtml : (l.timestamp || '-');
                tr.innerHTML = `
                    <td><b style="color:#64748b;">#${l.id}</b></td>
                    <td>${timeHtml}</td>
                    <td><b>${l.username || '-'}</b></td>
                    <td><span class="pct-pill" style="font-size:10px; padding:2px 8px;">${l.action || '-'}</span></td>
                    <td>${l.booth_id ? `<span class="zone-pill">बूथ ${l.booth_id}</span>` : '-'}</td>
                    <td style="text-align:left; font-size:11px; word-break:break-word;">${l.details || ''}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch(e) {
        console.error("Error loading admin logs:", e);
    }
}

async function loadAdminUsersList() {
    try {
        const res = await fetch('/api/admin/users');
        const data = await res.json();
        const tbody = document.getElementById("adminUsersTbody");
        if (tbody && data.users) {
            tbody.innerHTML = "";
            data.users.forEach(u => {
                let tr = document.createElement("tr");
                const lastLoginObj = u.last_login ? formatISTDateTime(u.last_login, true) : null;
                const lastLoginText = lastLoginObj ? `${lastLoginObj.date}, ${lastLoginObj.time}` : 'कभी नहीं';
                const createdObj = u.created_at ? formatISTDateTime(u.created_at, true) : null;
                const createdText = createdObj ? createdObj.date : '-';
                const roleBadge = u.role === 'RO' ? '<span class="status-badge badge-locked">RO SDM</span>' : `<span class="zone-pill">जोन ${u.role.replace('OP','')}</span>`;
                const safeName = (u.name || '').replace(/'/g, "\\'");

                const actionBtns = `
                    <div style="display:flex; gap:6px; justify-content:center; align-items:center;">
                        <button class="btn-primary" style="padding:4px 8px; font-size:11px; background:#d97706; border-color:#d97706;" title="नया पासवर्ड सेट करें" onclick="adminPromptResetPassword('${u.username}', '${safeName}')">
                            <i class="fas fa-key"></i> पासवर्ड बदलें
                        </button>
                        ${u.username !== 'ro_sumerpur' ? `
                        <button class="btn-danger" style="padding:4px 8px; font-size:11px;" title="यूज़र हटाएं" onclick="adminDeleteUser('${u.username}', '${safeName}')">
                            <i class="fas fa-trash-can"></i> हटाएं
                        </button>` : ''}
                    </div>
                `;

                tr.innerHTML = `
                    <td><b>${u.username}</b></td>
                    <td style="text-align:left; font-weight:600;">${u.name}</td>
                    <td>${u.designation || '-'}</td>
                    <td>${u.mobile ? `<a href="tel:${u.mobile}" style="color:#0284c7; font-weight:bold; text-decoration:none;"><i class="fas fa-phone"></i> ${u.mobile}</a>` : '-'}</td>
                    <td>${roleBadge}</td>
                    <td><small style="color:#64748b;">${createdText}</small></td>
                    <td><b style="color:#15803d; font-size:11px;">${lastLoginText}</b></td>
                    <td>${actionBtns}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch(e) {}
}

async function adminPromptResetPassword(targetUsername, name) {
    if (!currentUser || currentUser.role !== "RO") return;
    const newPassword = prompt(`उपयोगकर्ता '${name}' (${targetUsername}) हेतु नया पासवर्ड दर्ज करें (न्यूनतम 4 अक्षर):`);
    if (newPassword === null) return; // Cancelled
    if (!newPassword.trim() || newPassword.trim().length < 4) {
        alert("पासवर्ड कम से कम 4 अक्षरों का होना चाहिए!");
        return;
    }

    try {
        const res = await fetch('/api/admin/user/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                targetUsername,
                newPassword: newPassword.trim(),
                adminUsername: currentUser.name
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast(`🔑 ${result.message}`);
            alert(result.message);
            loadAdminUsersList();
        } else {
            alert(result.message || "पासवर्ड रीसेट में त्रुटि!");
        }
    } catch(e) {
        alert("सर्वर से कनेक्ट करने में त्रुटि!");
    }
}

async function adminDeleteUser(targetUsername, name) {
    if (!currentUser || currentUser.role !== "RO") return;
    if (targetUsername === 'ro_sumerpur') {
        alert("मुख्य RO खाते को हटाया नहीं जा सकता!");
        return;
    }
    if (!confirm(`क्या आप वाकई ऑपरेटर '${name}' (${targetUsername}) का खाता हटाना चाहते हैं?`)) {
        return;
    }

    try {
        const res = await fetch('/api/admin/user/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                targetUsername,
                adminUsername: currentUser.name
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast(`🗑️ ${result.message}`);
            alert(result.message);
            loadAdminUsersList();
        } else {
            alert(result.message || "यूज़र हटाने में त्रुटि!");
        }
    } catch(e) {
        alert("सर्वर से कनेक्ट करने में त्रुटि!");
    }
}

async function toggleGlobalOverride(enable) {
    if (!currentUser || currentUser.role !== "RO") return;
    try {
        const res = await fetch('/api/admin/time-override', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                override: enable ? 'true' : 'false',
                username: currentUser.name
            })
        });
        const result = await res.json();
        showToast(result.message);
        fetchData();
    } catch(e) {
        alert("त्रुटि!");
    }
}

async function promptToggleResetLock(enable) {
    if (!currentUser || currentUser.role !== "RO") return;
    const promptMsg = enable 
        ? "🛡️ 'लाइव मतदान दिवस सुरक्षा लॉक' सक्रिय करने हेतु अपना RO पासवर्ड दर्ज करें:\n(यह वास्तविक चुनाव में किसी भी डेटा रीसेट को पूर्ण रूप से ब्लॉक कर देगा)" 
        : "🔓 रिहर्सल टेस्ट हेतु डेटा रीसेट अनलॉक करने के लिए अपना RO पासवर्ड दर्ज करें:";
    const roPass = prompt(promptMsg);
    if (!roPass) return;

    try {
        const res = await fetch('/api/admin/toggle-reset-lock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                roUsername: currentUser.username,
                roPassword: roPass.trim(),
                locked: enable
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast(result.message);
            alert(result.message);
            await fetchData();
        } else {
            alert(result.message || "त्रुटि!");
        }
    } catch(e) {
        alert("सर्वर से कनेक्ट करने में त्रुटि!");
    }
}

function openSecureResetModal() {
    if (!currentUser || currentUser.role !== "RO") {
        alert("⛔ केवल अधिकृत रिटर्निंग ऑफिसर (SDM) को डेटा रीसेट करने की अनुमति है!");
        return;
    }
    const isLocked = portalData && portalData.config && portalData.config.reset_locked === 'true';
    if (isLocked) {
        alert("⛔ 'लाइव मतदान दिवस सुरक्षा लॉक' सक्रिय है!\n\nडेटा रीसेट करने से पहले ऊपर 'टेस्ट मोड हेतु अनलॉक करें' बटन पर क्लिक करके सुरक्षा लॉक हटाएं।");
        return;
    }

    const modal = document.getElementById("secureResetModal");
    if (!modal) return;

    document.getElementById("resetAuthRoUser").value = currentUser.username || "ro_sumerpur";
    document.getElementById("resetAuthRoPassword").value = "";
    document.getElementById("resetAuthConfirmCode").value = "";
    modal.classList.add("active");
    modal.style.display = "flex";
    setTimeout(() => {
        const passEl = document.getElementById("resetAuthRoPassword");
        if (passEl) passEl.focus();
    }, 100);
}

function closeSecureResetModal() {
    const modal = document.getElementById("secureResetModal");
    if (modal) {
        modal.classList.remove("active");
        modal.style.display = "none";
    }
}

async function executeSecureDatabaseReset() {
    if (!currentUser || currentUser.role !== "RO") return;
    const roUser = document.getElementById("resetAuthRoUser").value.trim();
    const roPassword = document.getElementById("resetAuthRoPassword").value.trim();
    const confirm = document.getElementById("resetAuthConfirmCode").value.trim();

    if (!roPassword) {
        alert("कृपया अपना RO मास्टर पासवर्ड दर्ज करें!");
        document.getElementById("resetAuthRoPassword").focus();
        return;
    }

    if (confirm !== 'RESET_SUMERPUR_2026') {
        alert("पुष्टिकरण कोड अमान्य है! कृपया ठीक 'RESET_SUMERPUR_2026' दर्ज करें।");
        document.getElementById("resetAuthConfirmCode").focus();
        return;
    }

    try {
        const res = await fetch('/api/admin/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                roUsername: roUser,
                roPassword: roPassword,
                confirm: confirm
            })
        });
        const result = await res.json();
        if (result.success) {
            closeSecureResetModal();
            alert(`✅ ${result.message}`);
            showToast("⚠️ सभी 35 बूथों का डेटा रीसेट हो चुका है।");
            await fetchData();
        } else {
            alert(`❌ ${result.message || "डेटा रीसेट विफल!"}`);
        }
    } catch(e) {
        alert("सर्वर से कनेक्ट करने में त्रुटि!");
    }
}

// Toast Helper
function showToast(msg) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.innerText = msg;
    toast.className = "show";
    setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 3000);
}
