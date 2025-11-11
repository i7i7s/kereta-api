# 🧪 Testing Guide - Real-Time Seat Booking API

## ✅ Yang Sudah Selesai:

1. ✅ **Database Migration** - Tabel bookings, views, triggers, procedures sudah dibuat
2. ✅ **Seed Data** - 61,050 kursi berhasil dimasukkan ke database
3. ✅ **Backend API** - 6 endpoint sudah siap di `index.js`
4. ✅ **Deploy ke GitHub** - Code sudah di-push

---

## 🚀 Next Steps:

### 1. Deploy ke Railway

Railway biasanya otomatis deploy ketika ada push ke GitHub. Tapi kalau belum:

1. Buka Railway Dashboard: https://railway.app
2. Pilih project **kereta-api-production**
3. Cek tab **Deployments** - pastikan deployment berjalan
4. Tunggu sampai status **SUCCESS** ✅

### 2. Test Endpoint dengan Thunder Client / Postman

#### Test 1: Cari Kereta (Cek Sisa Tiket REAL)
```http
GET https://kereta-api-production.up.railway.app/search?from=BD&to=GMR
```

**Response yang diharapkan:**
```json
[
  {
    "id_kereta": "KA1",
    "nama_kereta": "Argo Bromo Anggrek",
    "kelas": "Eksekutif",
    "jadwalBerangkat": "06:00:00",
    "jadwalTiba": "10:30:00",
    "harga": 150000,
    "durasi": "4j 30m",
    "sisaTiket": 200  // ✅ REAL dari database!
  }
]
```

---

#### Test 2: Get Available Seats
```http
GET https://kereta-api-production.up.railway.app/seats/KA1
```

**Response yang diharapkan:**
```json
{
  "id_kereta": "KA1",
  "total_seats": 200,
  "available_seats": 200,
  "booked_seats": 0,
  "gerbong": {
    "Eksekutif 1": [
      {
        "id_kursi": 1,
        "nomor_kursi": "A1",
        "is_booked": false,
        "booked_at": null
      },
      {
        "id_kursi": 2,
        "nomor_kursi": "B1",
        "is_booked": false,
        "booked_at": null
      }
      // ... dst
    ],
    "Eksekutif 2": [...],
    "Eksekutif 3": [...],
    "Eksekutif 4": [...]
  }
}
```

---

#### Test 3: Book Seats (Temporary Hold)
```http
POST https://kereta-api-production.up.railway.app/seats/book
Content-Type: application/json

{
  "id_kereta": "KA1",
  "seat_ids": [1, 2, 3]
}
```

**Response Sukses:**
```json
{
  "success": true,
  "message": "Kursi berhasil dibooking",
  "booked_seats": [1, 2, 3]
}
```

**Response Gagal (kursi sudah di-book):**
```json
{
  "error": "Kursi sudah dibooking oleh pengguna lain",
  "booked_seats": ["A1", "B1"]
}
```

---

#### Test 4: Check Seats Lagi (Setelah Book)
```http
GET https://kereta-api-production.up.railway.app/seats/KA1
```

**Response (kursi 1,2,3 sudah is_booked = true):**
```json
{
  "id_kereta": "KA1",
  "total_seats": 200,
  "available_seats": 197,  // ✅ Berkurang!
  "booked_seats": 3,       // ✅ Ada yang booked!
  "gerbong": {
    "Eksekutif 1": [
      {
        "id_kursi": 1,
        "nomor_kursi": "A1",
        "is_booked": true,      // ✅ Sudah booked!
        "booked_at": "2024-11-11T08:30:00.000Z"
      }
      // ...
    ]
  }
}
```

---

#### Test 5: Release Seats (Jika Cancel/Timeout)
```http
POST https://kereta-api-production.up.railway.app/seats/release
Content-Type: application/json

{
  "seat_ids": [1, 2, 3]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Kursi berhasil direlease",
  "released_seats": [1, 2, 3]
}
```

---

#### Test 6: Confirm Booking (Setelah Bayar)
```http
POST https://kereta-api-production.up.railway.app/bookings/confirm
Content-Type: application/json

{
  "id_kereta": "KA1",
  "seat_ids": [1, 2, 3],
  "total_price": 450000,
  "passenger_data": [
    {
      "nama": "John Doe",
      "id_number": "3201234567890001"
    },
    {
      "nama": "Jane Doe",
      "id_number": "3201234567890002"
    },
    {
      "nama": "Baby Doe",
      "id_number": "3201234567890003"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Booking berhasil dikonfirmasi",
  "kode_booking": "FK1731321456ABC12"
}
```

---

#### Test 7: Get Booking History
```http
GET https://kereta-api-production.up.railway.app/bookings/history/FK1731321456ABC12
```

**Response:**
```json
{
  "kode_booking": "FK1731321456ABC12",
  "bookings": [
    {
      "id_booking": 1,
      "id_kereta": "KA1",
      "id_kursi": 1,
      "kode_booking": "FK1731321456ABC12",
      "nama_penumpang": "John Doe",
      "id_number": "3201234567890001",
      "total_harga": "150000.00",
      "status_pembayaran": "paid",
      "created_at": "2024-11-11T08:30:00.000Z",
      "nomor_kursi": "A1",
      "nama_gerbong": "Eksekutif 1",
      "nama_kereta": "Argo Bromo Anggrek",
      "kelas": "Eksekutif"
    }
    // ... kursi 2 dan 3
  ]
}
```

---

## 📊 Monitoring Database

### Check Ketersediaan Kursi per Kereta:
```sql
SELECT * FROM v_seat_availability 
WHERE id_kereta = 'KA1';
```

### Check Booking History:
```sql
SELECT * FROM v_booking_details 
ORDER BY created_at DESC 
LIMIT 10;
```

### Check Kursi yang Ter-hold tapi Belum Confirmed:
```sql
SELECT 
  s.*, 
  TIMESTAMPDIFF(MINUTE, s.booked_at, NOW()) as minutes_held
FROM seats s
LEFT JOIN bookings b ON s.id_kursi = b.id_kursi AND b.status_pembayaran = 'paid'
WHERE s.is_booked = 1 AND b.id_booking IS NULL;
```

### Manual Release Expired Seats:
```sql
CALL release_expired_seats();
```

---

## 🔄 Flow Booking yang Benar:

1. **User pilih kereta** → Call `/search`
2. **User pilih kursi** → Call `/seats/:id_kereta` (tampilkan seat map)
3. **User konfirmasi pilihan** → Call `/seats/book` (hold kursi 15 menit)
4. **User isi data & bayar** → Call `/bookings/confirm` (permanent booking)
5. **User dapat kode booking** → Call `/bookings/history/:kode` (lihat detail)

**Jika gagal bayar/timeout:**
- Call `/seats/release` untuk lepas hold
- ATAU tunggu auto-release setelah 15 menit

---

## 🐛 Troubleshooting:

### Error: "Column 'is_booked' doesn't exist"
**Solution:** Jalankan migration lagi atau cek struktur tabel:
```sql
DESCRIBE seats;
```

### Error: "Table 'bookings' doesn't exist"
**Solution:** Jalankan migration_seats_fixed.sql

### Kursi tidak auto-release
**Solution:** 
```sql
SET GLOBAL event_scheduler = ON;
SHOW EVENTS;
```

---

## ✅ Checklist Testing:

- [ ] Deployment Railway berhasil
- [ ] Endpoint `/search` menampilkan sisaTiket real
- [ ] Endpoint `/seats/:id` menampilkan seat map
- [ ] Booking kursi berhasil (is_booked berubah jadi 1)
- [ ] Booking kursi yang sama ditolak (conflict 409)
- [ ] Release kursi berhasil (is_booked kembali 0)
- [ ] Confirm booking berhasil (masuk tabel bookings)
- [ ] Get history booking menampilkan data lengkap
- [ ] Trigger after_booking_insert bekerja
- [ ] View v_seat_availability update real-time

---

**Good Luck Testing! 🚀**
