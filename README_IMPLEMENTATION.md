# 🚀 Implementasi Fitur Stok Kursi Real-Time
## FritzLine Railway Booking System

---

## 📋 Daftar Isi
1. [Setup Database](#setup-database)
2. [Update Backend API](#update-backend-api)
3. [Testing API](#testing-api)
4. [Next Steps - Flutter Integration](#next-steps)

---

## 1. Setup Database

### Step 1.1: Jalankan Migration SQL
```bash
# Di Railway MySQL, jalankan file migration_seats.sql
# Atau copy-paste isi file ke Railway MySQL Query Console
```

File `migration_seats.sql` akan:
- ✅ Menambahkan kolom `is_booked` dan `booked_at` ke tabel `seats`
- ✅ Membuat/update tabel `bookings` dengan struktur lengkap
- ✅ Membuat stored procedure untuk auto-release kursi expired
- ✅ Membuat event scheduler (auto-release setiap 5 menit)
- ✅ Membuat views untuk monitoring
- ✅ Membuat triggers untuk sync data

### Step 1.2: Jalankan Seed Script Baru
```bash
cd c:\Users\Daffa Alwafi\Documents\APIKERETA
node seed_updated.js
```

Output yang diharapkan:
```
Memulai script seeder kursi dengan fitur booking...
Berhasil terhubung ke database Railway...
Memastikan struktur tabel seats sudah benar...
Struktur tabel seats sudah up-to-date.
Ditemukan XX data kereta. Memulai generate kursi...
-> Berhasil generate 200 kursi untuk Argo Bromo Anggrek (Eksekutif)
-> Berhasil generate 312 kursi untuk Matarmaja (Ekonomi)
...
✅ SELESAI!
Total XXXX kursi berhasil dimasukkan ke database.
```

---

## 2. Update Backend API

### Step 2.1: Backup File Lama
```bash
cd c:\Users\Daffa Alwafi\Documents\APIKERETA
copy index.js index_backup.js
```

### Step 2.2: Replace dengan File Baru
```bash
# Replace isi index.js dengan isi dari index_updated.js
copy index_updated.js index.js
```

### Step 2.3: Deploy ke Railway
```bash
# Commit dan push ke Railway
git add .
git commit -m "feat: Add real-time seat booking system"
git push railway main
```

### Step 2.4: Verifikasi Deployment
Cek Railway Dashboard, pastikan deployment sukses dan tidak ada error.

---

## 3. Testing API

### Test 3.1: Cek Sisa Tiket (REAL dari Database)
```bash
GET https://kereta-api-production.up.railway.app/search?from=BD&to=GMR
```

Response sekarang menampilkan `sisaTiket` REAL:
```json
[
  {
    "id_kereta": 1,
    "nama_kereta": "Argo Bromo Anggrek",
    "kelas": "Eksekutif",
    "sisaTiket": 200,  // <-- Ini sekarang REAL dari database!
    ...
  }
]
```

### Test 3.2: Get Available Seats
```bash
GET https://kereta-api-production.up.railway.app/seats/1
```

Response:
```json
{
  "id_kereta": "1",
  "total_seats": 200,
  "available_seats": 200,
  "booked_seats": 0,
  "gerbong": {
    "Eksekutif 1": [
      { "id_kursi": 1, "nomor_kursi": "A1", "is_booked": false },
      { "id_kursi": 2, "nomor_kursi": "B1", "is_booked": false },
      ...
    ],
    "Eksekutif 2": [...],
    ...
  }
}
```

### Test 3.3: Book Seats (Temporary Hold)
```bash
POST https://kereta-api-production.up.railway.app/seats/book
Content-Type: application/json

{
  "id_kereta": 1,
  "seat_ids": [1, 2, 3]
}
```

Response sukses:
```json
{
  "success": true,
  "message": "Kursi berhasil dibooking",
  "booked_seats": [1, 2, 3]
}
```

Response jika kursi sudah di-book orang lain:
```json
{
  "error": "Kursi sudah dibooking oleh pengguna lain",
  "booked_seats": ["A1", "B1"]
}
```

### Test 3.4: Release Seats (Jika User Cancel/Timeout)
```bash
POST https://kereta-api-production.up.railway.app/seats/release
Content-Type: application/json

{
  "seat_ids": [1, 2, 3]
}
```

### Test 3.5: Confirm Booking (Setelah Pembayaran Sukses)
```bash
POST https://kereta-api-production.up.railway.app/bookings/confirm
Content-Type: application/json

{
  "id_kereta": 1,
  "seat_ids": [1, 2, 3],
  "total_price": 450000,
  "passenger_data": [
    {
      "nama": "John Doe",
      "id_number": "1234567890123456"
    },
    {
      "nama": "Jane Doe",
      "id_number": "9876543210987654"
    },
    {
      "nama": "Baby Doe",
      "id_number": "5555555555555555"
    }
  ]
}
```

Response:
```json
{
  "success": true,
  "message": "Booking berhasil dikonfirmasi",
  "kode_booking": "FK1731254789ABC12"
}
```

### Test 3.6: Get Booking History
```bash
GET https://kereta-api-production.up.railway.app/bookings/history/FK1731254789ABC12
```

---

## 4. Next Steps - Flutter Integration

### Yang Perlu Dibuat di Flutter:

#### 4.1 Update `hive_service.dart`
Tambahkan method baru:
- `Future<Map<String, dynamic>> getAvailableSeats(String idKereta)`
- `Future<bool> bookSeats(String idKereta, List<int> seatIds)`
- `Future<bool> releaseSeats(List<int> seatIds)`
- `Future<String> confirmBooking(...)`

#### 4.2 Update `pilih_kursi_controller.dart`
- Ganti dummy data dengan API call ke backend
- Implementasi real-time seat checking
- Handle race condition (jika kursi sudah di-book orang lain)
- Implementasi timeout (15 menit auto-release)

#### 4.3 Update `pilih_kursi_view.dart`
- Tambahkan loading state saat fetch seats
- Tambahkan indikator kursi yang sedang di-hold
- Tambahkan countdown timer (15 menit)
- Handle error jika kursi sudah di-book

---

## 🔐 Fitur Keamanan yang Sudah Diimplementasikan

1. **Transaction Lock**: Menggunakan `FOR UPDATE` untuk mencegah race condition
2. **Automatic Release**: Kursi otomatis release setelah 15 menit jika tidak ada konfirmasi
3. **Validation**: Cek apakah kursi masih available sebelum booking
4. **Database Triggers**: Otomatis sync status kursi saat booking
5. **Event Scheduler**: Cleanup kursi expired setiap 5 menit

---

## 📊 Monitoring & Maintenance

### Query untuk Monitoring:
```sql
-- Lihat ketersediaan kursi per kereta
SELECT * FROM v_seat_availability;

-- Lihat booking history
SELECT * FROM v_booking_details ORDER BY created_at DESC LIMIT 50;

-- Cek kursi yang ter-hold tapi belum confirmed
SELECT s.*, TIMESTAMPDIFF(MINUTE, s.booked_at, NOW()) as minutes_held
FROM seats s
LEFT JOIN bookings b ON s.id_kursi = b.id_kursi AND b.status_pembayaran = 'paid'
WHERE s.is_booked = 1 AND b.id_booking IS NULL;

-- Manual release kursi expired
CALL release_expired_seats();
```

---

## 🎯 Kapasitas Kursi per Kelas

Berdasarkan seed script Anda:

| Kelas Kereta | Jumlah Gerbong | Kursi per Gerbong | Total Kursi |
|--------------|----------------|-------------------|-------------|
| Eksekutif    | 4              | 50 (13x4 - 2)     | 200         |
| Ekonomi      | 6              | 52 (13x4)         | 312         |
| Campuran     | 5              | 50-52             | 260         |

*Note: Baris 13 kolom C & D kosong (untuk toilet/ruang bagasi)*

---

## ⚠️ Important Notes

1. **Jangan lupa jalankan migration SQL terlebih dahulu!**
2. **Event Scheduler harus enabled di MySQL** (sudah ada di migration)
3. **Backup database sebelum testing** (safety first!)
4. **Test di environment development dulu** sebelum production
5. **Monitor log di Railway** untuk error tracking

---

## 🐛 Troubleshooting

### Problem: "Column 'is_booked' doesn't exist"
**Solution**: Jalankan migration SQL atau ALTER TABLE manual

### Problem: Kursi tidak auto-release
**Solution**: Cek event scheduler: `SHOW EVENTS;` dan `SET GLOBAL event_scheduler = ON;`

### Problem: Booking gagal terus
**Solution**: Cek log error di Railway, kemungkinan issue dengan transaction

---

## 📞 Support

Jika ada masalah atau pertanyaan:
1. Cek Railway logs
2. Test dengan Postman/Thunder Client
3. Cek MySQL error logs
4. Review transaction flow

---

**Good luck! 🚀**
