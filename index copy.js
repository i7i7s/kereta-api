// 1. Impor library
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors'); 
const app = express();

// 2. Aktifkan CORS
app.use(cors());

// 3. Hubungkan ke Database Railway (Otomatis)
const dbPool = mysql.createPool({
  host: process.env.MYSQLHOST,
  port: process.env.MYSQLPORT,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE
});

// 4. Endpoint API (yang akan dipanggil Flutter)
app.get('/search', async (req, res) => {
  const { from, to } = req.query; 

  if (!from || !to) {
    return res.status(400).json({ error: "Parameter 'from' dan 'to' wajib diisi." });
  }

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
    
    const finalResults = results.map(train => {
      
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
      
      return {
        id_kereta: train.id_kereta,
        nama_kereta: train.nama_kereta,
        kelas: train.kelas,
        jadwalBerangkat: train.jadwalBerangkat,
        jadwalTiba: train.jadwalTiba,
        harga: finalPrice,
        durasi: `${jam}j ${menit}m`,
        sisaTiket: Math.floor(Math.random() * 50) + 1 // Masih palsu
      };
    });

    res.json(finalResults);

  } catch (error) {
    console.error("Database query error:", error);
    res.status(500).json({ error: "Database query failed" });
  }
});

// 5. Jalankan Server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server API FritzLine berjalan di port ${port}`);
});