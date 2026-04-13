const fetch = require('node-fetch');

async function testEarnings() {
    const API_URL = 'http://localhost:8000';
    // Note: This requires a valid user token if auth is enabled. 
    // For local tests, we'll check if the routes are at least defined and not status 404.
    
    const endpoints = [
        '/api/v1/earnings/summary',
        '/api/v1/earnings/wallet',
        '/api/v1/earnings/history'
    ];

    for (const path of endpoints) {
        try {
            const res = await fetch(`${API_URL}${path}`);
            console.log(`[TEST] ${path} -> Status: ${res.status}`);
            if (res.status === 200) {
                const data = await res.json();
                console.log(`[DATA] ${path}:`, JSON.stringify(data, null, 2));
            } else {
                const text = await res.text();
                // console.log(`[ERROR] ${path}:`, text.substring(0, 100));
            }
        } catch (e) {
            console.error(`[FAIL] ${path}:`, e.message);
        }
    }
}

testEarnings();
