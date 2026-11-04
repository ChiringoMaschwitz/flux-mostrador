-- ═══════════════════════════════════════════════════════════════════════════
-- flux-mostrador · alpaso_fase1b_permisos
-- Supabase activa la seguridad por filas (RLS) en las tablas nuevas. Sin una regla,
-- el usuario de la app (alpaso_app) ve las tablas vacías aunque tengan datos.
-- Esto le da a alpaso_app acceso a las tablas del esquema alpaso (y a nada más).
-- Se puede correr más de una vez. (Ya incluido en alpaso_fase1a para instalaciones nuevas.)
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'alpaso' loop
    execute format('alter table alpaso.%I enable row level security', t);
    execute format('drop policy if exists alpaso_app_todo on alpaso.%I', t);
    execute format('create policy alpaso_app_todo on alpaso.%I for all to alpaso_app using (true) with check (true)', t);
  end loop;
end $$;
