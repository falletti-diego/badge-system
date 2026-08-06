-- 036_add_faceid_verified_to_checkins.sql
-- Finding #4 (2026-08-02): rende visibile quando un check-in NON ha avuto
-- attestazione biometrica (hardware assente o utente ha disabilitato il
-- toggle in Impostazioni). Non è un controllo di sicurezza enforced
-- server-side (il client potrebbe mentire, come is_offline prima di essere
-- derivato — qui però non è derivabile server-side, è un fatto del device),
-- è metadato di audit/dashboard, stesso ruolo di is_offline.
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS faceid_verified BOOLEAN NOT NULL DEFAULT false;
