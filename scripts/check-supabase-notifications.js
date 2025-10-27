// Script to check if Supabase notifications table is properly configured
// Run with: node scripts/check-supabase-notifications.js

const { createClient } = require('@supabase/supabase-js');

// Use your actual Supabase credentials
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.log('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

async function checkNotificationsTable() {
  console.log('🔍 Checking Supabase notifications setup...\n');

  try {
    // 1. Check if table exists
    const { data: tableInfo, error: tableError } = await supabase
      .from('notifications')
      .select('*')
      .limit(1);

    if (tableError) {
      if (tableError.message.includes('relation "notifications" does not exist')) {
        console.log('❌ Notifications table does not exist in Supabase');
        console.log('   Run the migration script in your Supabase dashboard');
        return false;
      } else {
        console.error('❌ Error checking table:', tableError.message);
        return false;
      }
    }

    console.log('✅ Notifications table exists');

    // 2. Test insert (with cleanup)
    const testNotification = {
      recipient_id: '00000000-0000-0000-0000-000000000000', // Dummy UUID
      type: 'test_notification',
      payload: { test: true, timestamp: new Date().toISOString() },
      read: false
    };

    const { data: inserted, error: insertError } = await supabase
      .from('notifications')
      .insert(testNotification)
      .select()
      .single();

    if (insertError) {
      console.log('⚠️ Cannot insert test notification:', insertError.message);
      console.log('   This might be due to RLS policies or constraints');
    } else {
      console.log('✅ Successfully inserted test notification');
      
      // Clean up test notification
      const { error: deleteError } = await supabase
        .from('notifications')
        .delete()
        .eq('id', inserted.id);
      
      if (!deleteError) {
        console.log('✅ Cleaned up test notification');
      }
    }

    // 3. Check recent notifications
    const { data: recentNotifications, error: recentError } = await supabase
      .from('notifications')
      .select('type, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if (!recentError && recentNotifications) {
      console.log(`\n📊 Found ${recentNotifications.length} recent notifications:`);
      recentNotifications.forEach(n => {
        console.log(`   - ${n.type} (${new Date(n.created_at).toLocaleString()})`);
      });
    }

    // 4. Check notification type distribution
    const { data: allNotifications, error: statsError } = await supabase
      .from('notifications')
      .select('type');

    if (!statsError && allNotifications) {
      const typeCounts = {};
      allNotifications.forEach(n => {
        typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
      });
      
      console.log('\n📈 Notification types distribution:');
      Object.entries(typeCounts).forEach(([type, count]) => {
        console.log(`   - ${type}: ${count}`);
      });
    }

    console.log('\n✅ Supabase notifications table is properly configured!');
    return true;

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return false;
  }
}

// Run the check
checkNotificationsTable().then(success => {
  process.exit(success ? 0 : 1);
});