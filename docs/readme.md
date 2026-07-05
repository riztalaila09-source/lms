# LMS (Learning Management System)
LMS (Learning Management System) adalah aplikasi berbasis web yang dirancang untuk membantu proses pembelajaran secara digital. Sistem ini memudahkan guru dalam mengelola kelas, materi, tugas, penilaian, serta memantau aktivitas siswa dalam satu platform yang terintegrasi.

1. Untuk Referensi guideline development frontend, [Baca Ini](./frontend-devel-guideline.md).
2. Untuk Referensi Implementasi frontend, [Baca Ini](./frontend-implementation.md).
3. Untuk Brief Umum dari project, [Baca Ini](./general-brief.md)


## General Guideline Untuk Agent AI
1. Ketika perubahan project sudah besar, atau perubahan project sangat penting. Tolong commit dan push kode project terlebih dahulu.
2. check secara berkala di remote repository git. Jika ada perubahan tolong segera pull.





# Frontend Guideline

## 1. Komponen UI
- Seluruh komponen UI wajib menggunakan **Chakra UI**.
- Tidak diperbolehkan membuat komponen HTML manual jika sudah tersedia pada Chakra UI.

## 2. Tabs
- Seluruh halaman yang membutuhkan navigasi tab wajib menggunakan komponen **Tabs** dari Chakra UI.

## 3. Form
- Gunakan komponen Chakra UI seperti:
  - Input
  - Select
  - Textarea
  - Checkbox
  - Radio
  - Switch

## 4. Button
- Gunakan komponen `Button` dari Chakra UI.
- Warna tombol mengikuti tema aplikasi.

## 5. Modal
- Gunakan `Modal` atau `Dialog` dari Chakra UI.
- Hindari membuat popup secara manual.

## 6. Tabel
- Gunakan komponen `Table` Chakra UI.
- Seluruh data list wajib mendukung:
  - Pagination
  - Searching
  - Sorting (jika diperlukan)

## 7. Layout
- Menggunakan Sidebar sebagai navigasi utama.
- Menggunakan Navbar/Header di bagian atas.
- Sidebar mendukung **Collapsible Sidebar (Toggle Sidebar)**.

## 8. Loading
- Gunakan Spinner atau Skeleton dari Chakra UI.

## 9. Notifikasi
- Gunakan Toast dari Chakra UI untuk menampilkan notifikasi sukses maupun gagal.

## 10. Icon
- Gunakan React Icons atau Lucide React yang konsisten di seluruh aplikasi.

