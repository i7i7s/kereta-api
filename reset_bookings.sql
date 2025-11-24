-- ======================================
-- RESET ALL BOOKINGS SCRIPT
-- ======================================
-- Use this script to reset all bookings in the database
-- Run this in Railway MySQL console

-- 1. Reset all seats to available
UPDATE seats 
SET is_booked = 0, 
    booked_at = NULL 
WHERE is_booked = 1;

-- 2. Delete all booking records
DELETE FROM bookings;

-- 3. Verify reset (optional - check results)
SELECT 
    COUNT(*) as total_seats,
    SUM(CASE WHEN is_booked = 1 THEN 1 ELSE 0 END) as booked_seats,
    SUM(CASE WHEN is_booked = 0 THEN 1 ELSE 0 END) as available_seats
FROM seats;

-- Expected result: booked_seats should be 0

SELECT COUNT(*) as total_bookings FROM bookings;

-- Expected result: total_bookings should be 0

-- ======================================
-- HOW TO USE:
-- ======================================
-- 1. Open Railway.app
-- 2. Go to your project → MySQL service
-- 3. Click "Query" or "Connect"
-- 4. Copy and paste lines 10-14 (the UPDATE and DELETE statements)
-- 5. Execute the query
-- 6. Optionally run the SELECT queries (lines 17-26) to verify
-- ======================================
