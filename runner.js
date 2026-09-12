const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Helper for finding cloudflared path
function getCloudflaredPath() {
    const defaultWinPath = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
    if (fs.existsSync(defaultWinPath)) return defaultWinPath;
    const progFilesPath = 'C:\\Program Files\\cloudflared\\cloudflared.exe';
    if (fs.existsSync(progFilesPath)) return progFilesPath;
    return 'cloudflared';
}

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

console.log("\n========================================================================");
console.log(" 🏛️  सुमेरपुर नगर पालिका चुनाव 2026 — लोकल कंट्रोल रूम सर्वर");
console.log("========================================================================");
console.log(" ⏳ लोकल सर्वर और रिमोट टनल शुरू हो रहे हैं, कृपया प्रतीक्षा करें...\n");

// 1. Start Node server
const serverProcess = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    cwd: __dirname,
    stdio: ['inherit', 'pipe', 'pipe']
});

serverProcess.stdout.on('data', (data) => {
    process.stdout.write(data);
});

serverProcess.stderr.on('data', (data) => {
    process.stderr.write(data);
});

// 2. Start Cloudflared Tunnel
const cloudflaredBin = getCloudflaredPath();
const tunnelProcess = spawn(cloudflaredBin, ['tunnel', '--url', 'http://127.0.0.1:3000'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe']
});

let publicUrl = null;

function handleTunnelOutput(data) {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && !publicUrl) {
        publicUrl = match[0];
        const localIP = getLocalIP();

        // Save public URL to a file for easy copying
        fs.writeFileSync(path.join(__dirname, 'public_url.txt'), publicUrl, 'utf-8');

        console.log("\n========================================================================");
        console.log(" 🎉 सर्वर और रिमोट टनल सफलतापूर्वक सक्रिय (ACTIVE) हैं!");
        console.log("========================================================================");
        console.log(` 🌐  रिमोट/मोबाइल लिंक (फील्ड ऑपरेटर कहीं से भी खोलें):`);
        console.log(`     👉  ${publicUrl}`);
        console.log(`     📄  पब्लिक रिपोर्ट:  ${publicUrl}/report.html`);
        console.log(`     📊  लाइव डिस्प्ले:   ${publicUrl}/#livedisplay`);
        console.log("------------------------------------------------------------------------");
        console.log(` 🖥️  ऑफिस लोकल लिंक (कंट्रोल रूम LAN / Wi-Fi):`);
        console.log(`     👉  http://localhost:3000`);
        console.log(`     👉  http://${localIP}:3000`);
        console.log("------------------------------------------------------------------------");
        console.log(` 💾  डेटाबेस: Local Hard Drive (${path.join(__dirname, 'election_sumerpur.db')})`);
        console.log(` 🛡️  सुरक्षा: 100% डेटा आपके इसी कंप्यूटर पर सुरक्षित रहेगा (Never Resets)`);
        console.log(` 📋  यह लिंक 'public_url.txt' फाइल में भी सुरक्षित लिख दिया गया है।`);
        console.log("========================================================================\n");
    }
}

tunnelProcess.stdout.on('data', handleTunnelOutput);
tunnelProcess.stderr.on('data', handleTunnelOutput);

// Cleanup on exit
function cleanup() {
    console.log("\n⚠️ सर्वर और टनल बंद किए जा रहे हैं...");
    try { serverProcess.kill(); } catch (e) {}
    try { tunnelProcess.kill(); } catch (e) {}
    process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
