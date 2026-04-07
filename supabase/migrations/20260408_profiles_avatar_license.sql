-- Driver profile fields for client UI: photo, licence categories (e.g. "B, D").
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS license_categories text;

COMMENT ON COLUMN public.profiles.avatar_url IS 'Public HTTPS URL for profile photo (e.g. Supabase Storage).';
COMMENT ON COLUMN public.profiles.license_categories IS 'Driver licence categories, e.g. B, D (comma-separated).';
