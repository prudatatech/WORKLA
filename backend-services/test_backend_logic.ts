import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

async function testBackendLogic() {
  const providerId = "14900651-067f-4b5c-82a7-f63c3932c4a9";
  const user = { sub: providerId };
  const role = 'provider';
  const status = 'confirmed,en_route,arrived,in_progress';
  const offset = 0;
  const limit = 20;

  try {
      let query = supabaseAdmin
          .from('bookings')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

      // Filter by role
      if (role === 'provider') {
          query = query.eq('provider_id', user.sub);
      } else {
          query = query.eq('customer_id', user.sub);
      }

      // Optional status filter
      if (status) {
          if (status.includes(',')) {
              console.log("Using IN:", status.split(','));
              query = query.in('status', status.split(','));
          } else {
              query = query.eq('status', status);
          }
      }

      const { data, error, count } = await query;
      console.log('Error:', error);
      console.log('Count:', count);
      console.log('Data Length:', data?.length);
  } catch (err: any) {
      console.error(err);
  }
}
testBackendLogic();
