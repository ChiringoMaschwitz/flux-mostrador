-- ═══════════════════════════════════════════════════════════════════════════
-- flux-mostrador · alpaso_fase2a_mp
-- Cobro con Mercado Pago (API de Orders, Checkout Pro).
-- El pedido se guarda como PENDIENTE_PAGO (no aparece en el panel) y pasa a NUEVO (noche) o PAGADO (ventana)
-- recién cuando Mercado Pago confirma el pago y el monto coincide.
-- Se puede correr más de una vez.
-- ═══════════════════════════════════════════════════════════════════════════

alter table alpaso.pedidos add column if not exists mp_ref text;         -- referencia secreta que viaja a Mercado Pago
alter table alpaso.pedidos add column if not exists mp_order_id text;    -- id de la order en Mercado Pago
alter table alpaso.pedidos add column if not exists mp_estado text;      -- último estado que informó Mercado Pago
alter table alpaso.pedidos add column if not exists pagado_at timestamptz;

create unique index if not exists pedidos_mp_ref_idx on alpaso.pedidos (mp_ref) where mp_ref is not null;
create index if not exists pedidos_mp_order_idx on alpaso.pedidos (mp_order_id) where mp_order_id is not null;

select count(*) as pedidos from alpaso.pedidos;
