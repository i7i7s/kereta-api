# 📱 Flutter Integration Guide - Date-Based Booking System

## 🎯 Overview

Backend sekarang sudah support **date-based booking**, artinya kursi yang sama bisa di-book untuk tanggal keberangkatan yang berbeda. Flutter app perlu update untuk mengirim parameter `tanggal_keberangkatan` di setiap API call.

---

## ✅ Backend Changes Summary

### Database:
- ✅ Kolom `is_booked`, `booked_at`, `gender` **dihapus** dari tabel `seats`
- ✅ Kolom `tanggal_keberangkatan` **ditambah** ke tabel `bookings`
- ✅ Kolom `gender` **ditambah** ke tabel `bookings`
- ✅ Tabel `seats` sekarang pure master data (tidak ada status booking)
- ✅ Tabel `bookings` menyimpan semua transaksi booking dengan tanggal

### API Endpoints:
- ✅ `GET /search` - Accept query param `?date=YYYY-MM-DD`
- ✅ `GET /seats/:id` - Accept query param `?date=YYYY-MM-DD`
- ✅ `POST /seats/book` - **Require** `tanggal_keberangkatan` in body
- ✅ `POST /seats/release` - **Require** `tanggal_keberangkatan` in body
- ✅ `POST /bookings/confirm` - **Require** `tanggal_keberangkatan` in body

---

## 📋 Required Changes in Flutter

### 1. **Add Date Picker to Search Screen** (HIGH PRIORITY)

**File:** `lib/app/modules/search/views/search_view.dart`

**Changes:**
```dart
class SearchController extends GetxController {
  // Tambah state untuk tanggal
  final selectedDate = DateTime.now().obs;
  
  // Method untuk pilih tanggal
  Future<void> selectDate(BuildContext context) async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: selectedDate.value,
      firstDate: DateTime.now(), // Tidak bisa pilih tanggal lampau
      lastDate: DateTime.now().add(Duration(days: 90)), // Max 90 hari ke depan
    );
    if (picked != null && picked != selectedDate.value) {
      selectedDate.value = picked;
      // Auto search ulang dengan tanggal baru
      searchTrains();
    }
  }
}
```

**UI Changes:**
```dart
// Tambah date picker button
ElevatedButton.icon(
  onPressed: () => controller.selectDate(context),
  icon: Icon(Icons.calendar_today),
  label: Obx(() => Text(
    DateFormat('EEE, dd MMM yyyy').format(controller.selectedDate.value)
  )),
)
```

---

### 2. **Update HiveService API Calls** (CRITICAL)

**File:** `lib/app/services/hive_service.dart`

#### A. Update `searchTrains()` Method

**BEFORE:**
```dart
Future<List<Train>> searchTrains(String from, String to) async {
  final response = await http.get(
    Uri.parse('$baseUrl/search?from=$from&to=$to'),
  );
  // ...
}
```

**AFTER:**
```dart
Future<List<Train>> searchTrains(
  String from, 
  String to, 
  {DateTime? tanggalKeberangkatan} // ✅ Add date parameter
) async {
  // Default ke hari ini jika tidak disediakan
  final date = tanggalKeberangkatan ?? DateTime.now();
  final dateString = DateFormat('yyyy-MM-dd').format(date);
  
  final response = await http.get(
    Uri.parse('$baseUrl/search?from=$from&to=$to&date=$dateString'), // ✅ Add date param
  );
  // ...
}
```

---

#### B. Update `getAvailableSeats()` Method

**BEFORE:**
```dart
Future<Map<String, dynamic>> getAvailableSeats(String idKereta) async {
  final response = await http.get(
    Uri.parse('$baseUrl/seats/$idKereta'),
  );
  // ...
}
```

**AFTER:**
```dart
Future<Map<String, dynamic>> getAvailableSeats(
  String idKereta,
  {required DateTime tanggalKeberangkatan} // ✅ Required date
) async {
  final dateString = DateFormat('yyyy-MM-dd').format(tanggalKeberangkatan);
  
  final response = await http.get(
    Uri.parse('$baseUrl/seats/$idKereta?date=$dateString'), // ✅ Add date query param
  );
  // ...
}
```

---

#### C. Update `bookSeats()` Method

**BEFORE:**
```dart
Future<bool> bookSeats({
  required String idKereta,
  required List<int> seatIds,
  List<Map<String, dynamic>>? seatDetails,
}) async {
  final response = await http.post(
    Uri.parse('$baseUrl/seats/book'),
    headers: {'Content-Type': 'application/json'},
    body: json.encode({
      'id_kereta': idKereta,
      'seat_ids': seatIds,
      'seat_details': seatDetails,
    }),
  );
  // ...
}
```

**AFTER:**
```dart
Future<bool> bookSeats({
  required String idKereta,
  required DateTime tanggalKeberangkatan, // ✅ Required date
  required List<int> seatIds,
  List<Map<String, dynamic>>? seatDetails,
}) async {
  final dateString = DateFormat('yyyy-MM-dd').format(tanggalKeberangkatan);
  
  final response = await http.post(
    Uri.parse('$baseUrl/seats/book'),
    headers: {'Content-Type': 'application/json'},
    body: json.encode({
      'id_kereta': idKereta,
      'tanggal_keberangkatan': dateString, // ✅ Add date
      'seat_ids': seatIds,
      'seat_details': seatDetails,
    }),
  );
  // ...
}
```

---

#### D. Update `releaseSeats()` Method

**BEFORE:**
```dart
Future<bool> releaseSeats(List<int> seatIds) async {
  final response = await http.post(
    Uri.parse('$baseUrl/seats/release'),
    headers: {'Content-Type': 'application/json'},
    body: json.encode({'seat_ids': seatIds}),
  );
  // ...
}
```

**AFTER:**
```dart
Future<bool> releaseSeats({
  required List<int> seatIds,
  required DateTime tanggalKeberangkatan, // ✅ Required date
}) async {
  final dateString = DateFormat('yyyy-MM-dd').format(tanggalKeberangkatan);
  
  final response = await http.post(
    Uri.parse('$baseUrl/seats/release'),
    headers: {'Content-Type': 'application/json'},
    body: json.encode({
      'seat_ids': seatIds,
      'tanggal_keberangkatan': dateString, // ✅ Add date
    }),
  );
  // ...
}
```

---

#### E. Update `confirmBooking()` Method

**BEFORE:**
```dart
Future<String?> confirmBooking({
  required String idKereta,
  required List<int> seatIds,
  required List<PassengerType> passengers,
  required double totalPrice,
}) async {
  final response = await http.post(
    Uri.parse('$baseUrl/bookings/confirm'),
    headers: {'Content-Type': 'application/json'},
    body: json.encode({
      'id_kereta': idKereta,
      'seat_ids': seatIds,
      'passenger_data': passengers.map((p) => {
        'nama': p.nama,
        'id_number': p.noKTP,
      }).toList(),
      'total_price': totalPrice,
    }),
  );
  // ...
}
```

**AFTER:**
```dart
Future<String?> confirmBooking({
  required String idKereta,
  required DateTime tanggalKeberangkatan, // ✅ Required date
  required List<int> seatIds,
  required List<PassengerType> passengers,
  required double totalPrice,
}) async {
  final dateString = DateFormat('yyyy-MM-dd').format(tanggalKeberangkatan);
  
  final response = await http.post(
    Uri.parse('$baseUrl/bookings/confirm'),
    headers: {'Content-Type': 'application/json'},
    body: json.encode({
      'id_kereta': idKereta,
      'tanggal_keberangkatan': dateString, // ✅ Add date
      'seat_ids': seatIds,
      'passenger_data': passengers.map((p) => {
        'nama': p.nama,
        'id_number': p.noKTP,
        'gender': p.gender, // Already included
      }).toList(),
      'total_price': totalPrice,
    }),
  );
  // ...
}
```

---

### 3. **Pass Date Through Controllers** (MEDIUM PRIORITY)

#### A. SearchController → ResultController

**File:** `lib/app/modules/search/controllers/search_controller.dart`

```dart
void searchTrains() async {
  // ...
  final trains = await hiveService.searchTrains(
    from.value,
    to.value,
    tanggalKeberangkatan: selectedDate.value, // ✅ Pass date
  );
  
  // Navigate dengan date sebagai argument
  Get.toNamed(
    Routes.RESULT,
    arguments: {
      'trains': trains,
      'from': from.value,
      'to': to.value,
      'tanggal_keberangkatan': selectedDate.value, // ✅ Pass to next screen
    },
  );
}
```

#### B. ResultController → PilihKursiController

**File:** `lib/app/modules/result/controllers/result_controller.dart`

```dart
void onTrainSelected(Train train) {
  Get.toNamed(
    Routes.PILIH_KURSI,
    arguments: {
      'train': train,
      'tanggal_keberangkatan': Get.arguments['tanggal_keberangkatan'], // ✅ Pass date
      'from': Get.arguments['from'],
      'to': Get.arguments['to'],
    },
  );
}
```

#### C. PilihKursiController - Update All API Calls

**File:** `lib/app/modules/pilih_kursi/controllers/pilih_kursi_controller.dart`

```dart
class PilihKursiController extends GetxController {
  late DateTime tanggalKeberangkatan; // ✅ Add property
  
  @override
  void onInit() {
    super.onInit();
    tanggalKeberangkatan = Get.arguments['tanggal_keberangkatan']; // ✅ Get from arguments
    loadSeats();
  }
  
  Future<void> loadSeats() async {
    final response = await hiveService.getAvailableSeats(
      train.idKereta,
      tanggalKeberangkatan: tanggalKeberangkatan, // ✅ Pass date
    );
    // ...
  }
  
  Future<void> bookSeats() async {
    final success = await hiveService.bookSeats(
      idKereta: train.idKereta,
      tanggalKeberangkatan: tanggalKeberangkatan, // ✅ Pass date
      seatIds: selectedSeats.map((s) => s.idKursi).toList(),
      seatDetails: seatDetails,
    );
    // ...
  }
  
  Future<void> confirmBooking() async {
    final kodeBooking = await hiveService.confirmBooking(
      idKereta: train.idKereta,
      tanggalKeberangkatan: tanggalKeberangkatan, // ✅ Pass date
      seatIds: selectedSeats.map((s) => s.idKursi).toList(),
      passengers: passengers,
      totalPrice: totalPrice,
    );
    // ...
  }
  
  @override
  void onClose() {
    // Auto release jika user keluar tanpa confirm
    if (selectedSeats.isNotEmpty) {
      hiveService.releaseSeats(
        seatIds: selectedSeats.map((s) => s.idKursi).toList(),
        tanggalKeberangkatan: tanggalKeberangkatan, // ✅ Pass date
      );
    }
    super.onClose();
  }
}
```

---

### 4. **Update UI to Show Date** (LOW PRIORITY but RECOMMENDED)

#### PilihKursi View - Show Tanggal Keberangkatan

**File:** `lib/app/modules/pilih_kursi/views/pilih_kursi_view.dart`

```dart
// Tambah info tanggal di header
Column(
  crossAxisAlignment: CrossAxisAlignment.start,
  children: [
    Text(
      controller.train.namaKereta,
      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
    ),
    SizedBox(height: 4),
    Row(
      children: [
        Icon(Icons.calendar_today, size: 16, color: Colors.grey),
        SizedBox(width: 4),
        Text(
          DateFormat('EEEE, dd MMM yyyy').format(controller.tanggalKeberangkatan),
          style: TextStyle(fontSize: 14, color: Colors.grey[700]),
        ),
      ],
    ),
  ],
)
```

---

## 🧪 Testing Checklist

### Phase 1: Basic Flow
- [ ] User bisa pilih tanggal di search screen
- [ ] API `/search` mengirim parameter `date`
- [ ] Result screen menampilkan kereta dengan sisa tiket yang benar untuk tanggal tersebut
- [ ] User bisa masuk ke pilih kursi
- [ ] API `/seats/:id` mengirim parameter `date` via query param
- [ ] Kursi yang ditampilkan sesuai dengan booking untuk tanggal tersebut

### Phase 2: Booking Flow
- [ ] User bisa book kursi (dengan tanggal)
- [ ] API `/seats/book` mengirim `tanggal_keberangkatan` di body
- [ ] Kursi yang di-book muncul sebagai booked (orange/pink)
- [ ] User bisa confirm booking
- [ ] API `/bookings/confirm` mengirim `tanggal_keberangkatan` di body
- [ ] Booking berhasil dengan kode booking

### Phase 3: Multi-Date Testing
- [ ] **Critical Test:** Book kursi A5 untuk tanggal 25 Nov
- [ ] Cek kursi A5 untuk tanggal 26 Nov → **Harus available!**
- [ ] Book kursi A5 untuk tanggal 26 Nov → **Harus sukses!**
- [ ] Cek kursi A5 tanggal 25 Nov → **Masih booked**
- [ ] Cek kursi A5 tanggal 26 Nov → **Sekarang booked**

---

## 🔧 Migration Steps (Recommended Order)

### Day 1: Backend Testing
1. ✅ Test backend API dengan Postman
2. ✅ Verify date-based booking works
3. ✅ Test multiple dates for same seat

### Day 2: Flutter Model & Service
1. Update `hive_service.dart` dengan semua method baru
2. Add `DateFormat` import: `import 'package:intl/intl.dart';`
3. Test API calls dengan hardcoded date

### Day 3: Flutter UI & Flow
1. Add date picker to search screen
2. Pass date through navigation arguments
3. Update all controllers

### Day 4: Testing & Refinement
1. End-to-end testing
2. Multi-date scenario testing
3. Bug fixes & polish

---

## 📦 Dependencies

Make sure these packages are in `pubspec.yaml`:

```yaml
dependencies:
  intl: ^0.18.0  # For DateFormat
  # ... existing dependencies
```

---

## ⚠️ Breaking Changes

### What Will Break:
1. ❌ Existing `bookSeats()` calls tanpa `tanggal_keberangkatan` → **Error 400**
2. ❌ Existing `releaseSeats()` calls tanpa `tanggal_keberangkatan` → **Error 400**
3. ❌ Existing `confirmBooking()` calls tanpa `tanggal_keberangkatan` → **Error 400**

### Backward Compatibility:
- ✅ `GET /search` tanpa param `date` → Default hari ini
- ✅ `GET /seats/:id` tanpa param `date` → Default hari ini
- ❌ POST endpoints **MUST** include `tanggal_keberangkatan` (no default)

---

## 🎯 Expected Behavior After Update

### Scenario 1: Same Seat, Different Dates
```
User A book Kursi A5 untuk 25 Nov 2025
User B book Kursi A5 untuk 26 Nov 2025
✅ BOTH succeed! (Different dates = different bookings)
```

### Scenario 2: Same Seat, Same Date
```
User A book Kursi A5 untuk 25 Nov 2025
User B coba book Kursi A5 untuk 25 Nov 2025
❌ User B DITOLAK (Conflict 409)
```

### Scenario 3: Search Different Dates
```
User search BD → GMR tanggal 25 Nov
Result: Sisa tiket 150

User search BD → GMR tanggal 26 Nov
Result: Sisa tiket 200 (karena beda hari, beda availability)
```

---

## 📞 Need Help?

If you encounter issues:
1. Check backend logs di Railway
2. Verify date format: `YYYY-MM-DD` (e.g., `2025-11-25`)
3. Check API response dengan Postman
4. Verify `tanggal_keberangkatan` di request body/query param

---

**Good Luck! 🚀**

**Estimasi waktu implementasi:** 1-2 hari untuk developer yang familiar dengan codebase.
