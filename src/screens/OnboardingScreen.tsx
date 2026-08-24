import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { Button } from '../components/Button';
import { colors, spacing, typography } from '../theme';
import type { AuthStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<AuthStackParamList, 'Onboarding'>;

interface Slide {
  emoji: string;
  titulo: string;
  descripcion: string;
}

/**
 * Pasos simples que anticipan el resto del roadmap (hogar en sprint 2,
 * productos en sprint 3, vencimientos en sprint 4) sin prometer
 * funcionalidad que todavía no existe en la app.
 */
const slides: Slide[] = [
  {
    emoji: '🏡',
    titulo: 'Un hogar, un inventario',
    descripcion: 'Creá tu hogar e invitá a quien viva con vos para compartir el mismo inventario.',
  },
  {
    emoji: '🧺',
    titulo: 'Sabé siempre qué tenés',
    descripcion: 'Cargá los productos de tu casa y consultalos antes de salir a comprar.',
  },
  {
    emoji: '⏰',
    titulo: 'Nunca más un vencimiento sorpresa',
    descripcion: 'Vas a poder registrar fechas de vencimiento y recibir alertas antes de que se venzan.',
  },
];

export function OnboardingScreen({ navigation }: Props) {
  const [index, setIndex] = useState(0);
  const isLast = index === slides.length - 1;
  const slide = slides[index];

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.center}>
        <Text style={styles.emoji}>{slide.emoji}</Text>
        <Text style={styles.titulo}>{slide.titulo}</Text>
        <Text style={styles.descripcion}>{slide.descripcion}</Text>

        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      </View>

      <Button
        label={isLast ? 'Continuar' : 'Siguiente'}
        onPress={() => (isLast ? navigation.navigate('Login') : setIndex((i) => i + 1))}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'space-between',
    paddingVertical: spacing.xxl,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  emoji: {
    fontSize: 72,
  },
  titulo: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  descripcion: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 20,
  },
});
