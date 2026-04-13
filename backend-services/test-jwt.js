const jwt = require('jsonwebtoken');
require('dotenv').config();

const token = process.env.SUPABASE_SERVICE_ROLE_KEY;
const decoded = jwt.decode(token, { complete: true });
console.log('Decoded Header:', decoded.header);
try {
    jwt.verify(token, process.env.JWT_SECRET);
    console.log('Verified correctly as plain text');
} catch (e) {
    console.log('Error verifying as plain text:', e.message);
}
