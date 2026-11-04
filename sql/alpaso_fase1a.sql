-- ═══════════════════════════════════════════════════════════════════════════
-- flux-mostrador · Etapa 1 · alpaso_fase1a
-- Una Pizza al paso: esquema propio, usuario de base restringido y carta inicial.
--
-- Se corre en el SQL Editor de Supabase. Se puede correr más de una vez:
-- las tablas usan "if not exists" y la carta solo se carga si el local no existe.
--
-- Todo vive en el esquema "alpaso". El usuario "alpaso_app" solo puede tocar
-- ese esquema: no ve ni modifica ninguna tabla de FLUX.
--
-- DESPUÉS de correr esto, en el mismo SQL Editor (ver README):
--   alter role alpaso_app password 'UNA_CLAVE_LARGA';
--   select alpaso.crear_usuario('Guillermo', 'gerencia', 'TU_PIN');
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists alpaso;

-- ── usuario de base de la app ──────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'alpaso_app') then
    create role alpaso_app login;
  end if;
end $$;

grant usage on schema alpaso to alpaso_app;
grant usage on schema extensions to alpaso_app;
alter role alpaso_app set search_path = alpaso, extensions;

-- ── tablas ─────────────────────────────────────────────────────────────────
create table if not exists alpaso.locales (
  id             text primary key,
  nombre         text not null,
  -- horario por día de la semana (0 = domingo … 6 = sábado): {"2":["13:00","17:00"], …}
  horario        jsonb not null default '{}'::jsonb,
  -- auto = según el horario · abierto / cerrado = forzado desde el panel
  estado_manual  text not null default 'auto' check (estado_manual in ('auto', 'abierto', 'cerrado')),
  actualizado_at timestamptz not null default now()
);

create table if not exists alpaso.secciones (
  id             serial primary key,
  local_id       text not null references alpaso.locales(id),
  nombre         text not null,
  bajada         text not null default '',
  -- pizzas = tarjetas con Individual y Grande · grilla = tarjetas con precio único
  -- lista = renglones sin foto · empanadas = gustos con precio por unidad / ½ docena / docena
  tipo           text not null check (tipo in ('pizzas', 'grilla', 'lista', 'empanadas')),
  tema           text not null default 'azulejo' check (tema in ('azulejo', 'pizarra', 'rojo', 'tiza', 'tinta', 'papel')),
  mitades        boolean not null default false,          -- sus grandes se pueden combinar mitad y mitad
  precio_unidad  integer check (precio_unidad is null or precio_unidad > 0),
  precio_media   integer check (precio_media is null or precio_media > 0),
  precio_docena  integer check (precio_docena is null or precio_docena > 0),
  dentro_de      integer references alpaso.secciones(id) on delete set null,   -- se muestra dentro de otra solapa
  orden          integer not null default 0,
  activa         boolean not null default true,
  actualizado_at timestamptz not null default now()
);
create index if not exists secciones_local_idx on alpaso.secciones (local_id, orden);

create table if not exists alpaso.productos (
  id             serial primary key,
  seccion_id     integer not null references alpaso.secciones(id),
  nombre         text not null,
  descripcion    text not null default '',
  precio         integer check (precio is null or precio > 0),          -- individual, o precio único
  precio_grande  integer check (precio_grande is null or precio_grande > 0),   -- solo pizzas: grande de 8 porciones
  foto           text,
  -- {"tipo":"elegir","valores":["Con crema","Con dulce de leche"]} o {"tipo":"escribir","pregunta":"¿De qué sabor?"}
  opciones       jsonb,
  orden          integer not null default 0,
  activo         boolean not null default true,
  al_paso        boolean not null default true,
  agotado        boolean not null default false,
  creado_at      timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);
create index if not exists productos_seccion_idx on alpaso.productos (seccion_id, orden);

create table if not exists alpaso.usuarios (
  id              serial primary key,
  nombre          text not null unique,
  rol             text not null check (rol in ('gerencia', 'controlador')),
  pin_hash        text not null,
  activo          boolean not null default true,
  fallidos        integer not null default 0,
  bloqueado_hasta timestamptz,
  creado_at       timestamptz not null default now()
);

create table if not exists alpaso.historial (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  usuario text not null,
  accion  text not null,
  que     text not null,
  antes   jsonb,
  despues jsonb
);
create index if not exists historial_at_idx on alpaso.historial (at desc);

create table if not exists alpaso.pedidos (
  id        bigserial primary key,
  local_id  text not null references alpaso.locales(id),
  fecha     date not null,          -- día operativo en hora argentina
  numero    integer not null,       -- número del día que se canta por la ventana
  estado    text not null default 'PRUEBA'
            check (estado in ('PRUEBA', 'PENDIENTE_PAGO', 'PAGADO', 'IMPRESO', 'ENTREGADO', 'CANCELADO')),
  total     integer not null check (total >= 0),
  items     jsonb not null,         -- foto de lo pedido con precios y texto de la comanda
  creado_at timestamptz not null default now(),
  unique (local_id, fecha, numero)
);

grant select, insert, update, delete on all tables in schema alpaso to alpaso_app;
grant usage, select on all sequences in schema alpaso to alpaso_app;

-- Supabase activa la seguridad por filas (RLS) en tablas nuevas: sin esta regla alpaso_app las ve vacías.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'alpaso' loop
    execute format('alter table alpaso.%I enable row level security', t);
    execute format('drop policy if exists alpaso_app_todo on alpaso.%I', t);
    execute format('create policy alpaso_app_todo on alpaso.%I for all to alpaso_app using (true) with check (true)', t);
  end loop;
end $$;

-- ── alta de usuarios con PIN (el PIN se guarda cifrado) ───────────────────
create or replace function alpaso.crear_usuario(p_nombre text, p_rol text, p_pin text)
returns void
language plpgsql
as $$
begin
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'El PIN tiene que tener de 4 a 6 números';
  end if;
  insert into alpaso.usuarios (nombre, rol, pin_hash)
  values (p_nombre, p_rol, extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict (nombre) do update
    set rol = excluded.rol, pin_hash = excluded.pin_hash, activo = true, fallidos = 0, bloqueado_hasta = null;
end;
$$;
revoke all on function alpaso.crear_usuario(text, text, text) from public;

-- ── carta inicial de Una Pizza (del PDF, 01/11/2026) ──────────────────────
-- Lo que no va al paso (postres, cervezas de litro, copa de vino) queda cargado
-- con al_paso = false, para cuando la carta se use en el local.
do $$
declare
  s_clasicas int; s_gourmet int; s_rellenas int; s_empanadas int; s_faina int;
  s_bebidas int; s_sin int; s_postres int;
begin
  if exists (select 1 from alpaso.locales where id = 'PIZZERIA') then
    return;
  end if;

  insert into alpaso.locales (id, nombre, horario) values (
    'PIZZERIA', 'Una Pizza',
    '{"2":["13:00","17:00"],"3":["13:00","17:00"],"4":["13:00","17:00"],"5":["13:00","17:00"],"6":["13:00","17:00"]}'
  );

  insert into alpaso.secciones (local_id, nombre, bajada, tipo, tema, mitades, orden)
    values ('PIZZERIA', 'Clásicas', 'A la piedra, en el horno a leña.', 'pizzas', 'azulejo', true, 1) returning id into s_clasicas;
  insert into alpaso.secciones (local_id, nombre, bajada, tipo, tema, mitades, orden)
    values ('PIZZERIA', 'Gourmet', 'Las de la casa.', 'pizzas', 'pizarra', true, 2) returning id into s_gourmet;
  insert into alpaso.secciones (local_id, nombre, bajada, tipo, tema, orden)
    values ('PIZZERIA', 'Rellenas', 'A la piedra, dobles y cerradas.', 'grilla', 'rojo', 3) returning id into s_rellenas;
  insert into alpaso.secciones (local_id, nombre, bajada, tipo, tema, precio_unidad, precio_media, precio_docena, orden)
    values ('PIZZERIA', 'Empanadas', 'Al horno. De a una, media docena o docena.', 'empanadas', 'tiza', 3000, 17000, 33000, 4) returning id into s_empanadas;
  insert into alpaso.secciones (local_id, nombre, bajada, tipo, tema, dentro_de, orden)
    values ('PIZZERIA', 'Fainá', '', 'grilla', 'tiza', s_empanadas, 5) returning id into s_faina;
  insert into alpaso.secciones (local_id, nombre, bajada, tipo, tema, orden)
    values ('PIZZERIA', 'Bebidas', 'Bien frías.', 'lista', 'tinta', 6) returning id into s_bebidas;
  insert into alpaso.secciones (local_id, nombre, bajada, tipo, tema, dentro_de, orden)
    values ('PIZZERIA', 'Sin alcohol', '', 'lista', 'tinta', s_bebidas, 7) returning id into s_sin;
  insert into alpaso.secciones (local_id, nombre, bajada, tipo, tema, orden)
    values ('PIZZERIA', 'Postres', 'Para cerrar.', 'lista', 'papel', 8) returning id into s_postres;

  insert into alpaso.productos (seccion_id, nombre, descripcion, precio, precio_grande, foto, orden) values
    (s_clasicas, 'Muzzarella', '', 20000, 24000, '/assets/fotos/muzzarella.jpg', 1),
    (s_clasicas, 'Jamón y morrones', '', 22000, 32500, '/assets/fotos/jamon-y-morrones.jpg', 2),
    (s_clasicas, 'Ananá con jamón', '', 23000, 33000, '/assets/fotos/anana-con-jamon.jpg', 3),
    (s_clasicas, 'Napolitana', '', 21000, 30000, null, 4),
    (s_clasicas, 'Fugazzetta', '', 22500, 32500, null, 5),
    (s_clasicas, 'Calabresa', '', 22000, 32500, null, 6),
    (s_clasicas, 'Cuatro quesos', '', 23500, 36500, null, 7),
    (s_clasicas, 'Anchoas', '', 20500, 31000, null, 8),
    (s_clasicas, 'Palmitos', 'Con salsa golf', 24000, 36500, null, 9),
    (s_clasicas, 'Provolone', '', 26500, 37000, null, 10),
    (s_clasicas, 'Margarita', 'Mozzarella y albahaca', 22000, 30500, null, 11),
    (s_clasicas, 'Capresse', 'Mozzarella, albahaca y tomate', 22000, 30500, null, 12),
    (s_clasicas, 'Pepperoni', '', 22000, 32500, null, 13),
    (s_clasicas, 'Espinaca con salsa blanca', '', 20000, 33800, null, 14),
    (s_clasicas, 'Primavera', 'Jamón y huevo', 20500, 30000, null, 15),

    (s_gourmet, 'Cuatro quesos con miel y nueces', '', 25500, 39500, '/assets/fotos/cuatro-quesos-miel-y-nueces.jpg', 1),
    (s_gourmet, 'Jamón crudo Las Dinas', 'Rúcula y parmesano', 26500, 39000, null, 2),
    (s_gourmet, 'Salame tandilero', 'Con queso pategrás', 22000, 39500, null, 3),
    (s_gourmet, 'Panceta y verdeo', '', 26500, 38000, null, 4),
    (s_gourmet, 'Panceta crispy y cheddar', 'Solo grande', null, 39500, null, 5),

    (s_rellenas, 'Fugazzetta rellena', '', 35500, null, null, 1),
    (s_rellenas, 'Jamón', 'Rellena', 40000, null, null, 2),
    (s_rellenas, 'Jamón y morrones', 'Rellena', 41000, null, null, 3),

    (s_empanadas, 'Carne', 'Cortada a cuchillo', null, null, null, 1),
    (s_empanadas, 'Pollo', '', null, null, null, 2),
    (s_empanadas, 'Jamón y queso', '', null, null, null, 3),
    (s_empanadas, 'Verdura', '', null, null, null, 4),
    (s_empanadas, 'Bondiola', 'Desmechada a la mostaza', null, null, null, 5),

    (s_faina, 'Porción de fainá', '', 2700, null, '/assets/fotos/faina.jpg', 1),

    (s_bebidas, 'Heineken', 'Lata', 7000, null, null, 2),
    (s_bebidas, 'Heineken', 'Porrón', 7000, null, null, 3),
    (s_bebidas, 'Imperial', 'Lata', 6000, null, null, 5),
    (s_bebidas, 'Amstel', 'Lata', 6000, null, null, 6),
    (s_bebidas, 'Blue Moon', 'Lata', 6600, null, null, 7),
    (s_bebidas, 'Miller', 'Lata', 6600, null, null, 8),
    (s_bebidas, 'Warsteiner', 'Lata', 6600, null, null, 9),

    (s_sin, 'Coca-Cola', 'Lata', 5200, null, null, 1),
    (s_sin, 'Coca-Cola', 'Botella 1,75 L', 15000, null, null, 2),
    (s_sin, 'Agua sin gas', '', 4800, null, null, 4),
    (s_sin, 'Agua con gas', '', 4800, null, null, 5);

  insert into alpaso.productos (seccion_id, nombre, descripcion, precio, opciones, orden) values
    (s_sin, 'Saborizada', 'Elegís el sabor', 5000, '{"tipo":"escribir","pregunta":"¿De qué sabor?"}', 3);

  -- cargados pero fuera del al paso
  insert into alpaso.productos (seccion_id, nombre, descripcion, precio, opciones, orden, al_paso) values
    (s_bebidas, 'Heineken', 'Litro', 14500, null, 1, false),
    (s_bebidas, 'Imperial', 'Litro', 14500, null, 4, false),
    (s_bebidas, 'Copa de vino', '', 5200, null, 10, false),
    (s_postres, 'Torta del día', 'Porción', 9900, null, 1, false),
    (s_postres, 'Flan casero', '', 5500, null, 2, false),
    (s_postres, 'Flan con crema o dulce de leche', '', 7000, '{"tipo":"elegir","valores":["Con crema","Con dulce de leche"]}', 3, false);

  insert into alpaso.historial (usuario, accion, que, despues)
    values ('Sistema', 'carga_inicial', 'Carta de Una Pizza del PDF (01/11/2026)', null);
end $$;
