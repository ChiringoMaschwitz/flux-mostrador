-- ═══════════════════════════════════════════════════════════════════════════
-- flux-mostrador · alpaso_fase1c_noche
-- Pedidos de noche por WhatsApp: delivery y retiro, miércoles a domingo de 19:30 a 24.
--  - horario propio del delivery y abrir / cerrar a mano
--  - zonas de delivery con su costo (se suma solo al pedido)
--  - el pedido guarda canal, entrega, zona, envío, datos del cliente y forma de pago
-- Se puede correr más de una vez. Correrlo DESPUÉS de alpaso_fase1a (y fase1b si se corrió aparte).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── horario del delivery ──
alter table alpaso.locales add column if not exists horario_delivery jsonb not null default '{}'::jsonb;
alter table alpaso.locales add column if not exists estado_manual_delivery text not null default 'auto';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'locales_estado_manual_delivery_check') then
    alter table alpaso.locales add constraint locales_estado_manual_delivery_check
      check (estado_manual_delivery in ('auto', 'abierto', 'cerrado'));
  end if;
end $$;

-- WhatsApp de la pizzería (con código de país, sin + ni espacios): para el botón del cliente
alter table alpaso.locales add column if not exists whatsapp text;
update alpaso.locales set whatsapp = '5491126091109' where id = 'PIZZERIA' and whatsapp is null;

-- miércoles (3) a domingo (0), de 19:30 a 24
update alpaso.locales
   set horario_delivery = '{"3":["19:30","24:00"],"4":["19:30","24:00"],"5":["19:30","24:00"],"6":["19:30","24:00"],"0":["19:30","24:00"]}'
 where id = 'PIZZERIA' and horario_delivery = '{}'::jsonb;

-- ── zonas de delivery ──
create table if not exists alpaso.zonas (
  id             serial primary key,
  local_id       text not null references alpaso.locales(id),
  nombre         text not null,
  costo          integer not null check (costo >= 0),
  orden          integer not null default 0,
  activa         boolean not null default true,
  actualizado_at timestamptz not null default now()
);
create index if not exists zonas_local_idx on alpaso.zonas (local_id, orden);

insert into alpaso.zonas (local_id, nombre, costo, orden)
select 'PIZZERIA', z.nombre, z.costo, z.orden
  from (values ('Centro de Maschwitz', 2500, 1),
               ('Barrios de Puertos', 3500, 2),
               ('Barrios de Villanueva', 4500, 3),
               ('Garín', 3500, 4),
               ('Escobar', 3000, 5)) as z(nombre, costo, orden)
 where not exists (select 1 from alpaso.zonas where local_id = 'PIZZERIA');

-- ── datos del pedido de noche ──
alter table alpaso.pedidos add column if not exists canal text not null default 'ventana';
alter table alpaso.pedidos add column if not exists entrega text;              -- delivery / retiro
alter table alpaso.pedidos add column if not exists zona_id integer references alpaso.zonas(id);
alter table alpaso.pedidos add column if not exists envio integer not null default 0;
alter table alpaso.pedidos add column if not exists cliente jsonb;             -- nombre, telefono, calle, entre, nota
alter table alpaso.pedidos add column if not exists pago text;                 -- efectivo / mp
alter table alpaso.pedidos add column if not exists paga_con integer;          -- para el vuelto
alter table alpaso.pedidos add column if not exists actualizado_at timestamptz not null default now();

do $$
begin
  alter table alpaso.pedidos drop constraint if exists pedidos_estado_check;
  alter table alpaso.pedidos add constraint pedidos_estado_check check (estado in
    ('PRUEBA', 'PENDIENTE_PAGO', 'PAGADO', 'IMPRESO', 'ENTREGADO', 'CANCELADO', 'NUEVO', 'CONFIRMADO', 'EN_CAMINO', 'LISTO'));
  if not exists (select 1 from pg_constraint where conname = 'pedidos_canal_check') then
    alter table alpaso.pedidos add constraint pedidos_canal_check check (canal in ('ventana', 'delivery'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pedidos_entrega_check') then
    alter table alpaso.pedidos add constraint pedidos_entrega_check check (entrega is null or entrega in ('delivery', 'retiro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pedidos_pago_check') then
    alter table alpaso.pedidos add constraint pedidos_pago_check check (pago is null or pago in ('efectivo', 'mp'));
  end if;
end $$;

-- ── permisos para el usuario de la app (también la tabla nueva) ──
grant select, insert, update, delete on all tables in schema alpaso to alpaso_app;
grant usage, select on all sequences in schema alpaso to alpaso_app;
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'alpaso' loop
    execute format('alter table alpaso.%I enable row level security', t);
    execute format('drop policy if exists alpaso_app_todo on alpaso.%I', t);
    execute format('create policy alpaso_app_todo on alpaso.%I for all to alpaso_app using (true) with check (true)', t);
  end loop;
end $$;
