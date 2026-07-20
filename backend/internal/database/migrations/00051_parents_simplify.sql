-- +goose Up
-- Simplify the parent household to a single guardian: name + relationship +
-- phone + address. The older ayah/ibu/wali/pekerjaan columns are kept (unused)
-- and their data folded into the new nama_ortu / hubungan fields.
ALTER TABLE parents ADD COLUMN nama_ortu TEXT NOT NULL DEFAULT '';
ALTER TABLE parents ADD COLUMN hubungan  TEXT NOT NULL DEFAULT '';

UPDATE parents SET
  nama_ortu = CASE
    WHEN nama_ayah <> '' THEN nama_ayah
    WHEN nama_ibu  <> '' THEN nama_ibu
    ELSE nama_wali END,
  hubungan = CASE
    WHEN nama_ayah <> '' THEN 'Ayah'
    WHEN nama_ibu  <> '' THEN 'Ibu'
    WHEN hubungan_wali <> '' THEN hubungan_wali
    WHEN nama_wali <> '' THEN 'Wali'
    ELSE '' END;

-- +goose Down
ALTER TABLE parents DROP COLUMN hubungan;
ALTER TABLE parents DROP COLUMN nama_ortu;
