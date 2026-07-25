-- +goose Up
-- Applicant-submitted documents: a Google Drive link they paste back, and/or
-- files uploaded directly (stored as data URLs, streamed at /ppdb-doc).
ALTER TABLE ppdb_registrations ADD COLUMN doc_link TEXT NOT NULL DEFAULT '';

CREATE TABLE ppdb_documents (
    id              TEXT PRIMARY KEY,
    registration_id TEXT NOT NULL REFERENCES ppdb_registrations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL DEFAULT '',
    data            TEXT NOT NULL DEFAULT '', -- data URL (image/pdf)
    created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ppdb_docs_reg ON ppdb_documents(registration_id);

-- +goose Down
DROP TABLE IF EXISTS ppdb_documents;
ALTER TABLE ppdb_registrations DROP COLUMN doc_link;
