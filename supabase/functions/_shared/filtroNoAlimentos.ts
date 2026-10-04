// Filtro heurístico de productos no-alimenticios para ocr-ticket.
// No pretende ser perfecto: la pantalla de revisión del Sprint 6 (el
// usuario edita/borra candidatos antes de confirmar) es la red de
// seguridad real. Esto solo reduce el ruido más obvio (limpieza,
// higiene, etc.) para no mostrar líneas de ticket que claramente no son
// comida.
const PALABRAS_NO_ALIMENTO = [
  'lavandina', 'detergente', 'jabon', 'jabón', 'shampoo', 'champu', 'champú',
  'acondicionador', 'desodorante', 'papel higienico', 'papel higiénico',
  'rollo de cocina', 'servilleta', 'pañal', 'panal', 'toallita',
  'cepillo de dientes', 'pasta dental', 'crema dental', 'pilas', 'bateria',
  'batería', 'foco', 'lamparita', 'bolsa de residuo', 'esponja', 'repelente',
  'insecticida', 'suavizante', 'limpiador', 'lustramuebles', 'cera',
  'protector solar', 'toallitas femeninas', 'preservativo', 'maquinita de afeitar',
  'afeitadora', 'hisopo', 'algodon', 'algodón',
];

export function esProbablementeAlimento(nombre: string): boolean {
  const normalizado = nombre.toLowerCase();
  return !PALABRAS_NO_ALIMENTO.some((palabra) => normalizado.includes(palabra));
}
