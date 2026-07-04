package migrations

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upSeedTKJMaterials, downSeedTKJMaterials)
}

type tkjMaterial struct {
	id    string
	title string
	desc  string
	html  string
}

var tkjMaterials = []tkjMaterial{
	{
		"tkj-mat-1", "Pengenalan Jaringan Komputer",
		"Konsep dasar jaringan komputer dan klasifikasinya.",
		`<h2>Apa itu Jaringan Komputer?</h2>
<p>Jaringan komputer adalah kumpulan dua atau lebih perangkat yang saling terhubung untuk berbagi data dan sumber daya (printer, internet, file).</p>
<h3>Manfaat Jaringan</h3>
<ul><li>Berbagi data & perangkat</li><li>Komunikasi (email, chat)</li><li>Akses internet bersama</li></ul>
<h3>Klasifikasi Berdasarkan Jangkauan</h3>
<ul>
<li><b>LAN</b> (Local Area Network) — satu gedung/ruang, mis. lab komputer.</li>
<li><b>MAN</b> (Metropolitan Area Network) — antar gedung dalam satu kota.</li>
<li><b>WAN</b> (Wide Area Network) — antar kota/negara, mis. internet.</li>
</ul>`,
	},
	{
		"tkj-mat-2", "Topologi Jaringan",
		"Bentuk susunan koneksi antar perangkat dalam jaringan.",
		`<h2>Topologi Jaringan</h2>
<p>Topologi adalah cara perangkat jaringan dihubungkan satu sama lain.</p>
<ul>
<li><b>Bus</b> — satu kabel utama, murah tapi rawan gangguan.</li>
<li><b>Star</b> — semua perangkat terhubung ke switch/hub pusat. Paling umum di sekolah.</li>
<li><b>Ring</b> — data berputar membentuk lingkaran.</li>
<li><b>Mesh</b> — setiap perangkat saling terhubung; sangat andal, boros kabel.</li>
</ul>
<p><i>Topologi star paling banyak dipakai karena mudah dikelola dan bila satu kabel putus tidak mengganggu yang lain.</i></p>`,
	},
	{
		"tkj-mat-3", "Model OSI & TCP/IP",
		"Tujuh lapisan OSI dan hubungannya dengan TCP/IP.",
		`<h2>Model OSI (7 Lapisan)</h2>
<ol>
<li>Physical — kabel, sinyal listrik</li>
<li>Data Link — MAC address, switch</li>
<li>Network — IP address, router</li>
<li>Transport — TCP/UDP, port</li>
<li>Session — mengatur sesi komunikasi</li>
<li>Presentation — enkripsi & format data</li>
<li>Application — HTTP, FTP, DNS</li>
</ol>
<p>Model <b>TCP/IP</b> menyederhanakannya menjadi 4 lapisan: Network Access, Internet, Transport, dan Application.</p>`,
	},
	{
		"tkj-mat-4", "Pengalamatan IP & Subnetting Dasar",
		"IPv4, kelas alamat, dan konsep subnet mask.",
		`<h2>Alamat IPv4</h2>
<p>IPv4 terdiri dari 32 bit yang ditulis dalam 4 oktet, mis. <code>192.168.1.10</code>.</p>
<h3>Kelas IP</h3>
<ul>
<li><b>Kelas A</b> — 1–126, subnet mask 255.0.0.0</li>
<li><b>Kelas B</b> — 128–191, subnet mask 255.255.0.0</li>
<li><b>Kelas C</b> — 192–223, subnet mask 255.255.255.0</li>
</ul>
<h3>Subnet Mask</h3>
<p>Subnet mask memisahkan bagian <b>network</b> dan <b>host</b> pada alamat IP. Contoh: pada <code>192.168.1.0/24</code>, 24 bit pertama adalah network, sisanya host (tersedia 254 host).</p>`,
	},
	{
		"tkj-mat-5", "Pengkabelan UTP (Straight & Cross)",
		"Urutan warna kabel UTP dan konektor RJ45.",
		`<h2>Kabel UTP & Konektor RJ45</h2>
<p>Kabel UTP kategori 5e/6 dipakai untuk jaringan LAN dengan konektor RJ45.</p>
<h3>Standar Urutan Warna T568B</h3>
<ol>
<li>Putih-Oranye</li><li>Oranye</li><li>Putih-Hijau</li><li>Biru</li>
<li>Putih-Biru</li><li>Hijau</li><li>Putih-Coklat</li><li>Coklat</li>
</ol>
<h3>Straight vs Cross</h3>
<ul>
<li><b>Straight</b> — kedua ujung sama (T568B–T568B). Untuk perangkat beda jenis: PC–switch.</li>
<li><b>Cross</b> — satu ujung T568A, ujung lain T568B. Untuk perangkat sejenis: PC–PC, switch–switch.</li>
</ul>`,
	},
	{
		"tkj-mat-6", "Perangkat Jaringan",
		"Fungsi hub, switch, router, dan access point.",
		`<h2>Perangkat Jaringan Utama</h2>
<ul>
<li><b>Hub</b> — meneruskan data ke semua port (broadcast). Sudah jarang dipakai.</li>
<li><b>Switch</b> — meneruskan data hanya ke port tujuan berdasarkan MAC address. Lebih efisien.</li>
<li><b>Router</b> — menghubungkan jaringan berbeda dan mengatur jalur (routing) antar jaringan/internet.</li>
<li><b>Access Point</b> — memancarkan jaringan nirkabel (Wi-Fi) agar perangkat dapat terhubung tanpa kabel.</li>
</ul>
<p>Di jaringan sekolah umumnya: Modem/Router → Switch → PC/Access Point.</p>`,
	},
}

func upSeedTKJMaterials(ctx context.Context, tx *sql.Tx) error {
	// Only seed if the "general" (Materi Umum) course and a teacher exist.
	var teacherID string
	err := tx.QueryRowContext(ctx,
		`SELECT id FROM users WHERE role IN ('admin','teacher') ORDER BY (role='admin') DESC, created_at ASC LIMIT 1`).Scan(&teacherID)
	if err == sql.ErrNoRows {
		return nil // no user to own the materials — skip
	}
	if err != nil {
		return fmt.Errorf("find teacher: %w", err)
	}
	var exists int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM courses WHERE id = 'general'`).Scan(&exists); err != nil {
		return fmt.Errorf("check general course: %w", err)
	}
	if exists == 0 {
		return nil
	}

	for i, m := range tkjMaterials {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO course_materials
			  (id, course_id, title, description, content_type, content_text, order_index, is_published, created_by, updated_by)
			VALUES (?, 'general', ?, ?, 'text', ?, ?, 1, ?, ?)
			ON CONFLICT(id) DO NOTHING`,
			m.id, m.title, m.desc, m.html, 100+i, teacherID, teacherID); err != nil {
			return fmt.Errorf("seed material %s: %w", m.id, err)
		}
	}
	return nil
}

func downSeedTKJMaterials(ctx context.Context, tx *sql.Tx) error {
	for _, m := range tkjMaterials {
		if _, err := tx.ExecContext(ctx, `DELETE FROM course_materials WHERE id = ?`, m.id); err != nil {
			return err
		}
	}
	return nil
}
