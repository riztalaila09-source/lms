-- +goose Up
-- Central access policy: capability keys DENIED to teachers globally
-- (e.g. "materi.edit", "materi.delete"). Empty table = everything allowed.
CREATE TABLE access_policy (
    key TEXT PRIMARY KEY
);

-- +goose Down
DROP TABLE IF EXISTS access_policy;
