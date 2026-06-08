async function test() {
    const url = 'https://dbworkla.prudata-tech.workers.dev/auth/v1/user';
    const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0d2VreWx6dWN0YXRjZ3lya2ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMDI0OTEsImV4cCI6MjA5MTY3ODQ5MX0.4HFUbCqiO4pr6Bm6sHZc7Ifj6oHsYfiB5KN8cmZyeJs';

    console.log('Testing Supabase worker auth endpoint using global fetch...');
    try {
        const response = await fetch(url, {
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${anonKey}`
            }
        });
        console.log('Status:', response.status);
        console.log('Status Text:', response.statusText);
        const text = await response.text();
        console.log('Response body:', text);
    } catch (err) {
        console.error('Error fetching:', err);
    }
}

test();
