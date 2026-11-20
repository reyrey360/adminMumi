-- ==========================================
-- IMPORTAR INVENTARIO A SUPABASE
-- ==========================================
-- Copia y ejecuta este SQL en el SQL Editor de Supabase
-- Esto importará todos los productos de tu inventario.csv

INSERT INTO productos (referencia, nombre, categoria, tallas, colores, descripcion, precio, stock, stock_00, stock_0, stock_1, stock_2, stock_4, stock_6, stock_8, stock_10, stock_12, precio_00, precio_0, precio_1, precio_2, precio_4, precio_6, precio_8, precio_10, precio_12, imagen, etiqueta) VALUES
('1', 'Vestido Verde Menta', 'destacados', '2,4,6,8,10,12', 'azul, rosa, lila', 'nacional', 90000, 46, 0, 0, 0, 0, 6, 8, 8, 8, 8, 0, 0, 0, 90000, 95000, 98000, 110000, 115000, 120000, 'R1.jpg', '-50%'),
('2', 'Bautizo niña Mangas', 'destacados', '6,8,10,12', 'Blanco, beis', 'Exportado', 90000, 49, 0, 0, 0, 0, 5, 6, 8, 8, 8, 8, 0, 0, 0, 90000, 95000, 98000, 110000, 115000, 120000, 'R2.jpg', '-25%'),
('3', 'Vestino Mini', 'Niñas', '6,8,10,12', 'Rosa', 'Algon', 90000, 49, 0, 0, 0, 0, 5, 6, 8, 8, 8, 8, 0, 0, 0, 90000, 95000, 98000, 110000, 115000, 120000, 'R3.jpg', '-5%'),
('4', 'Bramitas Niña', 'Calzado', '20', 'Rosa', 'Primera comunion', 60000, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'R4.jpg', 'Nuevo'),
('5', 'Vestido Azul cielo', 'Niñas', '2,4,10', 'Azul cielo', 'Vestido azul cielo con doble bolero', 92000, 8, 0, 0, 0, 0, 2, 2, 0, 0, 2, 0, 0, 92000, 95000, 0, 110000, 0, 0, 0, '1.jpeg', ''),
('6', 'Vestido fuscia mari', 'Niñas', '4,10,12', 'Fuscia', 'Vestido fucsia con 2 boleros', 85000, 8, 0, 0, 0, 0, 0, 2, 0, 0, 2, 2, 0, 85000, 0, 0, 110000, 115000, 0, 0, '2.jpeg', ''),
('7', 'Vestido margaritas', 'Niñas', '2,4,8,10', 'Rojo', 'Vestido rojo margaritas', 90000, 10, 0, 0, 0, 0, 2, 2, 0, 2, 2, 0, 0, 90000, 90000, 0, 98000, 98000, 0, 0, '3.jpeg', ''),
('8', 'Vestido mangas fuscia', 'Niñas', '2,4', 'Fuscia', 'Vestido fucsia talle blonda', 85000, 2, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 85000, 90000, 0, 0, 0, 0, 0, '4.jpeg', ''),
('9', 'Vestido barbie', 'Niñas', '4,1', 'Rosa', 'Vestido tematica barbie rosado', 95000, 2, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 95000, 0, 0, 110000, 0, 0, 0, '5.jpeg', ''),
('10', 'Vestido agua mora', 'Niñas', '1,2,4', 'Menta con morado', 'Vestido aguamatina con morado', 80000, 3, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 80000, 0, 0, 0, 0, 0, 0, '6.jpeg', ''),
('11', 'Vestido lentejuelas', 'Niñas', '4,1', 'Rojo', 'Vestido rojo con talle en lentejuelas', 92000, 5, 0, 0, 0, 0, 2, 0, 1, 0, 0, 2, 0, 92000, 0, 95000, 0, 0, 0, 0, '7.jpeg', ''),
('12', 'Oberol niña', 'Niñas', '2', 'Jean', 'Conjunto oberol en jean', 48000, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 48000, 0, 0, 0, 0, 0, 0, '8.jpeg', '-5%'),
('13', 'Vestido bautizo', 'Bautizo', '2', 'Blanco', 'Vestido blanco con chaleco', 85000, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 85000, 0, 0, 0, 0, 0, 0, '9.jpeg', ''),
('14', 'Vestido turqui', 'Niñas', '4', 'Azul turqui', 'Vestido azul turqui con lentejuelas', 85000, 2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 85000, 0, 0, 0, 0, 0, 0, '10.jpeg', ''),
('15', 'Vestido azul celeste', 'Niñas', '4,12', 'Azul celeste', 'Vestido azul celeste falda brillos', 80000, 2, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 80000, 0, 0, 0, 95000, 0, 0, '11.jpeg', ''),
('16', 'Vestido amarillo diagonal', 'Niñas', '2,4,6,8,10', 'amarillo', 'Vestido corte en diagonal', 85000, 10, 0, 0, 0, 0, 2, 2, 2, 2, 2, 0, 0, 85000, 90000, 95000, 98000, 110000, 0, 0, '12.jpeg', ''),
('17', 'Vestido verde esmeralda', 'Niñas', '10,12', 'Verde menta', 'Vestido verde menta con mangas', 110000, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 110000, 115000, '13.jpeg', ''),
('18', 'Vestido verde escar', 'Niñas', '4', 'Verde menta', 'Vestido verde menta con brillos', 98000, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 98000, 0, 0, 0, 0, 0, 0, '14.jpeg', ''),
('19', 'Vestido beis azul turqui', 'Niñas', '4,6,8', 'Azul turqui con beis', 'Vestido azul turqui con beis', 95000, 3, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 95000, 98000, 110000, 0, 0, 0, 0, '15.jpeg', ''),
('20', 'Conjunto bautizo', 'Bautizo', '0,1', 'Azul cielo', 'Conjunto bautizo niño', 95000, 4, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 95000, 95000, 0, 0, 0, 0, 0, '16.jpeg', ''),
('21', 'Conjunto bautizo', 'Bautizo', '0,1,2,4,6,8,10,12', 'Azul cielo', 'Conjunto niño bautizo azul cielo', 85000, 16, 0, 0, 1, 1, 2, 2, 2, 2, 2, 1, 0, 85000, 85000, 95000, 95000, 105000, 105000, 105000, 105000, '16.jpeg', ''),
('22', 'Vestido rojo', 'Niñas', '4,8', 'Rojo', 'Vestido rojo con lentejuelas', 98000, 2, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 98000, 0, 110000, 0, 0, 0, 0, '17.jpeg', ''),
('23', 'Vestido beis', 'Bautizo', '00,0,1', 'Beis dorado', 'Vestido beis con dorado con brillos', 80000, 4, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 80000, 85000, 0, 0, 0, 0, 0, '18.jpeg', ''),
('24', 'Vestido beis', 'Bautizo', '0,1,2,4,6,8,10,12', 'Beis con dorado', 'Vestido beis con dorado con brillos', 90000, 16, 0, 0, 1, 1, 4, 2, 2, 1, 2, 2, 0, 0, 90000, 95000, 98000, 110000, 115000, 120000, '18.jpeg', ''),
('021J', 'Vestido sirenita', 'Niñas', '1,2', 'Lila', 'Vestido forrado en genero, tela muy suave al tacto', 85000, 2, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 85000, 88000, 0, 0, 0, 0, 0, '021J.jpeg', ''),
('001J', 'Vestido nude', 'Niñas', '2', 'Nude, palo de rosa', 'Vestido con brillos en la falda, talle sublimado', 95000, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 95000, 0, 0, 0, 0, 0, 0, '001J.jpeg', '');

-- Verificar que se importaron
SELECT COUNT(*) as total_productos FROM productos;
SELECT * FROM productos LIMIT 5;