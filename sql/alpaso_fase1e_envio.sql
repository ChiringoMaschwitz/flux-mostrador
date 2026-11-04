-- ═══════════════════════════════════════════════════════════════════════════
-- flux-mostrador · alpaso_fase1e_envio
-- Días con envío: a la noche se toma pedido todos los días del horario, pero el delivery solo los días marcados.
-- Los otros días (miércoles) es solo retiro en el local. Se cambia desde el panel: Horario y zonas → Delivery → "Con envío".
-- Se puede correr más de una vez.
-- ═══════════════════════════════════════════════════════════════════════════

alter table alpaso.locales add column if not exists envio_dias jsonb;

-- jueves (4) a domingo (0) con envío; miércoles solo retiro
update alpaso.locales set envio_dias = '[4,5,6,0]'::jsonb where id = 'PIZZERIA' and envio_dias is null;

select id, horario_delivery, envio_dias from alpaso.locales where id = 'PIZZERIA';
