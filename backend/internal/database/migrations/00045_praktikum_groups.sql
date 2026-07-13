-- +goose Up
-- Praktikum = tugas kelompok. Kelompok + anggota + satu pengumpulan per kelompok
-- (nilai berlaku untuk semua anggota).
CREATE TABLE assignment_groups (
    id            TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    created_at    DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ag_assignment ON assignment_groups(assignment_id);

CREATE TABLE assignment_group_members (
    id         TEXT PRIMARY KEY,
    group_id   TEXT NOT NULL REFERENCES assignment_groups(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(group_id, student_id)
);
CREATE INDEX idx_agm_group   ON assignment_group_members(group_id);
CREATE INDEX idx_agm_student ON assignment_group_members(student_id);

CREATE TABLE assignment_group_submissions (
    id           TEXT PRIMARY KEY,
    group_id     TEXT NOT NULL UNIQUE REFERENCES assignment_groups(id) ON DELETE CASCADE,
    content      TEXT NOT NULL DEFAULT '',
    file_url     TEXT NOT NULL DEFAULT '',
    submitted_by TEXT REFERENCES users(id),
    submitted_at DATETIME,
    score        INTEGER,
    feedback     TEXT NOT NULL DEFAULT '',
    graded_at    DATETIME
);

-- +goose Down
DROP TABLE IF EXISTS assignment_group_submissions;
DROP INDEX IF EXISTS idx_agm_student;
DROP INDEX IF EXISTS idx_agm_group;
DROP TABLE IF EXISTS assignment_group_members;
DROP INDEX IF EXISTS idx_ag_assignment;
DROP TABLE IF EXISTS assignment_groups;
