-- This is an empty migration.
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;

ALTER TABLE "doctor_profiles"
ADD COLUMN "location" geography(Point, 4326);

CREATE INDEX "doctor_profiles_location_gist_idx"
ON "doctor_profiles"
USING GIST ("location");
