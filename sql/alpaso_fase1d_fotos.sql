-- ═══════════════════════════════════════════════════════════════════════════
-- flux-mostrador · alpaso_fase1d_fotos
-- Fotos nuevas de la carpeta "Pizzas para app" (04/11/2026).
-- Solo completa los productos que todavía no tienen foto: si alguien ya subió una desde el panel, no la pisa.
-- Jamón y morrones y las dos de mitad y mitad no necesitan nada acá: se reemplazó el archivo con el mismo nombre.
-- Se puede correr más de una vez.
-- ═══════════════════════════════════════════════════════════════════════════

update alpaso.productos p
   set foto = f.foto, actualizado_at = now()
  from alpaso.secciones s,
       (values ('Clásicas', 'Napolitana',                '/assets/fotos/napolitana.jpg'),
               ('Clásicas', 'Fugazzetta',                '/assets/fotos/fugazzetta.jpg'),
               ('Clásicas', 'Calabresa',                 '/assets/fotos/calabresa.jpg'),
               ('Clásicas', 'Anchoas',                   '/assets/fotos/anchoas.jpg'),
               ('Clásicas', 'Palmitos',                  '/assets/fotos/palmitos.jpg'),
               ('Clásicas', 'Capresse',                  '/assets/fotos/capresse.jpg'),
               ('Clásicas', 'Pepperoni',                 '/assets/fotos/pepperoni.jpg'),
               ('Clásicas', 'Espinaca con salsa blanca', '/assets/fotos/espinaca-con-salsa-blanca.jpg'),
               ('Clásicas', 'Primavera',                 '/assets/fotos/primavera.jpg'),
               ('Gourmet',  'Jamón crudo Las Dinas',     '/assets/fotos/jamon-crudo-las-dinas.jpg')) as f(seccion, nombre, foto)
 where s.id = p.seccion_id
   and s.local_id = 'PIZZERIA'
   and s.nombre = f.seccion
   and p.nombre = f.nombre
   and (p.foto is null or p.foto = '');

-- para ver cómo quedó
select s.nombre as seccion, p.nombre, p.foto
  from alpaso.productos p join alpaso.secciones s on s.id = p.seccion_id
 where s.local_id = 'PIZZERIA' and s.tipo in ('pizzas', 'grilla')
 order by s.orden, p.orden;
