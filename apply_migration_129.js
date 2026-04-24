const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config({ path: 'd:/WorkLAA-main/backend-services/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function applyMigration() {
    console.log('=== APPLYING MIGRATION 129 ===\n');

    // Read the migration file
    const sql = fs.readFileSync('d:/WorkLAA-main/supabase/migrations/129_fix_notifications_type_column.sql', 'utf8');

    // Split by statement (rough split - handle DO blocks carefully)
    // We'll execute the key statements individually for better error handling

    // Step 1: Add the type column
    console.log('Step 1: Adding type column to notifications...');
    const { error: e1 } = await supabase.rpc('exec_sql', { sql: `
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'notifications'
                  AND column_name = 'type'
            ) THEN
                ALTER TABLE public.notifications
                    ADD COLUMN type TEXT NOT NULL DEFAULT 'general';
            END IF;
        END $$;
    `});
    if (e1) console.error('  Step 1 error:', e1.message);
    else console.log('  ✅ Done');

    // Step 2: Check current notifications columns
    console.log('\nStep 2: Verifying columns...');
    const { data: cols } = await supabase
        .from('notifications')
        .select('*')
        .limit(1);
    
    // If no rows, insert a test row to check columns work
    if (!cols || cols.length === 0) {
        // Try inserting with type
        const { error: testErr } = await supabase.from('notifications').insert({
            user_id: 'fb1c0d3d-17fa-4779-8b25-d58f56d2e026',
            title: 'Schema Test',
            body: 'Testing type column',
            type: 'test',
            data: { test: true },
            is_read: false
        });
        if (testErr) {
            console.error('  ❌ Insert with type FAILED:', testErr.message);
            console.log('  Code:', testErr.code);
        } else {
            console.log('  ✅ Insert with type column succeeded!');
            // Clean up test
            await supabase.from('notifications').delete().eq('title', 'Schema Test');
        }
    } else {
        console.log('  Existing notification columns:', Object.keys(cols[0]));
        if ('type' in cols[0]) {
            console.log('  ✅ type column exists!');
        } else {
            console.log('  ❌ type column STILL missing!');
        }
    }
}

applyMigration().catch(e => console.error('Fatal:', e));
