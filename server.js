// Root entry point for Render deployment
const path = require('path');
process.chdir(path.join(__dirname, 'NP_Election_2026'));
require('./NP_Election_2026/server.js');
