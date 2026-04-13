async function testFetch() {
  const customToken = require('jsonwebtoken').sign({
    role: 'authenticated',
    aud: 'authenticated',
    sub: '14900651-067f-4b5c-82a7-f63c3932c4a9',
  }, 'T+V3GvkYXxIlg3xqthVZO8siryzhYYiha6WyRMd9YRNKa+ur9ClO2AGscUk6QpqwzslOaTmChXVwtPSofyq+8g==');

  const url = 'http://127.0.0.1:8000/api/v1/bookings?role=provider&status=confirmed,en_route,arrived,in_progress';
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${customToken}` }
  });

  const body = await res.json();
  console.log('Status code:', res.status);
  console.log('Body Count:', body.count, body.data?.length);
  if(body.data?.length > 0) {
    console.log('First Item ID:', body.data[0].id);
  } else {
    console.log('Returned zero items!');
  }
}

testFetch();
