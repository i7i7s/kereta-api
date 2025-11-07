// 1. Impor library
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors'); 
const app = express();

// 2. Aktifkan CORS
app.use(cors());

// 3. Hubungkan ke Database Railway (Otomatis)
// Menggunakan hostname INTERNAL yang paling andal dan port default 3306
const dbPool = mysql.createPool({
  host: 'mysql.railway.internal', // <-- HOSTNAME INTERNAL PALING ANDAL
  port: 3306, // <-- PORT INTERNAL
  user: 'root',
  password: 'SKFYICRESSqYSlMWlNYMGtAZrKMCHiVc', // Password Anda
  database: 'railway' // Nama database Anda
});

// 4. Endpoint API (yang akan dipanggil Flutter)
app.get('/search', async (req, res) => {
  const { from, to } = req.query; 

  if (!from || !to) {
    return res.status(400).json({ error: "Parameter 'from' dan 'to' wajib disi." });
  }

  // Query "Final Boss" v1.0
  const sqlQuery = `
    SELECT 
      t.id_kereta,
      t.nama_kereta, 
      t.kelas,
      asal.waktu_berangkat AS jadwalBerangkat,
      tujuan.waktu_tiba AS jadwalTiba,
      (tujuan.harga_dari_awal - asal.harga_dari_awal) AS harga
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
    
    // Kita tambahkan data "palsu" (durasi & sisaTiket)
    const finalResults = results.map(train => ({
      ...train,
      durasi: "5j 30m", 
      sisaTiket: Math.floor(Math.random() * 50) + 1 
    }));

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