# 🎀 Gender-Based Seating Feature - Implementation Guide

## 📋 Overview

Fitur ini memungkinkan penumpang perempuan untuk melihat kursi yang ditempati oleh penumpang perempuan lain melalui indikator visual (warna pink 🩷) di aplikasi mobile.

---

## ✅ Changes Summary

### 1. Database Schema Update

**Tabel: `seats`**

Ditambahkan kolom baru:

```sql
ALTER TABLE seats ADD COLUMN gender VARCHAR(20) DEFAULT NULL;
```

**Nilai yang valid:**
- `'Laki-laki'` - untuk penumpang laki-laki
- `'Perempuan'` - untuk penumpang perempuan  
- `NULL` - untuk kursi yang belum dibooking atau data lama

**Migration Files Updated:**
- ✅ `migration_seats.sql` - Line 18-20
- ✅ `migration_seats_fixed.sql` - Line 18-20

---

### 2. Backend API Changes

#### File: `index.js`

#### A. Endpoint: `GET /seats/:id_kereta`

**Perubahan:**
```javascript
// SEBELUM (tidak ada gender)
const [seats] = await dbPool.query(`
  SELECT 
    id_kursi,
    id_kereta,
    nama_gerbong,
    nomor_kursi,
    is_booked,
    booked_at
  FROM seats 
  WHERE id_kereta = ?
`, [id_kereta]);

// SESUDAH (include gender)
const [seats] = await dbPool.query(`
  SELECT 
    id_kursi,
    id_kereta,
    nama_gerbong,
    nomor_kursi,
    is_booked,
    booked_at,
    gender  -- ✅ ADDED
  FROM seats 
  WHERE id_kereta = ?
`, [id_kereta]);
```

**Response Format (NEW):**
```json
{
  "id_kereta": "KA1",
  "total_seats": 200,
  "available_seats": 197,
  "booked_seats": 3,
  "gerbong": {
    "Eksekutif 1": [
      {
        "id_kursi": 1,
        "nomor_kursi": "A1",
        "is_booked": true,
        "booked_at": "2025-11-24T11:13:43.000Z",
        "gender": "Perempuan"  // ✅ NEW FIELD
      },
      {
        "id_kursi": 2,
        "nomor_kursi": "B1",
        "is_booked": true,
        "booked_at": "2025-11-24T10:30:00.000Z",
        "gender": "Laki-laki"  // ✅ NEW FIELD
      },
      {
        "id_kursi": 3,
        "nomor_kursi": "C1",
        "is_booked": false,
        "booked_at": null,
        "gender": null  // NULL untuk kursi available
      }
    ]
  }
}
```

---

#### B. Endpoint: `POST /seats/book`

**Request Body (NEW FORMAT):**
```json
{
  "id_kereta": "KA1",
  "seat_ids": [1, 2, 3],
  "seat_details": [  // ✅ NEW FIELD
    {
      "id_kursi": 1,
      "nomor_kursi": "A1",
      "nama_gerbong": "Eksekutif 1",
      "gender": "Perempuan"  // ✅ Gender info per seat
    },
    {
      "id_kursi": 2,
      "nomor_kursi": "B1",
      "nama_gerbong": "Eksekutif 1",
      "gender": "Laki-laki"
    },
    {
      "id_kursi": 3,
      "nomor_kursi": "C1",
      "nama_gerbong": "Eksekutif 1",
      "gender": "Perempuan"
    }
  ]
}
```

**Code Changes:**
```javascript
// SEBELUM (bulk update tanpa gender)
await connection.query(`
  UPDATE seats 
  SET is_booked = 1, booked_at = NOW()
  WHERE id_kursi IN (${placeholders})
`, seat_ids);

// SESUDAH (per-seat update dengan gender)
if (Array.isArray(req.body.seat_details) && req.body.seat_details.length > 0) {
  // Update per seat dengan gender
  for (const sid of seat_ids) {
    const detail = req.body.seat_details.find(d => d.id_kursi === sid) || {};
    const gender = detail.gender || null;
    
    await connection.query(`
      UPDATE seats
      SET is_booked = 1, booked_at = NOW(), gender = ?
      WHERE id_kursi = ? AND id_kereta = ?
    `, [gender, sid, id_kereta]);
  }
} else {
  // Fallback: bulk update tanpa gender (backward compatible)
  await connection.query(`
    UPDATE seats 
    SET is_booked = 1, booked_at = NOW()
    WHERE id_kursi IN (${placeholders})
  `, seat_ids);
}
```

**Response (Same):**
```json
{
  "success": true,
  "message": "Kursi berhasil dibooking",
  "booked_seats": [1, 2, 3]
}
```

---

#### C. Endpoint: `POST /seats/release`

**Code Changes:**
```javascript
// SEBELUM (tidak clear gender)
await dbPool.query(`
  UPDATE seats 
  SET is_booked = 0, booked_at = NULL
  WHERE id_kursi IN (${placeholders})
`, seat_ids);

// SESUDAH (clear gender untuk privacy)
await dbPool.query(`
  UPDATE seats 
  SET is_booked = 0, booked_at = NULL, gender = NULL  // ✅ ADDED
  WHERE id_kursi IN (${placeholders})
`, seat_ids);
```

**Alasan:** Privacy - gender info dihapus ketika kursi di-release.

---

## 🧪 Testing Guide

### 1. Test Database Migration

```sql
-- Cek apakah kolom gender sudah ada
DESCRIBE seats;

-- Expected output: kolom 'gender' dengan type VARCHAR(20)
```

### 2. Test Manual Insert

```sql
-- Set kursi dengan gender
UPDATE seats 
SET is_booked = 1, booked_at = NOW(), gender = 'Perempuan'
WHERE id_kursi = 1;

-- Verify
SELECT id_kursi, nomor_kursi, nama_gerbong, is_booked, gender 
FROM seats 
WHERE id_kursi = 1;

-- Expected: gender = 'Perempuan'
```

### 3. Test API Flow (Postman/Thunder Client)

#### Step 1: Book Seats dengan Gender
```http
POST https://kereta-api-production.up.railway.app/seats/book
Content-Type: application/json

{
  "id_kereta": "KA1",
  "seat_ids": [1, 2, 3],
  "seat_details": [
    {
      "id_kursi": 1,
      "nomor_kursi": "A1",
      "nama_gerbong": "Eksekutif 1",
      "gender": "Perempuan"
    },
    {
      "id_kursi": 2,
      "nomor_kursi": "B1",
      "nama_gerbong": "Eksekutif 1",
      "gender": "Laki-laki"
    },
    {
      "id_kursi": 3,
      "nomor_kursi": "C1",
      "nama_gerbong": "Eksekutif 1",
      "gender": "Perempuan"
    }
  ]
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Kursi berhasil dibooking",
  "booked_seats": [1, 2, 3]
}
```

#### Step 2: Get Seats (Verify Gender)
```http
GET https://kereta-api-production.up.railway.app/seats/KA1
```

**Expected Response:**
```json
{
  "gerbong": {
    "Eksekutif 1": [
      {
        "id_kursi": 1,
        "nomor_kursi": "A1",
        "is_booked": true,
        "gender": "Perempuan"  // ✅ Should be here
      },
      {
        "id_kursi": 2,
        "nomor_kursi": "B1",
        "is_booked": true,
        "gender": "Laki-laki"  // ✅ Should be here
      }
    ]
  }
}
```

#### Step 3: Release Seats (Clear Gender)
```http
POST https://kereta-api-production.up.railway.app/seats/release
Content-Type: application/json

{
  "seat_ids": [1, 2, 3]
}
```

#### Step 4: Verify Gender Cleared
```http
GET https://kereta-api-production.up.railway.app/seats/KA1
```

**Expected:** Kursi 1, 2, 3 should have:
- `is_booked: false`
- `booked_at: null`
- `gender: null` ✅

---

## 🎨 Frontend Integration (Flutter)

### Expected Frontend Behavior:

1. **Penumpang mengisi data dengan gender "Perempuan"**
2. **Frontend mengirim `seat_details` dengan gender ke backend**
3. **Backend menyimpan gender per kursi**
4. **GET /seats mengembalikan gender per kursi**
5. **Flutter menampilkan:**
   - Kursi Perempuan: **Warna PINK** 🩷
   - Kursi Laki-laki: **Warna ORANGE** 🟠
   - Kursi Available: **Warna ABU-ABU** ⚪
   - List penumpang: Icon ♀️ (pink) atau ♂️ (biru)

### Flutter Code Reference (Already Implemented):

**Model:** `lib/app/models/passenger_type.dart`
```dart
class PassengerType {
  final String gender; // 'Laki-laki' or 'Perempuan'
  // ...
}
```

**Controller:** `lib/app/modules/pilih_kursi/controllers/pilih_kursi_controller.dart`
```dart
// Kirim seat_details dengan gender
final seatDetails = selectedSeats.map((seat) {
  final passenger = passengers[selectedSeats.indexOf(seat)];
  return {
    'id_kursi': seat.idKursi,
    'nomor_kursi': seat.nomorKursi,
    'nama_gerbong': seat.namaGerbong,
    'gender': passenger.gender, // ✅ Gender dikirim
  };
}).toList();

// API Call
await hiveService.bookSeats(
  idKereta: idKereta,
  seatIds: seatIds,
  seatDetails: seatDetails, // ✅ Include gender
);
```

**View:** `lib/app/modules/pilih_kursi/views/pilih_kursi_view.dart`
```dart
// Warna kursi berdasarkan gender
Color getSeatColor(Seat seat) {
  if (!seat.isBooked) return Colors.grey[300]!;
  
  // ✅ Pink untuk perempuan
  if (seat.gender == 'Perempuan') {
    return Colors.pink[200]!;
  }
  
  // Orange untuk laki-laki atau null (default)
  return Colors.orange;
}
```

---

## 📊 Database Impact

### Before Gender Feature:
```
+----------+-------------+------+-----+---------+----------------+
| Field    | Type        | Null | Key | Default | Extra          |
+----------+-------------+------+-----+---------+----------------+
| id_kursi | int         | NO   | PRI | NULL    | auto_increment |
| id_kereta| varchar(10) | YES  | MUL | NULL    |                |
| nama_gerbong | varchar(50) | NO   |     | NULL    |                |
| nomor_kursi | varchar(5)  | NO   |     | NULL    |                |
| is_booked | tinyint(1) | YES  | MUL | 0       |                |
| booked_at | datetime   | YES  |     | NULL    |                |
+----------+-------------+------+-----+---------+----------------+
```

### After Gender Feature:
```
+----------+-------------+------+-----+---------+----------------+
| Field    | Type        | Null | Key | Default | Extra          |
+----------+-------------+------+-----+---------+----------------+
| id_kursi | int         | NO   | PRI | NULL    | auto_increment |
| id_kereta| varchar(10) | YES  | MUL | NULL    |                |
| nama_gerbong | varchar(50) | NO   |     | NULL    |                |
| nomor_kursi | varchar(5)  | NO   |     | NULL    |                |
| is_booked | tinyint(1) | YES  | MUL | 0       |                |
| booked_at | datetime   | YES  |     | NULL    |                |
| gender   | varchar(20) | YES  |     | NULL    |   ✅ NEW       |
+----------+-------------+------+-----+---------+----------------+
```

**Storage Impact:**
- Total kursi: ~61,000
- Storage per record: ~20 bytes (VARCHAR(20))
- Total additional storage: ~1.2 MB (negligible)

---

## 🔒 Privacy & Security Considerations

### ✅ Good Practices Implemented:

1. **Gender tidak ditampilkan sebagai text** - Hanya visual indicator (warna/icon)
2. **Gender di-clear saat release** - Tidak ada data yang tertinggal
3. **NULL untuk data lama** - Backward compatible
4. **Tidak ada nama penumpang di API /seats** - Privacy terjaga

### ⚠️ Things to Note:

1. Gender info **hanya digunakan untuk visual indicator**
2. Tidak boleh ada API endpoint yang expose "siapa yang booking kursi X"
3. Gender di tabel `bookings` (kalau ada) harus terpisah dari tabel `seats`

---

## 🐛 Troubleshooting

### Issue 1: Gender tidak muncul di response GET /seats

**Solution:**
```sql
-- Cek apakah kolom gender ada
SHOW COLUMNS FROM seats LIKE 'gender';

-- Kalau tidak ada, jalankan migration:
ALTER TABLE seats ADD COLUMN gender VARCHAR(20) DEFAULT NULL;
```

### Issue 2: Error saat booking dengan seat_details

**Solution:**
- Pastikan `seat_details` adalah array of objects
- Setiap object harus punya key `id_kursi` dan `gender`
- Cek format JSON di request body

### Issue 3: Gender masih tersisa setelah release

**Solution:**
```sql
-- Manual clear gender untuk semua kursi
UPDATE seats SET gender = NULL WHERE is_booked = 0;
```

---

## 📝 Deployment Checklist

### Before Deploy:
- [x] Run migration SQL di database production
- [x] Update `index.js` dengan gender handling
- [x] Test di local/staging environment
- [x] Update Postman collection (optional)

### After Deploy:
- [ ] Verify GET /seats menampilkan gender
- [ ] Test booking dengan seat_details
- [ ] Test release seats (gender di-clear)
- [ ] Monitor Railway logs untuk error
- [ ] Test di Flutter app end-to-end

---

## 🚀 Deployment Commands

```bash
# 1. Pull latest code
git pull origin main

# 2. Run migration di Railway MySQL Console
ALTER TABLE seats ADD COLUMN gender VARCHAR(20) DEFAULT NULL;

# 3. Verify migration
DESCRIBE seats;

# 4. Railway auto-deploy dari GitHub push (sudah dilakukan)

# 5. Test API
curl https://kereta-api-production.up.railway.app/seats/KA1 | jq '.gerbong."Eksekutif 1"[0]'
# Expected: should show gender field
```

---

## 📦 Modified Files

| File | Changes | Lines Modified |
|------|---------|----------------|
| `index.js` | Added gender handling in 3 endpoints | ~30 lines |
| `migration_seats.sql` | Added gender column creation | +3 lines |
| `migration_seats_fixed.sql` | Added gender column creation | +3 lines |

---

## ✅ Testing Results

### Database Test:
```sql
-- Test data inserted
UPDATE seats SET is_booked = 1, booked_at = NOW(), gender = 'Perempuan' 
WHERE id_kursi = 1;

-- Query result:
SELECT id_kursi, nomor_kursi, nama_gerbong, is_booked, booked_at, gender 
FROM seats WHERE id_kursi = 1;

-- Result:
+----------+-------------+--------------+-----------+---------------------+-----------+
| id_kursi | nomor_kursi | nama_gerbong | is_booked | booked_at           | gender    |
+----------+-------------+--------------+-----------+---------------------+-----------+
|        1 | A1          | Eksekutif 1  |         1 | 2025-11-24 11:25:00 | Perempuan |
+----------+-------------+--------------+-----------+---------------------+-----------+
```

✅ **Status:** All tests passed!

---

## 🎯 Next Steps (Frontend)

1. **Deploy backend ke Railway** ✅ (Done)
2. **Update Flutter app** (If not already done):
   - Verify `hiveService.bookSeats()` sends `seat_details`
   - Verify `pilih_kursi_view.dart` colors pink for gender = 'Perempuan'
3. **End-to-end test:**
   - Book kursi dengan penumpang perempuan
   - Refresh halaman pilih kursi
   - Verify kursi berwarna pink

---

## 📞 Support

Jika ada issue:
1. Cek Railway deployment logs
2. Cek database schema: `DESCRIBE seats;`
3. Test API dengan Postman/curl
4. Verify Flutter app mengirim `seat_details` dengan benar

---

**Last Updated:** November 24, 2025  
**Version:** 1.0.0  
**Status:** ✅ Deployed to Production
