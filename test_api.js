
const fetch = require('node-fetch');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken'); // Need to mint a token

dotenv.config({ path: 'd:/WorkLAA-main/backend-services/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const pId = '14900651-067f-4b5c-82a7-f63c3932c4a9';
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-token-for-worklaa-123!';

async function testApi() {
    // Generate a valid JWT for the provider
    const token = jwt.sign({
        sub: pId,
        role: 'PROVIDER',
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + (60 * 60)
    }, JWT_SECRET);

    console.log('Token generated.');

    // Wait, since we are fetching from Railway, we use the production URL!
    // But the user might not have deployed yet? User said "i will redoply all backend and apps"
    const url = 'http://localhost:8000/api/v1/bookings?role=provider&status=confirmed,en_route,arrived,in_progress&refresh=true';
    
    console.log(`Fetching: ${url}`);
    try {
        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cache-Control': 'no-cache'
            }
        });
        
        console.log('Status:', res.status);
        const data = await res.json();
        console.log('Response:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}

testApi();
