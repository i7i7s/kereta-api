const mysql = require('mysql2/promise');

// PENTING: Gunakan kredensial PUBLIK Railway Anda di sini
const dbPool = mysql.createPool({
  host: 'tramway.proxy.rlwy.net',
  port: 49968,
  user: 'root',
  password: 'SKFYICRESSqYSlMWlNYMGtAZrKMCHiVc',
  database: 'railway'
});

// Logika generate kursi dengan status booking
async function generateAndInsertSeats() {
  console.log("Memulai script seeder kursi dengan fitur booking...");
  let connection;

  try {
    connection = await dbPool.getConnection();
    console.log("Berhasil terhubung ke database Railway...");

    // 0. Update struktur tabel seats (tambah kolom is_booked jika belum ada)
    console.log("Memastikan struktur tabel seats sudah benar...");
    // Kolom is_booked dan booked_at sudah dibuat via migration, skip ALTER TABLE
    console.log("Struktur tabel seats sudah up-to-date (via migration).");

    // 1. Ambil semua kereta dari database
    const [trains] = await connection.query("SELECT * FROM trains");
    console.log(`Ditemukan ${trains.length} data kereta. Memulai generate kursi...`);

    // 2. Bersihkan tabel kursi lama (agar tidak duplikat)
    await connection.query("DELETE FROM seats");
    console.log("Tabel 'seats' lama berhasil dibersihkan.");

    let totalSeatsGenerated = 0;
    const seatLayout = ['A', 'B', 'C', 'D']; // Kolom A, B, C, D
    const rows = 13; // 13 baris

    for (const train of trains) {
      let gerbongCount = 0;
      let gerbongPrefix = "Gerbong";

      // Logika jumlah gerbong sesuai kelas
      if (train.kelas.toLowerCase().includes("eksekutif")) {
        gerbongPrefix = "Eksekutif";
        gerbongCount = 4;
      } else if (train.kelas.toLowerCase().includes("ekonomi")) {
        gerbongPrefix = "Ekonomi";
        gerbongCount = 6;
      } else {
        gerbongPrefix = "Campuran";
        gerbongCount = 5;
      }

      let seatsToInsert = [];
      for (let g = 1; g <= gerbongCount; g++) {
        const gerbongName = `${gerbongPrefix} ${g}`;
        
        for (let r = 1; r <= rows; r++) {
          for (const col of seatLayout) {
            const seatNumber = `${col}${r}`;
            
            // Skip kursi kosong (baris 13 kolom C & D)
            if (r === 13 && (col === 'C' || col === 'D')) {
              continue;
            }
            
            // Format: (id_kereta, nama_gerbong, nomor_kursi, is_booked, booked_at)
            // Semua kursi default: is_booked = 0 (available)
            seatsToInsert.push([train.id_kereta, gerbongName, seatNumber, 0, null]);
          }
        }
      }

      // 3. Masukkan semua kursi ke database
      if (seatsToInsert.length > 0) {
        const query = `
          INSERT INTO seats (id_kereta, nama_gerbong, nomor_kursi, is_booked, booked_at) 
          VALUES ?
        `;
        await connection.query(query, [seatsToInsert]);
        
        console.log(`-> Berhasil generate ${seatsToInsert.length} kursi untuk ${train.nama_kereta} (${train.kelas})`);
        totalSeatsGenerated += seatsToInsert.length;
      }
    }

    console.log(`\n✅ SELESAI!`);
    console.log(`Total ${totalSeatsGenerated} kursi berhasil dimasukkan ke database.`);
    console.log(`Semua kursi memiliki status: is_booked = 0 (available)`);

  } catch (error) {
    console.error("❌ Gagal menjalankan seeder:", error);
  } finally {
    if (connection) await connection.release();
    await dbPool.end();
  }
}

// Jalankan fungsi seeder
generateAndInsertSeats();
