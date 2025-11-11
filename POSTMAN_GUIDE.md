# 📮 Postman Collection Guide - FritzLine Railway API

## 📥 Cara Import ke Postman

### Step 1: Import Collection
1. Buka **Postman**
2. Klik **Import** (pojok kiri atas)
3. Drag & drop file: `FritzLine_API_Collection.postman_collection.json`
4. Atau klik **Choose Files** dan pilih file tersebut
5. Klik **Import**

### Step 2: Import Environment (Optional tapi Recommended)
1. Klik **Import** lagi
2. Drag & drop file: `FritzLine_Production.postman_environment.json`
3. Klik **Import**
4. Pilih environment **"FritzLine Railway - Production"** di dropdown pojok kanan atas

---

## 🧪 Testing Flow (Urutan yang Benar)

### 🔹 Test Flow 1: Cek Ketersediaan Tiket

```
1. Search Trains (With Real Seat Availability)
   → Lihat sisaTiket untuk setiap kereta
   → Catat id_kereta yang ingin di-test (contoh: KA1)

2. Get Available Seats by Train ID
   → Lihat detail kursi per gerbong
   → Catat id_kursi yang ingin di-book (contoh: 1, 2, 3)
```

---

### 🔹 Test Flow 2: Booking Process (Happy Path)

```
3. Book Seats (Temporary Hold)
   → Book kursi dengan seat_ids [1, 2, 3]
   → Harusnya return: "success": true

4. Check Seats After Booking
   → Cek apakah kursi 1,2,3 sudah is_booked = true
   → available_seats harusnya berkurang

5. Confirm Booking (After Payment)
   → Konfirmasi booking dengan data penumpang
   → Catat kode_booking yang di-return (contoh: FK1731254789ABC12)

6. Get Booking History
   → Ganti parameter kode_booking dengan kode dari step 5
   → Lihat detail booking lengkap
```

---

### 🔹 Test Flow 3: Error Handling

```
9. Try Book Already Booked Seats (Error Test)
   → Book kursi yang sama (1, 2, 3) lagi
   → Harusnya return error 409: "Kursi sudah dibooking"

10. Book Different Seats (Success Test)
    → Book kursi lain [4, 5, 6]
    → Harusnya sukses
```

---

### 🔹 Test Flow 4: Cancel Booking

```
5. Release Seats (Cancel/Timeout)
   → Release kursi [4, 5, 6]
   → Harusnya return: "success": true

4. Check Seats After Booking
   → Cek apakah kursi 4,5,6 kembali is_booked = false
   → available_seats harusnya bertambah lagi
```

---

## 📋 List Request di Collection

| # | Request Name | Method | Endpoint | Fungsi |
|---|-------------|--------|----------|--------|
| 1 | Search Trains | GET | `/search?from=BD&to=GMR` | Cari kereta + sisa tiket |
| 2 | Get Available Seats | GET | `/seats/KA1` | List kursi & status |
| 3 | Book Seats | POST | `/seats/book` | Hold kursi temporary |
| 4 | Check Seats After Booking | GET | `/seats/KA1` | Verifikasi status kursi |
| 5 | Release Seats | POST | `/seats/release` | Cancel hold kursi |
| 6 | Confirm Booking | POST | `/bookings/confirm` | Konfirmasi after payment |
| 7 | Get Booking History | GET | `/bookings/history/:kode` | Detail booking |
| 8 | Search Trains (YK-SB) | GET | `/search?from=YK&to=SB` | Test route lain |
| 9 | Try Book Booked Seats | POST | `/seats/book` | Test error handling |
| 10 | Book Different Seats | POST | `/seats/book` | Test booking kursi lain |

---

## 🎯 Expected Results

### ✅ Request #1 - Search Trains
```json
[
  {
    "id_kereta": "KA1",
    "nama_kereta": "Argo Bromo Anggrek",
    "kelas": "Eksekutif",
    "sisaTiket": 200  // ✅ REAL dari database
  }
]
```

### ✅ Request #2 - Get Available Seats
```json
{
  "id_kereta": "KA1",
  "total_seats": 200,
  "available_seats": 200,
  "booked_seats": 0,
  "gerbong": {
    "Eksekutif 1": [...]
  }
}
```

### ✅ Request #3 - Book Seats (SUCCESS)
```json
{
  "success": true,
  "message": "Kursi berhasil dibooking",
  "booked_seats": [1, 2, 3]
}
```

### ❌ Request #9 - Book Already Booked Seats (ERROR)
```json
{
  "error": "Kursi sudah dibooking oleh pengguna lain",
  "booked_seats": ["A1", "B1", "C1"]
}
```

### ✅ Request #6 - Confirm Booking
```json
{
  "success": true,
  "message": "Booking berhasil dikonfirmasi",
  "kode_booking": "FK1731321456ABC12"
}
```

---

## 🔧 Customization

### Ubah Base URL (Jika Perlu)
1. Klik **Environments** di sidebar kiri
2. Pilih **FritzLine Railway - Production**
3. Edit value `base_url` sesuai deployment Anda
4. Klik **Save**

### Ubah Train ID untuk Testing
Di setiap request, Anda bisa ganti:
- `KA1` → Train ID lain (contoh: `KA10`, `KA100`)
- `[1, 2, 3]` → Seat IDs lain (contoh: `[10, 11, 12]`)

### Ganti Station Codes
Untuk testing route berbeda:
- `from=BD&to=GMR` (Bandung → Gambir)
- `from=YK&to=SB` (Yogyakarta → Surabaya)
- `from=GMR&to=SB` (Gambir → Surabaya)

---

## 📊 Monitoring Real-Time

Setelah test, bisa cek di database:

```sql
-- Cek availability
SELECT * FROM v_seat_availability WHERE id_kereta = 'KA1';

-- Cek booking history
SELECT * FROM v_booking_details ORDER BY created_at DESC LIMIT 10;

-- Cek kursi yang ter-hold
SELECT s.*, TIMESTAMPDIFF(MINUTE, s.booked_at, NOW()) as minutes_held
FROM seats s
WHERE s.is_booked = 1 AND s.id_kereta = 'KA1';
```

---

## 🐛 Common Issues

### Issue: "Could not send request"
**Solution:** Cek Railway deployment masih running

### Issue: "404 Not Found"
**Solution:** Cek base_url di environment sudah benar

### Issue: "500 Internal Server Error"
**Solution:** Cek Railway logs untuk error detail

### Issue: Semua request "409 Conflict"
**Solution:** Release dulu kursi yang ter-hold:
```sql
UPDATE seats SET is_booked = 0, booked_at = NULL 
WHERE id_kereta = 'KA1' AND id_kursi IN (1,2,3);
```

---

## ✅ Testing Checklist

- [ ] Import collection berhasil
- [ ] Import environment berhasil
- [ ] Request #1 return sisaTiket real
- [ ] Request #2 return seat map lengkap
- [ ] Request #3 booking sukses
- [ ] Request #4 show kursi ter-book
- [ ] Request #5 release sukses
- [ ] Request #6 confirm booking sukses
- [ ] Request #7 return booking history
- [ ] Request #9 return error 409 (expected)
- [ ] Request #10 booking kursi lain sukses

---

**Happy Testing! 🚀**

Need help? Check Railway logs or database queries above.
