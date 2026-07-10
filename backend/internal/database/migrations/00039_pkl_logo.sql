-- +goose Up
-- Small compressed logo (data URL) for a PKL partner.
ALTER TABLE pkl_partners ADD COLUMN logo TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE pkl_partners DROP COLUMN logo;
