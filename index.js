// 1. Impor library
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors'); 
const app = express();

// 2. Aktifkan CORS dan JSON parsing
app.use(cors());
app.use(express.json()); // Penting untuk menerima POST request dengan JSON body

// 3. Hubungkan ke Database Railway (Otomatis)
const dbPool = mysql.createPool({
  host: process.env.MYSQLHOST,
  port: process.env.MYSQLPORT,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE
});

// 4. Endpoint API untuk mencari kereta
app.get('/search', async (req, res) => {
  const { from, to, date } = req.query; 

  if (!from || !to) {
    return res.status(400).json({ error: "Parameter 'from' dan 'to' wajib diisi." });
  }

  // Default tanggal = hari ini jika tidak disediakan
  const tanggalKeberangkatan = date || new Date().toISOString().split('T')[0];

  const sqlQuery = `
    SELECT 
      t.id_kereta,
      t.nama_kereta, 
      t.kelas,
      t.is_pso,
      t.harga_pso,
      t.harga_total_full,
      t.durasi_total_full,
      asal.waktu_berangkat AS jadwalBerangkat,
      tujuan.waktu_tiba AS jadwalTiba,
      (tujuan.durasi_dari_awal - asal.durasi_dari_awal) AS durasi_segmen_menit
    FROM trains t
    JOIN stops asal ON t.id_kereta = asal.id_kereta
    JOIN stops tujuan ON t.id_kereta = tujuan.id_kereta
    WHERE 
      asal.kode_stasiun = ? AND 
      tujuan.kode_stasiun = ? AND 
      asal.urutan < tujuan.urutan;
  `;

  try {
    const [results] = await dbPool.query(sqlQuery, [from, to]);
    
    const finalResults = await Promise.all(results.map(async (train) => {
      
      let finalPrice = 0;
      if (train.is_pso) {
        finalPrice = train.harga_pso;
      } else {
        const persentasePerjalanan = train.durasi_segmen_menit / train.durasi_total_full;
        const hargaKalkulasi = persentasePerjalanan * train.harga_total_full;
        
        finalPrice = Math.ceil(hargaKalkulasi / 1000) * 1000;
      }
      
      const durasiMenit = train.durasi_segmen_menit || 0;
      const jam = Math.floor(durasiMenit / 60);
      const menit = durasiMenit % 60;
      
      // Hitung sisa tiket REAL dari database berdasarkan tanggal
      const [seatCount] = await dbPool.query(`
        SELECT 
          COUNT(s.id_kursi) as total_seats,
          COUNT(s.id_kursi) - COUNT(b.id_booking) as available_seats
        FROM seats s
        LEFT JOIN bookings b 
          ON s.id_kursi = b.id_kursi 
          AND s.id_kereta = b.id_kereta
          AND b.tanggal_keberangkatan = ?
          AND b.status_pembayaran IN ('pending', 'paid')
        WHERE s.id_kereta = ?
      `, [tanggalKeberangkatan, train.id_kereta]);
      
      const sisaTiket = seatCount[0]?.available_seats || 0;
      
      return {
        id_kereta: train.id_kereta,
        nama_kereta: train.nama_kereta,
        kelas: train.kelas,
        jadwalBerangkat: train.jadwalBerangkat,
        jadwalTiba: train.jadwalTiba,
        harga: finalPrice,
        durasi: `${jam}j ${menit}m`,
        sisaTiket: sisaTiket // Sekarang REAL dari database
      };
    }));

    res.json(finalResults);

  } catch (error) {
    console.error("Database query error:", error);
    res.status(500).json({ error: "Database query failed" });
  }
});

// 5. NEW ENDPOINT: Get available seats untuk kereta tertentu
app.get('/seats/:id_kereta', async (req, res) => {
  const { id_kereta } = req.params;
  const { date } = req.query;
  
  // Default tanggal = hari ini jika tidak disediakan
  const tanggalKeberangkatan = date || new Date().toISOString().split('T')[0];
  
  try {
    // Ambil semua kursi dan status booking untuk tanggal tertentu
    const [seats] = await dbPool.query(`
      SELECT 
        s.id_kursi,
        s.id_kereta,
        s.nama_gerbong,
        s.nomor_kursi,
        CASE WHEN b.id_booking IS NOT NULL THEN 1 ELSE 0 END as is_booked,
        b.created_at as booked_at,
        b.gender
      FROM seats s
      LEFT JOIN bookings b 
        ON s.id_kursi = b.id_kursi 
        AND s.id_kereta = b.id_kereta
        AND b.tanggal_keberangkatan = ?
        AND b.status_pembayaran IN ('pending', 'paid')
      WHERE s.id_kereta = ?
      ORDER BY s.nama_gerbong, s.nomor_kursi
    `, [tanggalKeberangkatan, id_kereta]);

    // Group seats by gerbong untuk kemudahan di Flutter
    const groupedSeats = {};
    seats.forEach(seat => {
      if (!groupedSeats[seat.nama_gerbong]) {
        groupedSeats[seat.nama_gerbong] = [];
      }
      groupedSeats[seat.nama_gerbong].push({
        id_kursi: seat.id_kursi,
        nomor_kursi: seat.nomor_kursi,
        is_booked: seat.is_booked === 1,
        booked_at: seat.booked_at,
        gender: seat.gender // may be null
      });
    });

    res.json({
      id_kereta: id_kereta,
      tanggal_keberangkatan: tanggalKeberangkatan,
      total_seats: seats.length,
      available_seats: seats.filter(s => s.is_booked === 0).length,
      booked_seats: seats.filter(s => s.is_booked === 1).length,
      gerbong: groupedSeats
    });

  } catch (error) {
    console.error("Error fetching seats:", error);
    res.status(500).json({ error: "Failed to fetch seats" });
  }
});

// 6. NEW ENDPOINT: Book seats (temporary hold)
app.post('/seats/book', async (req, res) => {
  const { id_kereta, seat_ids, tanggal_keberangkatan, seat_details } = req.body;
  
  if (!id_kereta || !seat_ids || !Array.isArray(seat_ids) || seat_ids.length === 0) {
    return res.status(400).json({ 
      error: "Parameter 'id_kereta' dan 'seat_ids' (array) wajib diisi." 
    });
  }

  if (!tanggal_keberangkatan) {
    return res.status(400).json({ 
      error: "Parameter 'tanggal_keberangkatan' wajib diisi (format: YYYY-MM-DD)." 
    });
  }

  let connection;
  try {
    connection = await dbPool.getConnection();
    await connection.beginTransaction();

    // Check apakah semua kursi masih available untuk tanggal tersebut
    const placeholders = seat_ids.map(() => '?').join(',');
    const [seatCheck] = await connection.query(`
      SELECT 
        s.id_kursi, 
        s.nomor_kursi, 
        CASE WHEN b.id_booking IS NOT NULL THEN 1 ELSE 0 END as is_booked
      FROM seats s
      LEFT JOIN bookings b 
        ON s.id_kursi = b.id_kursi 
        AND s.id_kereta = b.id_kereta
        AND b.tanggal_keberangkatan = ?
        AND b.status_pembayaran IN ('pending', 'paid')
      WHERE s.id_kursi IN (${placeholders}) AND s.id_kereta = ?
      FOR UPDATE
    `, [tanggal_keberangkatan, ...seat_ids, id_kereta]);

    // Validasi: apakah ada kursi yang sudah di-book?
    const alreadyBooked = seatCheck.filter(s => s.is_booked === 1);
    if (alreadyBooked.length > 0) {
      await connection.rollback();
      return res.status(409).json({ 
        error: "Kursi sudah dibooking oleh pengguna lain untuk tanggal tersebut",
        booked_seats: alreadyBooked.map(s => s.nomor_kursi)
      });
    }

    // Insert booking records (temporary hold dengan status pending)
    for (const sid of seat_ids) {
      const detail = seat_details?.find(d => d.id_kursi === sid) || {};
      const gender = detail.gender || null;
      
      await connection.query(`
        INSERT INTO bookings (
          id_kereta,
          tanggal_keberangkatan,
          id_kursi,
          kode_booking,
          nama_penumpang,
          id_number,
          total_harga,
          status_pembayaran,
          gender,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW())
      `, [
        id_kereta,
        tanggal_keberangkatan,
        sid,
        `TEMP-${Date.now()}-${sid}`, // Temporary booking code
        'PENDING',
        '0000000000000000',
        0,
        gender
      ]);
    }

    await connection.commit();

    res.json({ 
      success: true, 
      message: "Kursi berhasil dibooking",
      booked_seats: seat_ids
    });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error booking seats:", error);
    res.status(500).json({ error: "Failed to book seats" });
  } finally {
    if (connection) connection.release();
  }
});

// 7. NEW ENDPOINT: Release seats (jika pembayaran gagal/timeout)
app.post('/seats/release', async (req, res) => {
  const { seat_ids, tanggal_keberangkatan } = req.body;
  
  if (!seat_ids || !Array.isArray(seat_ids) || seat_ids.length === 0) {
    return res.status(400).json({ 
      error: "Parameter 'seat_ids' (array) wajib diisi." 
    });
  }

  if (!tanggal_keberangkatan) {
    return res.status(400).json({ 
      error: "Parameter 'tanggal_keberangkatan' wajib diisi." 
    });
  }

  try {
    const placeholders = seat_ids.map(() => '?').join(',');
    // Delete pending bookings untuk kursi dan tanggal tersebut
    await dbPool.query(`
      DELETE FROM bookings
      WHERE id_kursi IN (${placeholders})
        AND tanggal_keberangkatan = ?
        AND status_pembayaran = 'pending'
    `, [...seat_ids, tanggal_keberangkatan]);

    res.json({ 
      success: true, 
      message: "Kursi berhasil direlease",
      released_seats: seat_ids
    });

  } catch (error) {
    console.error("Error releasing seats:", error);
    res.status(500).json({ error: "Failed to release seats" });
  }
});

// 8. NEW ENDPOINT: Confirm booking (setelah pembayaran sukses)
app.post('/bookings/confirm', async (req, res) => {
  const { 
    id_kereta,
    tanggal_keberangkatan,
    seat_ids, 
    passenger_data,
    total_price,
    kode_booking 
  } = req.body;

  if (!id_kereta || !tanggal_keberangkatan || !seat_ids || !passenger_data || !total_price) {
    return res.status(400).json({ 
      error: "Data booking tidak lengkap (perlu: id_kereta, tanggal_keberangkatan, seat_ids, passenger_data, total_price)" 
    });
  }

  let connection;
  try {
    connection = await dbPool.getConnection();
    await connection.beginTransaction();

    // Generate kode booking jika belum ada
    const bookingCode = kode_booking || `FK${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    // Update existing pending bookings menjadi paid dengan data lengkap
    // atau Insert baru jika belum ada
    for (let i = 0; i < seat_ids.length; i++) {
      const passenger = passenger_data[i];
      const seat_id = seat_ids[i];
      const gender = passenger.gender || null;

      // Cek apakah sudah ada pending booking
      const [existing] = await connection.query(`
        SELECT id_booking FROM bookings
        WHERE id_kursi = ? 
          AND id_kereta = ?
          AND tanggal_keberangkatan = ?
          AND status_pembayaran = 'pending'
        LIMIT 1
      `, [seat_id, id_kereta, tanggal_keberangkatan]);

      if (existing.length > 0) {
        // Update existing pending booking
        await connection.query(`
          UPDATE bookings
          SET kode_booking = ?,
              nama_penumpang = ?,
              id_number = ?,
              total_harga = ?,
              gender = ?,
              status_pembayaran = 'paid'
          WHERE id_booking = ?
        `, [
          bookingCode,
          passenger.nama,
          passenger.id_number,
          total_price / seat_ids.length,
          gender,
          existing[0].id_booking
        ]);
      } else {
        // Insert new booking (direct confirm tanpa hold)
        await connection.query(`
          INSERT INTO bookings (
            id_kereta,
            tanggal_keberangkatan,
            id_kursi, 
            kode_booking,
            nama_penumpang,
            id_number,
            total_harga,
            gender,
            status_pembayaran,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid', NOW())
        `, [
          id_kereta,
          tanggal_keberangkatan,
          seat_id,
          bookingCode,
          passenger.nama,
          passenger.id_number,
          total_price / seat_ids.length,
          gender
        ]);
      }
    }

    await connection.commit();

    res.json({ 
      success: true, 
      message: "Booking berhasil dikonfirmasi",
      kode_booking: bookingCode
    });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error confirming booking:", error);
    res.status(500).json({ error: "Failed to confirm booking" });
  } finally {
    if (connection) connection.release();
  }
});

// 9. NEW ENDPOINT: Get booking history
app.get('/bookings/history/:kode_booking', async (req, res) => {
  const { kode_booking } = req.params;
  
  try {
    const [bookings] = await dbPool.query(`
      SELECT 
        b.*,
        s.nomor_kursi,
        s.nama_gerbong,
        t.nama_kereta,
        t.kelas
      FROM bookings b
      JOIN seats s ON b.id_kursi = s.id_kursi
      JOIN trains t ON b.id_kereta = t.id_kereta
      WHERE b.kode_booking = ?
    `, [kode_booking]);

    if (bookings.length === 0) {
      return res.status(404).json({ error: "Booking tidak ditemukan" });
    }

    res.json({
      kode_booking: kode_booking,
      bookings: bookings
    });

  } catch (error) {
    console.error("Error fetching booking history:", error);
    res.status(500).json({ error: "Failed to fetch booking history" });
  }
});

// 10. Jalankan Server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server API FritzLine berjalan di port ${port}`);
  console.log(`✅ Date-based booking system enabled`);
  console.log(`Endpoints tersedia:`);
  console.log(`  GET  /search?from=X&to=Y&date=YYYY-MM-DD - Cari kereta (date optional, default: today)`);
  console.log(`  GET  /seats/:id_kereta?date=YYYY-MM-DD - Get kursi available (date optional, default: today)`);
  console.log(`  POST /seats/book - Book kursi (require: tanggal_keberangkatan)`);
  console.log(`  POST /seats/release - Release kursi (require: tanggal_keberangkatan)`);
  console.log(`  POST /bookings/confirm - Konfirmasi booking (require: tanggal_keberangkatan)`);
  console.log(`  GET  /bookings/history/:kode_booking - Get history booking`);
});
