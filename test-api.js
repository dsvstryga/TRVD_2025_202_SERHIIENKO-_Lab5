// Simulate browser environment
const fs = require('fs');
const path = require('path');

// Mock window and document
global.window = global;
global.document = {};
global.localStorage = {
    data: {},
    setItem(k, v) { this.data[k] = String(v); },
    getItem(k) { return this.data[k] || null; },
    removeItem(k) { delete this.data[k]; },
    clear() { this.data = {}; }
};
global.fetch = require('node-fetch');
global.console = console;

// Load config
console.log('\n=== Loading config.js ===');
eval(fs.readFileSync(path.join(__dirname, 'frontend/js/config.js'), 'utf-8'));
console.log('APP_CONFIG.API_BASE_URL:', APP_CONFIG.API_BASE_URL);

// Load api.js
console.log('\n=== Loading api.js ===');
eval(fs.readFileSync(path.join(__dirname, 'frontend/js/api.js'), 'utf-8'));
console.log('API.BASE_URL:', API.BASE_URL);

// Test getTracks
console.log('\n=== Testing API.getTracks() ===');
(async () => {
    try {
        const tracks = await API.getTracks();
        console.log('Tracks received:', tracks ? tracks.length : null);
        if (tracks && tracks.length > 0) {
            console.log('First track:', JSON.stringify(tracks[0], null, 2));
        } else {
            console.log('No tracks returned!');
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
})();
