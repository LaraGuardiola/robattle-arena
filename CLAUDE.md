# Robattle Arena — notas para trabajar en el proyecto

- Stack fijo: **Bun + HTML + CSS + TypeScript**. Sin frameworks ni dependencias de
  runtime. Bun empaqueta el cliente desde `src/client/index.html` (HTML import en
  `server.ts`). Estética y motor visual heredados de Robattle Survivors (`../Robattle`).
- Idioma del juego y de los comentarios: español.
- `src/shared/` no puede tocar el DOM: se ejecuta también en el servidor (LAN).
- Campeones y números de equilibrio: `src/shared/data.ts` (`CHAMPS`, tiempos de
  ronda, energía). El comportamiento de cada skill (daño incluido) está en
  `src/shared/skills.ts`; si cambias un número, cambia también el texto `desc`.
- Slots: `r2` básico (mantener), `l2` secundaria, `a` movilidad, `x`/`y` skills,
  `b` definitiva (cuesta 100 de energía). Teclado: clic izq/der, ESPACIO, Q, E, R.
- Mecánicas genéricas del motor (world.ts) que usan varias skills: estados
  (aturdir, inmovilizar, silenciar, dormir, miedo, guardia espejo, niebla,
  torbellino...), `knock` con choque contra muros (`slam`), zonas que siguen a
  un robot (`follow`), cúpulas que frenan proyectiles (`dome`) y canalizaciones
  (`CHANNELS` en skills.ts, se ejecutan cada paso del lanzamiento).
- La IA de los bots (`src/shared/ai.ts`) usa la pista `SkillDef.ai` de cada skill.
  Tras tocar equilibrio, pasar `bun run sim` (partidas bot contra bot con
  porcentajes de victoria 1v1 y 2v2 y recuento de skills usadas).
- El pixel art está en `src/client/art.ts` (robots de Survivors + iconos nuevos);
  revisar con `bun run preview-art`. La arena se hornea en `src/client/tiles.ts`
  (`bakeArena`) con las temáticas de Survivors.
- No usar sprites, nombres ni logos oficiales de Medabots ni de Battlerite: diseños originales.

## Comprobaciones

```bash
bun run check            # tsc --noEmit
bun run sim              # partidas automáticas bot contra bot (equilibrio)
bun run dev              # http://localhost:3000  (?play=merlix,coltron arranca un 1v1 directo)
```
