import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { diasDelMesCalendario, formatearFechaISO } from '../services/productos';
import { colors, radius, spacing, typography } from '../theme';

interface CalendarioPickerProps {
  /** Fecha ya elegida ('YYYY-MM-DD'), o null si todavía no hay ninguna. Determina qué día queda resaltado y con qué mes arranca el calendario. */
  valor: string | null;
  onSeleccionar: (fecha: string) => void;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// true si `fecha` (string) tiene formato válido, para saber si conviene
// arrancar el calendario mostrando ESE mes en vez del actual.
function parsearFechaSiValida(fecha: string | null): Date | null {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const parseada = new Date(anio, mes - 1, dia);
  return Number.isNaN(parseada.getTime()) ? null : parseada;
}

/**
 * Calendario en grilla (mes + flechas para navegar + días en cuadrícula),
 * igual al de un date picker de escritorio -- reemplaza al selector nativo
 * del sistema operativo para que se vea y se sienta igual en cualquier
 * plataforma (web incluida, donde un `<input type="date">` no se puede
 * estilar). Se usa embebido inline en ProductoFormModal (se expande debajo
 * del campo de fecha al tocar el botón de calendario), no como popup
 * flotante -- más simple de armar dentro de un modal que ya scrollea.
 */
export function CalendarioPicker({ valor, onSeleccionar }: CalendarioPickerProps) {
  const fechaInicial = parsearFechaSiValida(valor) ?? new Date();
  const [mesVisible, setMesVisible] = useState(fechaInicial.getMonth());
  const [anioVisible, setAnioVisible] = useState(fechaInicial.getFullYear());

  const hoy = formatearFechaISO(new Date());
  const dias = diasDelMesCalendario(anioVisible, mesVisible);

  function irMesAnterior() {
    if (mesVisible === 0) {
      setMesVisible(11);
      setAnioVisible((anio) => anio - 1);
    } else {
      setMesVisible((mes) => mes - 1);
    }
  }

  function irMesSiguiente() {
    if (mesVisible === 11) {
      setMesVisible(0);
      setAnioVisible((anio) => anio + 1);
    } else {
      setMesVisible((mes) => mes + 1);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable onPress={irMesAnterior} accessibilityRole="button" accessibilityLabel="Mes anterior" hitSlop={8} style={styles.headerBoton}>
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </Pressable>
        <Text style={styles.mesTexto}>
          {MESES[mesVisible]} {anioVisible}
        </Text>
        <Pressable onPress={irMesSiguiente} accessibilityRole="button" accessibilityLabel="Mes siguiente" hitSlop={8} style={styles.headerBoton}>
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </Pressable>
      </View>

      <View style={styles.semanaRow}>
        {DIAS_SEMANA.map((letra, i) => (
          <Text key={i} style={styles.diaSemanaTexto}>
            {letra}
          </Text>
        ))}
      </View>

      <View style={styles.grilla}>
        {dias.map((dia) => {
          const esHoy = dia.fecha === hoy;
          const esSeleccionado = dia.fecha === valor;
          return (
            <Pressable
              key={dia.fecha}
              onPress={() => onSeleccionar(dia.fecha)}
              style={styles.diaCelda}
              accessibilityRole="button"
              accessibilityLabel={dia.fecha}
            >
              <View style={[styles.diaCirculo, esSeleccionado && styles.diaCirculoSeleccionado, esHoy && !esSeleccionado && styles.diaCirculoHoy]}>
                <Text
                  style={[
                    styles.diaTexto,
                    !dia.enMesActual && styles.diaTextoFueraDeMes,
                    esSeleccionado && styles.diaTextoSeleccionado,
                  ]}
                >
                  {dia.dia}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const ANCHO_CELDA = `${100 / 7}%` as const;

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  headerBoton: {
    padding: spacing.xs,
  },
  mesTexto: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    textTransform: 'capitalize',
  },
  semanaRow: {
    flexDirection: 'row',
  },
  diaSemanaTexto: {
    ...typography.caption,
    color: colors.textSecondary,
    width: ANCHO_CELDA,
    textAlign: 'center',
  },
  grilla: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  diaCelda: {
    width: ANCHO_CELDA,
    alignItems: 'center',
    paddingVertical: 2,
  },
  diaCirculo: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diaCirculoHoy: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  diaCirculoSeleccionado: {
    backgroundColor: colors.primary,
  },
  diaTexto: {
    ...typography.caption,
    color: colors.textPrimary,
  },
  diaTextoFueraDeMes: {
    color: colors.textDisabled,
  },
  diaTextoSeleccionado: {
    color: colors.white,
  },
});
