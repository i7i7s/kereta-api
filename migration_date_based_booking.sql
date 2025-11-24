-- ============================================
-- SQL Migration Script untuk Date-Based Booking
-- FritzLine Railway App - Phase 2
-- ============================================
-- 
-- TUJUAN: Memungkinkan booking kursi per tanggal keberangkatan
-- sehingga kursi yang sama bisa di-book untuk hari yang berbeda
--
-- CHANGES:
-- 1. Add tanggal_keberangkatan to bookings table
-- 2. Remove is_booked, booked_at, gender from seats table
-- 3. Seats table menjadi pure master data
-- 4. Bookings table menjadi transaction table dengan tanggal
-- ============================================

-- STEP 0: BACKUP DATA (IMPORTANT!)
-- Jalankan query ini untuk backup sebelum migration
-- CREATE TABLE seats_backup AS SELECT * FROM seats;
-- CREATE TABLE bookings_backup AS SELECT * FROM bookings;

-- STEP 1: Update bookings table dengan tanggal keberangkatan
-- Cek apakah kolom sudah ada
SET @col_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'bookings'
    AND COLUMN_NAME = 'tanggal_keberangkatan'
);

-- Tambah kolom tanggal_keberangkatan jika belum ada
-- Default: hari ini untuk data lama
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS tanggal_keberangkatan DATE NOT NULL DEFAULT (CURRENT_DATE)
AFTER id_kereta;

-- Update existing data: set tanggal dari created_at
UPDATE bookings 
SET tanggal_keberangkatan = DATE(created_at) 
WHERE tanggal_keberangkatan = CURRENT_DATE;

-- STEP 2: Add index untuk query performance
CREATE INDEX IF NOT EXISTS idx_booking_date 
ON bookings (id_kereta, tanggal_keberangkatan, id_kursi);

CREATE INDEX IF NOT EXISTS idx_kereta_date_status 
ON bookings (id_kereta, tanggal_keberangkatan, status_pembayaran);

-- STEP 3: Migrate data dari seats ke bookings
-- Untuk seats yang is_booked = 1 tapi belum ada di bookings
-- (temporary bookings yang belum confirmed)

-- Buat temporary bookings untuk kursi yang ter-hold
INSERT INTO bookings (
    id_kereta,
    tanggal_keberangkatan,
    id_kursi,
    kode_booking,
    nama_penumpang,
    id_number,
    total_harga,
    status_pembayaran,
    created_at
)
SELECT 
    s.id_kereta,
    CURRENT_DATE as tanggal_keberangkatan,
    s.id_kursi,
    CONCAT('TEMP-', s.id_kursi) as kode_booking,
    'MIGRATED' as nama_penumpang,
    '0000000000000000' as id_number,
    0 as total_harga,
    'pending' as status_pembayaran,
    s.booked_at
FROM seats s
LEFT JOIN bookings b ON s.id_kursi = b.id_kursi
WHERE s.is_booked = 1 
  AND b.id_booking IS NULL
  AND s.booked_at IS NOT NULL;

-- STEP 4: Remove booking-related columns from seats table
-- Seats akan menjadi pure master data

-- Drop indexes dulu
DROP INDEX IF EXISTS idx_is_booked ON seats;
DROP INDEX IF EXISTS idx_id_kereta_booked ON seats;

-- Drop columns
ALTER TABLE seats DROP COLUMN IF EXISTS is_booked;
ALTER TABLE seats DROP COLUMN IF EXISTS booked_at;
ALTER TABLE seats DROP COLUMN IF EXISTS gender;

-- STEP 5: Update stored procedure untuk auto-release
-- Sekarang based on bookings table, bukan seats
DELIMITER $$

DROP PROCEDURE IF EXISTS release_expired_seats$$

CREATE PROCEDURE release_expired_seats()
BEGIN
  -- Delete pending bookings yang sudah lebih dari 15 menit
  DELETE FROM bookings
  WHERE status_pembayaran = 'pending'
    AND created_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE);
END$$

DELIMITER ;

-- STEP 6: Update view v_seat_availability
-- Sekarang count dari bookings, bukan dari seats.is_booked
DROP VIEW IF EXISTS v_seat_availability;

CREATE VIEW v_seat_availability AS
SELECT 
  t.id_kereta,
  t.nama_kereta,
  t.kelas,
  CURRENT_DATE as tanggal_keberangkatan,
  COUNT(s.id_kursi) as total_seats,
  COUNT(s.id_kursi) - COUNT(b.id_booking) as available_seats,
  COUNT(b.id_booking) as booked_seats,
  ROUND((COUNT(b.id_booking) / COUNT(s.id_kursi) * 100), 2) as occupancy_rate
FROM trains t
LEFT JOIN seats s ON t.id_kereta = s.id_kereta
LEFT JOIN bookings b 
  ON s.id_kursi = b.id_kursi 
  AND s.id_kereta = b.id_kereta
  AND b.tanggal_keberangkatan = CURRENT_DATE
  AND b.status_pembayaran IN ('pending', 'paid')
GROUP BY t.id_kereta, t.nama_kereta, t.kelas;

-- STEP 7: Update view v_booking_details (no change needed)
-- Already based on bookings table

-- STEP 8: Verify migration
SELECT 'Migration completed successfully!' as status;

-- Test queries
SELECT 'Total seats in master table:' as info, COUNT(*) as count FROM seats;
SELECT 'Total bookings:' as info, COUNT(*) as count FROM bookings;
SELECT 'Bookings today:' as info, COUNT(*) as count 
FROM bookings 
WHERE tanggal_keberangkatan = CURRENT_DATE;

-- STEP 9: CLEANUP (Optional - jalankan setelah yakin migration sukses)
-- DROP TABLE IF EXISTS seats_backup;
-- DROP TABLE IF EXISTS bookings_backup;

-- ROLLBACK PLAN (Jika ada masalah):
-- 1. Restore from backup:
--    DROP TABLE seats;
--    CREATE TABLE seats AS SELECT * FROM seats_backup;
--    DROP TABLE bookings;
--    CREATE TABLE bookings AS SELECT * FROM bookings_backup;
-- 2. Re-run previous migration

COMMIT;
