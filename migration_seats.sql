-- ============================================
-- SQL Migration Script untuk Fitur Stok Kursi
-- FritzLine Railway App
-- ============================================

-- 1. Update tabel seats dengan kolom booking status
-- Drop kolom jika sudah ada untuk avoid error
ALTER TABLE seats DROP COLUMN IF EXISTS is_booked;
ALTER TABLE seats DROP COLUMN IF EXISTS booked_at;

ALTER TABLE seats 
ADD COLUMN is_booked TINYINT(1) DEFAULT 0 COMMENT 'Status booking: 0=available, 1=booked',
ADD COLUMN booked_at DATETIME NULL COMMENT 'Timestamp saat kursi di-book';

ALTER TABLE seats ADD INDEX IF NOT EXISTS idx_is_booked (is_booked);
ALTER TABLE seats ADD INDEX IF NOT EXISTS idx_id_kereta_booked (id_kereta, is_booked);

-- 2. Update tabel bookings untuk struktur yang lebih lengkap
-- Cek apakah tabel bookings sudah ada
CREATE TABLE IF NOT EXISTS bookings (
  id_booking INT AUTO_INCREMENT PRIMARY KEY,
  id_kereta VARCHAR(10) NOT NULL,
  id_kursi INT NOT NULL,
  kode_booking VARCHAR(50) NOT NULL,
  nama_penumpang VARCHAR(100) NOT NULL,
  id_number VARCHAR(50) NOT NULL,
  total_harga DECIMAL(10,2) NOT NULL,
  status_pembayaran ENUM('pending', 'paid', 'cancelled') DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (id_kereta) REFERENCES trains(id_kereta) ON DELETE CASCADE,
  FOREIGN KEY (id_kursi) REFERENCES seats(id_kursi) ON DELETE CASCADE,
  
  INDEX idx_kode_booking (kode_booking),
  INDEX idx_status (status_pembayaran),
  INDEX idx_id_kereta (id_kereta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3. Stored Procedure untuk auto-release kursi setelah timeout (optional)
DELIMITER $$

DROP PROCEDURE IF EXISTS release_expired_seats$$

CREATE PROCEDURE release_expired_seats()
BEGIN
  -- Release kursi yang di-book lebih dari 15 menit tanpa konfirmasi pembayaran
  UPDATE seats s
  LEFT JOIN bookings b ON s.id_kursi = b.id_kursi AND b.status_pembayaran = 'paid'
  SET s.is_booked = 0, s.booked_at = NULL
  WHERE s.is_booked = 1 
    AND s.booked_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)
    AND b.id_booking IS NULL;
END$$

DELIMITER ;

-- 4. Event Scheduler untuk auto-release (jalankan setiap 5 menit)
SET GLOBAL event_scheduler = ON;

CREATE EVENT IF NOT EXISTS auto_release_seats
ON SCHEDULE EVERY 5 MINUTE
DO CALL release_expired_seats();

-- 5. View untuk monitoring kursi available per kereta
CREATE OR REPLACE VIEW v_seat_availability AS
SELECT 
  t.id_kereta,
  t.nama_kereta,
  t.kelas,
  COUNT(s.id_kursi) as total_seats,
  SUM(CASE WHEN s.is_booked = 0 THEN 1 ELSE 0 END) as available_seats,
  SUM(CASE WHEN s.is_booked = 1 THEN 1 ELSE 0 END) as booked_seats,
  ROUND((SUM(CASE WHEN s.is_booked = 1 THEN 1 ELSE 0 END) / COUNT(s.id_kursi) * 100), 2) as occupancy_rate
FROM trains t
LEFT JOIN seats s ON t.id_kereta = s.id_kereta
GROUP BY t.id_kereta, t.nama_kereta, t.kelas;

-- 6. View untuk booking history yang lebih detail
CREATE OR REPLACE VIEW v_booking_details AS
SELECT 
  b.id_booking,
  b.kode_booking,
  b.nama_penumpang,
  b.id_number,
  b.total_harga,
  b.status_pembayaran,
  b.created_at,
  t.nama_kereta,
  t.kelas,
  s.nama_gerbong,
  s.nomor_kursi
FROM bookings b
JOIN trains t ON b.id_kereta = t.id_kereta
JOIN seats s ON b.id_kursi = s.id_kursi
ORDER BY b.created_at DESC;

-- 7. Trigger untuk sync seats.is_booked saat booking dikonfirmasi
DELIMITER $$

DROP TRIGGER IF EXISTS after_booking_insert$$

CREATE TRIGGER after_booking_insert
AFTER INSERT ON bookings
FOR EACH ROW
BEGIN
  IF NEW.status_pembayaran = 'paid' THEN
    UPDATE seats 
    SET is_booked = 1, booked_at = NEW.created_at
    WHERE id_kursi = NEW.id_kursi;
  END IF;
END$$

DROP TRIGGER IF EXISTS after_booking_update$$

CREATE TRIGGER after_booking_update
AFTER UPDATE ON bookings
FOR EACH ROW
BEGIN
  IF NEW.status_pembayaran = 'cancelled' AND OLD.status_pembayaran != 'cancelled' THEN
    UPDATE seats 
    SET is_booked = 0, booked_at = NULL
    WHERE id_kursi = NEW.id_kursi;
  END IF;
END$$

DELIMITER ;

-- 8. Query test untuk verifikasi
-- Uncomment untuk testing:

-- SELECT * FROM v_seat_availability;
-- SELECT * FROM v_booking_details LIMIT 10;
-- SELECT COUNT(*) as total_seats FROM seats;
-- SELECT id_kereta, COUNT(*) as seats_per_train FROM seats GROUP BY id_kereta;

COMMIT;
