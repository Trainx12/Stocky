import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { inicialDe } from '../services/usuarios';
import { colors } from '../theme';
import { useEstilos } from '../theme/useEstilos';

interface AvatarProps {
  /** URL pública de la foto de perfil (usuarios.avatar_url); null = sin foto. */
  url?: string | null;
  nombre?: string | null;
  email?: string | null;
  /** Diámetro en px (default 40). */
  tamano?: number;
  /** 'fuerte' (fondo verde, letra blanca) para el perfil propio; 'suave' para listas. */
  variante?: 'fuerte' | 'suave';
}

/**
 * Círculo con la foto de perfil de alguien. Sin foto (o si no carga) muestra
 * la inicial del nombre o del email, y si tampoco hay eso, el ícono de
 * persona. Se usa en Cuenta, el saludo del inicio, "Miembros del hogar" y
 * Admin → Usuarios.
 */
export function Avatar({ url, nombre = null, email = null, tamano = 40, variante = 'suave' }: AvatarProps) {
  const styles = useEstilos(crearEstilos);
  const [fallo, setFallo] = useState(false);

  // Una foto nueva vuelve a intentarse aunque la anterior no haya cargado.
  useEffect(() => setFallo(false), [url]);

  const circulo = { width: tamano, height: tamano, borderRadius: tamano / 2 };
  const fuerte = variante === 'fuerte';

  if (url && !fallo) {
    return (
      <Image
        source={{ uri: url }}
        style={[styles.base, circulo]}
        resizeMode="cover"
        onError={() => setFallo(true)}
        accessibilityIgnoresInvertColors
      />
    );
  }

  const inicial = inicialDe(nombre, email ?? '');
  return (
    <View style={[styles.base, circulo, fuerte ? styles.fondoFuerte : styles.fondoSuave]}>
      {inicial === '?' ? (
        <Ionicons name="person" size={tamano * 0.55} color={fuerte ? colors.white : colors.primaryDark} />
      ) : (
        <Text
          style={[styles.inicial, { fontSize: tamano * 0.45, lineHeight: tamano * 0.6 }, fuerte ? styles.textoFuerte : styles.textoSuave]}
        >
          {inicial}
        </Text>
      )}
    </View>
  );
}

const crearEstilos = () =>
  StyleSheet.create({
    base: {
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: colors.border,
    },
    fondoFuerte: {
      backgroundColor: colors.primary,
    },
    fondoSuave: {
      backgroundColor: colors.primaryLight,
    },
    inicial: {
      fontWeight: '700',
    },
    textoFuerte: {
      color: colors.white,
    },
    textoSuave: {
      color: colors.primaryDark,
    },
  });
