export interface InfoPosturaAnimal {
  texto: string;
  icone: string;
  classes: string;
}

export interface AcelerometroAnimal {
  x: number;
  y: number;
  z: number;
}

/**
 * Extrai as leituras (x, y, z) do acelerômetro aceitando formato aninhado ou campos planos.
 */
export function obterAcelerometroAnimal(telem: any): AcelerometroAnimal | null {
  if (!telem) return null;
  const acel = telem.acelerometro || telem.accelerometer;
  if (acel && (acel.x !== undefined || acel.y !== undefined || acel.z !== undefined)) {
    return {
      x: Number(acel.x ?? 0),
      y: Number(acel.y ?? 0),
      z: Number(acel.z ?? 0),
    };
  }
  if (
    telem.acelerometro_x !== undefined ||
    telem.acelerometro_y !== undefined ||
    telem.acelerometro_z !== undefined
  ) {
    return {
      x: Number(telem.acelerometro_x ?? 0),
      y: Number(telem.acelerometro_y ?? 0),
      z: Number(telem.acelerometro_z ?? 0),
    };
  }
  return null;
}

/**
 * Resolve a postura e o nível de atividade do animal a partir de um registro de telemetria
 * enviado pela coleira IoT (ESP32-C6 + acelerômetro BMI160 na horizontal).
 */
export function obterInfoPosturaAnimal(telem: any): InfoPosturaAnimal | null {
  if (!telem) return null;

  const nivelRaw =
    telem.estado_atividade ||
    telem.nivel_atividade ||
    telem.postura ||
    telem.activity_level ||
    telem.status_postura;

  let texto = typeof nivelRaw === 'string' && nivelRaw.trim() ? nivelRaw.trim() : '';

  // Fallback para leituras legadas que possuem apenas os eixos (x, y, z) do acelerômetro BMI160
  if (!texto) {
    const acel = obterAcelerometroAnimal(telem);
    if (acel && acel.z !== undefined && acel.z !== null) {
      const zAbs = Math.abs(Number(acel.z));
      if (!Number.isNaN(zAbs)) {
        texto =
          zAbs < 0.65
            ? 'Deitado (Repouso / Ruminação)'
            : 'Em pé (Ativo / Pastando)';
      }
    }
  }

  if (!texto) return null;

  const lower = texto.toLowerCase();
  if (lower.includes('deitado') || lower.includes('repouso') || lower.includes('rumina')) {
    return {
      texto,
      icone: '🛌',
      classes: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    };
  }

  if (lower.includes('intenso') || lower.includes('corrida') || lower.includes('agitado')) {
    return {
      texto,
      icone: '⚡',
      classes: 'bg-amber-100 text-amber-900 border-amber-200',
    };
  }

  return {
    texto,
    icone: '🐄',
    classes: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  };
}

