# Robattle Arena — próximos upgrades

Documento de diseño para el siguiente contexto de trabajo. Recoge **10 campeones
nuevos** (mayoría tiradores) y la **renovación de mapas** (layouts de columnas por
arena + palancas que activan trampas). Antes de empezar, leer `CLAUDE.md`.

---

## 0. Estado actual (para situarse rápido)

**Hecho (pasos 1–3 del orden de trabajo):** disposiciones de columnas por arena
con selector en la sala (y "Al azar"), arenas Desguace (cajas rompibles) y
Núcleo (columnas que suben a los 30 s), entidad `Prop` con vida (`w.props`),
estado "por los aires" (`w.launchUp`), palancas y las 5 trampas
(`src/shared/traps.ts`) con IA que las usa y las esquiva. Las cintas
transportadoras de la Fábrica quedan pendientes.

**Hecho (tanda 1):** Arquibot, Gatlinga y Boomera con su arte. Mecánicas de
motor nuevas: carga al soltar (`SkillDef.charge`, `f.chargeK`), calor
(`ChampDef.heat`, `w.addHeat`), cargas (`SkillDef.charges`), movilidad hacia
atrás (`SkillDef.back`), daño potenciado (`dmgUp`), marca (`markT`/`markBy`),
anclaje (`anchor`), proyectiles que vuelven (`ret`, `turnBack`), rebotan
(`bounces`), arrastran (`carry`) o atraviesan objetos (`ghost`), y
`w.nearWall`. Desviaciones del diseño: Flecha 7→21 en 1 s, Lluvia 1,5 s de 4,
Rotativa 5 de daño y 4 de calor, el Bumerán recarga 1,4 s (atraparlo la
reinicia), Atrapada perfecta también hace volver los bumeranes en vuelo y la
trazadora reduce el calor a la mitad mientras dura la marca.

**Hecho (tanda 2):** Sniperix, Ignis y Bombi con su arte. Motor: skills
mantenidas (`SkillDef.hold`, `f.hold`; la cámara del cliente se adelanta con
el visor), ceguera (`blindFor`: desvío y −30% de alcance en `aimOf`),
quemaduras (`w.burn`), reducción de daño absorbido (`guard`/`absorbed`),
autoralentización (`selfSlow`), bomba pegada que salta (`f.sticky`) y
proyectiles con mecha y fricción (`fuse`, `fric`, `onWall`). La IA sale de
charcos, radiación, nukes y bombas enemigas (`AVOID` en traps.ts).
Desviaciones: Ignis 205 de vida, −15% de velocidad al lanzar llamas, 75 px de
cono y Postcombustión de 110 px; granada 14 de daño en 20 px cada 0,7 s;
Traje ignífugo devuelve 0,4 × lo absorbido; el Gancho sin enganche da un
saltito; el riel gira despacio hacia la mira durante la carga.

- 10 campeones en `src/shared/data.ts` (`CHAMPS`), comportamiento en
  `src/shared/skills.ts` (`SKILLS` + `CHANNELS` para canalizaciones).
- Slots fijos: `r2` básico (mantener), `l2` secundaria, `a` movilidad, `x`/`y`
  skills, `b` definitiva (100 de energía). **No pasar de 6 skills.**
- Mecánicas del motor que **ya existen** (no repetirlas como "lo único" de un
  campeón nuevo): bloqueo frontal (Beetlix), contraataque (Nekobot), devolver
  proyectiles (Sawkuwa), cúpula antibalas (Nexus), muro de fuego, miedo, sueño,
  silencio, inmovilizar, aturdir, ralentizar, empujar, empotrar contra muro
  (`slam`), garfio que atrae, sigilo, niebla intocable, drenaje canalizado,
  torreta, cepo, zonas con aviso, rayo en cadena, teletransporte a la espalda,
  blink, salto, obús en parábola, singularidad que atrae, curas/escudos/robo de
  vida, torbellino que sigue al robot (`follow`).
- Columnas: `w.pillars`, sacadas de `LAYOUTS` según la arena y la disposición.
- Equilibrio: `bun run sim` (bots difíciles, 1v1 todos contra todos + 2v2
  aleatorio). Objetivo: cada campeón entre ~35% y ~62%. Con 20 campeones subir
  el número de partidas (`bun run sim 10` o más) porque el ruido crece.

### Arte necesario
Los 10 campeones actuales reutilizan los 10 robots de Survivors. **Los 10 nuevos
necesitan robot nuevo** en `ROBOT_ART` (`src/client/art.ts`): cuerpo de ~16×13
caracteres + 3 poses de piernas, mirando a la derecha, paleta propia y contorno
automático. Revisar con `bun run preview-art`. Diseños originales (nada de
Medabots ni Battlerite). Cada ficha de abajo incluye silueta y paleta orientativa.
También harán falta ~60 iconos de 10×10 en `ICONS` y algunos sprites de
proyectil en `PROJ_ART`.

---

## 1. Mecánicas nuevas de motor (agrupadas)

Hacerlas primero, de forma genérica en `world.ts`, y luego montar los campeones
encima. Entre paréntesis, quién las usa.

| Mecánica | Descripción técnica | Usan |
|---|---|---|
| **Carga al soltar** | `SkillDef.charge = { min, max }`: mientras se mantiene el botón el robot carga (va lento); al **soltar** dispara con potencia según el tiempo cargado. Necesita detectar el flanco de bajada de `input.b` en `updateFighter` (ya se guarda `prevB`). Mostrar barra de carga en el HUD y sobre la cabeza. | Arquibot |
| **Calor / sobrecalentamiento** | Recurso propio por campeón (`f.heat 0..100`) que sube al disparar y baja solo; a 100 se bloquea el `r2` 1,5 s. Mandar `heat` en `FSnap` y pintarlo en la barra del HUD. | Gatlinga, Ignis |
| **Canal mantenido** | Variante de `CHANNELS` que dura **mientras se mantenga** el botón (hasta un máximo), no un tiempo fijo. Corta si se suelta. | Ignis, Prisma (definitiva) |
| **Proyectil que vuelve** | `Proj.ret`: al agotar el alcance invierte la velocidad hacia la posición actual del dueño, con `hit` reseteado (golpea a la ida y a la vuelta). Si el dueño lo "atrapa" (dist < 10) llama a `onCatch`. | Boomera |
| **Rebotes** | `Proj.bounces`: al chocar con pilar o borde, refleja la velocidad respecto a la normal (pilar: normal radial; elipse: gradiente `(x/rx², y/ry²)`). | Boomera, Prisma, Bombi |
| **Granada con mecha** | Proyectil con fricción que rebota y explota a los X s (o al tocar enemigo si se configura). | Bombi |
| **Objetos desplegables con vida** | Nuevo tipo de entidad `Prop` (`hp`, equipo, bloquea movimiento y/o proyectiles, se puede destruir). Proyectiles y cuerpo a cuerpo de **cualquier equipo** le hacen daño. Snapshot: lista `pp`. | Gatlinga (barricada), Bombi (barril), Resonix (altavoz), Prisma (espejo), Golemax (pilar de roca) |
| **Por los aires (knock-up)** | Estado `air` impuesto por otro: el robot sube y baja (como `Motion.air` pero sin desplazarse), no puede actuar y **no se le puede tocar** salvo con skills marcadas `hitsAirborne`. | Golemax, Magnetra |
| **Agarrar y lanzar** | `f.carrying: Fighter`: el agarrado sigue la posición del que agarra (encima de la cabeza), no actúa; al volver a pulsar o al acabar el tiempo, se lanza hacia la mira con `knock` + `slam`. | Golemax |
| **Cargas de skill** | `SkillDef.charges = n`: la recarga repone una carga cada vez; HUD con numerito. | Boomera (A), Bombi (X) |
| **Revelar / cegar** | `reveal`: anula el sigilo en un área. `blind`: el cegado ve su mira desviada aleatoriamente (su `aimOf` añade ruido) y su alcance cae un 30%. | Arquibot, Sniperix, Prisma |
| **Marcas con polaridad** | `f.mark = { kind, t, src }` genérico. Polaridad +/−: dos marcados con signo opuesto se atraen hasta chocar (aturden ambos); con el mismo signo se repelen. | Magnetra |
| **Desviar trayectorias** | Zona que curva los proyectiles enemigos que la atraviesan (aplica una aceleración lateral a `vx/vy`). | Magnetra |
| **Bomba pegada** | Objeto pegado a un robot (`f.sticky`) que explota a los X s; si toca a otro enemigo, salta a él. | Bombi |
| **Ritmo** | Reloj de pulso en el mundo (`w.beat`) con el bpm de la pista de la arena (pasar el bpm a `World` desde `ARENAS`). Acertar un disparo cerca del pulso da bonus. El cliente hace parpadear un indicador en el HUD al pulso. | Resonix |
| **Controles invertidos (mareo)** | Estado `daze`: invierte `mx/my` del afectado. | Resonix |
| **Gancho al terreno** | Proyectil que si choca con pilar o borde arrastra **al dueño** hasta ese punto. | Sniperix |
| **Desplazar la cámara** | Al apuntar con visor, la cámara local se desplaza hacia la mira (sólo en cliente; en sofá limitarlo para no expulsar a los demás del encuadre). | Sniperix |
| **Rayo dirigible** | Zona-rayo cuya dirección gira hacia la mira actual a velocidad limitada (rad/s) mientras dura. | Prisma |
| **Atravesar obstáculos** | Flag `Proj.ghost` / rayo que ignora pilares. Aviso visible para todos. | Sniperix |

> Regla de oro (como hasta ahora): toda amenaza fuerte debe **verse venir**:
> zona con aviso, tiempo de lanzamiento con barra o sonido característico.

---

## 2. Los 10 campeones nuevos

8 tiradores, 1 soporte a distancia y 1 cuerpo a cuerpo. Números de partida
(afinar con `bun run sim`). Vida de referencia: tiradores 160–180, soporte 175,
melee 200+. Velocidad 58–64 (movimiento pausado).

Formato: **slot — nombre** · recarga · lanzamiento · efecto. `ai:` pista para
`SkillDef.ai`.

---

### 2.1 Arquibot — Arquera (tiradora de precisión con carga)
*Robot cervatillo de madera y cobre con arco largo de energía.* Paleta: cobre
`#c87a3a`, madera `#8a5a2b`, energía verde lima `#b8ff5f`. Silueta: orejas/astas
pequeñas, capa corta, arco más alto que ella.

**Mecánica propia:** el básico **se carga al mantener y dispara al soltar**.

- **R2 — Flecha cargada** · sin recarga · carga 0–0,9 s (va al 50% de velocidad
  mientras carga). Daño 7 → 24, velocidad 300 → 700, alcance 170 → 300 según
  carga. A carga completa la flecha brilla y **atraviesa** al primer enemigo.
  `ai: poke` (la IA suelta al llegar a ~0,7 s).
- **L2 — Lluvia de flechas** · 7 s · 0,3 s · zona en el suelo (r 34, alcance
  220) con aviso de 0,5 s; luego 2 s de flechas: 5 de daño cada 0,25 s y −20%
  velocidad. `ai: zone`.
- **A — Voltereta** · 8 s · salto **hacia atrás** respecto a la mira (alejarse
  sin dejar de apuntar), 90 px, intocable en el aire. Recarga el primer 50% de
  la carga del arco. `ai: escape`.
- **X — Flecha clavadora** · 10 s · 0,25 s · flecha rápida, 10 de daño. Si el
  enemigo acaba a menos de 30 px de un pilar o del borde, queda **clavado 1,6 s**
  (inmovilizado); si no, sólo −40% velocidad 1,2 s. `ai: cc`.
- **Y — Ojo de halcón** · 14 s · instantáneo · 4 s: +20% daño, revela invisibles
  en 160 px y la mira muestra la línea de rebote/alcance exacta. `ai: defend`.
- **B — Flecha de tormenta** · definitiva · 0,7 s · flecha enorme (ancho 14)
  que cruza toda la arena atravesando enemigos: 22 de daño +1 por cada 10 px
  recorridos hasta impactar (máx. 45). `ai: ult`.

### 2.2 Gatlinga — Ametralladora pesada (tiradora sostenida)
*Robot rechoncho con ametralladora rotativa en el brazo y depósito de munición
a la espalda.* Paleta: oliva `#6b7a3a`, latón `#d8a820`, rojo de aviso
`#ff3b4e`. Silueta: ancha y baja, cañones grandes.

**Mecánica propia:** **calor**. El básico acelera cuanto más se mantiene y
sobrecalienta; varias skills gastan o usan el calor.

- **R2 — Rotativa** · cadencia 0,28 → 0,1 s según el tiempo mantenido · 4 de
  daño, dispersión creciente. +6 de calor por bala; a 100 se bloquea 1,5 s (el
  arma echa humo). `ai: poke`.
- **L2 — Purga de vapor** · 6 s · 0,2 s · cono corto (60 px) de vapor: 6 de daño
  + 0,25 por punto de calor, y **vacía** el calor. Empuja un poco. `ai: melee`.
- **A — Retroceso** · 9 s · dispara al suelo y sale despedida 85 px en
  dirección **contraria** a la mira; 8 de daño en un pequeño cono delante.
  `ai: escape`.
- **X — Barricada** · 14 s · 0,3 s · despliega un muro de chapa (Prop, 60 HP,
  largo 40) perpendicular a la mira que bloquea movimiento y proyectiles de
  **ambos** equipos. Dura 8 s o hasta romperse. `ai: defend`.
- **Y — Bala trazadora** · 10 s · 0,15 s · proyectil rápido: 6 de daño y marca
  4 s: tus balas hacen +30% al marcado y tu calor no sube al dispararle.
  `ai: cc`.
- **B — Modo torreta** · definitiva · se ancla 3 s (no se mueve, gira): cadencia
  máxima sin calor, balas de 6 que **atraviesan** barricadas y escudos.
  `ai: ult`.

### 2.3 Sniperix — Francotiradora (alcance extremo)
*Robot alto y delgado, casco con visor de un solo ojo rojo, capa de camuflaje.*
Paleta: gris pizarra `#4a5068`, camuflaje `#5a6b3a`, ojo `#ff3b4e`. Silueta: muy
vertical, rifle más largo que ella.

**Mecánica propia:** **visor** (alcance y cámara) y movilidad con gancho al
terreno.

- **R2 — Rifle** · 1,1 s · 0,25 s · bala de 18 de daño, velocidad 800, alcance
  260. Lento pero letal. `ai: poke`.
- **L2 — Visor** · mantener · mientras se mantiene: inmóvil, la cámara se
  desplaza hacia la mira y el siguiente disparo del rifle tiene alcance 420, +8
  de daño y deja una estela visible. Soltar sin disparar no gasta nada.
  `ai: poke` (la IA lo usa a > 220 px).
- **A — Gancho de anclaje** · 10 s · lanza un cable (alcance 160): si toca pilar
  o borde, **te arrastra** hasta allí; si toca a un enemigo, 6 de daño y nada
  más. `ai: escape`.
- **X — Cable trampa** · 12 s · 0,4 s · tiende un láser entre tu posición y el
  punto marcado (máx. 110 px), invisible para el enemigo salvo un parpadeo cada
  2 s. Quien lo cruza: 12 de daño, revelado y −50% velocidad 1,5 s. Dura 12 s.
  `ai: zone`.
- **Y — Bengala** · 13 s · 0,2 s · bengala a una zona (r 50): revela invisibles
  6 s y **ciega** 1,5 s a los enemigos dentro al estallar. `ai: cc`.
- **B — Cañón de riel** · definitiva · canal 1,2 s con línea de aviso visible
  para todos · rayo que **atraviesa pilares y barricadas**: 55 de daño.
  `ai: ult`.

### 2.4 Boomera — Lanzadora de bumeranes
*Robot ágil con antenas curvas y dos bumeranes de acero a la espalda.* Paleta:
turquesa `#2ec4b6`, amarillo `#ffd23f`, acero `#c9cfdc`.

**Mecánica propia:** proyectiles que **vuelven** y **rebotan**; premia atrapar
sus propias armas.

- **R2 — Bumerán** · 0,7 s · 0,15 s · va (alcance 170) y vuelve hacia ti: 8 de
  daño a la ida y 8 a la vuelta. Si lo atrapas, la recarga del R2 se reinicia.
  `ai: poke`.
- **L2 — Chakram** · 5 s · 0,25 s · disco que **rebota 3 veces** en pilares y
  bordes: 12 de daño por impacto (cada enemigo sólo una vez por rebote).
  `ai: poke` (la IA lo lanza contra pilares cercanos al enemigo).
- **A — Deslizamiento** · 2 cargas, 6 s cada una · dash corto (60 px).
  `ai: escape`.
- **X — Gran bumerán** · 11 s · 0,35 s · bumerán grande y lento que **arrastra**
  consigo a los enemigos que golpea a la ida (los suelta al girar): 10 de daño.
  `ai: cc`.
- **Y — Atrapada perfecta** · pasiva activable 8 s · durante 2 s, cada bumerán
  que atrapes te cura 8 y reduce 2 s todas tus recargas. `ai: defend`.
- **B — Huracán de cuchillas** · definitiva · 6 bumeranes orbitan a tu
  alrededor 3 s abriéndose en espiral (radio 20 → 80): 9 de daño por pasada.
  `ai: ult`.

### 2.5 Ignis — Lanzallamas (tirador corto, zona)
*Robot bombero reconvertido: casco con visera, depósito de combustible, boquilla
enorme.* Paleta: rojo bombero `#c0392b`, cromo `#dfe4ee`, llama `#ff8a2b`.

**Mecánica propia:** **canal mantenido** + charcos que quedan en el suelo +
calor compartido con Gatlinga (misma implementación).

- **R2 — Llamarada** · canal mientras se mantiene · cono de 70 px: 3 de daño
  cada 0,1 s (30/s). Sube calor; sobrecalentado 1,5 s. Velocidad al 70%.
  `ai: melee` (rango 70).
- **L2 — Napalm** · 6 s · 0,3 s · bote que deja un charco ardiendo 4 s (r 30,
  alcance 160): 8/s y −15% velocidad. `ai: zone`.
- **A — Postcombustión** · 9 s · dash 90 px dejando rastro de fuego 2 s (4/s).
  `ai: gap`.
- **X — Bomba de calor** · 12 s · 0,2 s · coloca una bomba; **volver a pulsar X**
  la detona (r 40, 18 de daño + 30% del calor actual como daño extra). Si nadie
  la detona, explota sola a los 5 s. `ai: zone`.
- **Y — Traje ignífugo** · 13 s · 2 s: reduce el daño recibido un 40% y lo
  convierte en calor; al acabar suelta una onda (r 45) de 0,3 × daño absorbido.
  `ai: defend`.
- **B — Anillo infernal** · definitiva · anillo de fuego (r 90 → 30 en 2,5 s)
  centrado en el punto marcado: quien toque el borde recibe 20 y queda en llamas
  (4/s, 3 s). Encierra al enemigo. `ai: ult`.

### 2.6 Prisma — Tiradora de luz (rebotes y ángulos)
*Robot de cristal facetado con núcleo de luz que cambia de color.* Paleta: cian
claro `#bff6ff`, magenta `#ff7bd5`, blanco. Silueta: cabeza de diamante.

**Mecánica propia:** **rayos que rebotan** en pilares y en sus propios espejos.

- **R2 — Haz** · 0,6 s · 0,15 s · rayo instantáneo (alcance 200) que rebota
  **una vez** en pilares/borde: 9 de daño, +4 si impacta tras el rebote.
  `ai: poke`.
- **L2 — Espejo** · 10 s · 0,25 s · coloca un espejo (Prop, 40 HP, 6 s)
  orientado perpendicular a la mira. Tus haces se reflejan en él; los
  proyectiles enemigos también rebotan (puede volverse en tu contra).
  `ai: zone`.
- **A — Destello** · 9 s · blink de 80 px que **ciega** 1 s a los enemigos a
  menos de 40 px del punto de salida. `ai: escape`.
- **X — Prisma divisor** · 9 s · 0,25 s · orbe que al chocar (enemigo, pilar o
  alcance máximo) se divide en 3 haces en abanico: 10 + 3×7 de daño.
  `ai: poke`.
- **Y — Refracción** · 14 s · 1,2 s translúcida: los proyectiles **te
  atraviesan** (no las zonas ni el cuerpo a cuerpo). Puedes seguir disparando.
  `ai: defend`.
- **B — Rayo solar** · definitiva · canal hasta 3 s · rayo grueso desde el cielo
  sobre la mira que **sigue al cursor** a 90 px/s: 25/s. `ai: ult`.

### 2.7 Magnetra — Controladora magnética
*Robot con dos imanes en U como brazos y anillos flotando sobre la cabeza.*
Paleta: rojo imán `#ff3b4e`, azul imán `#4fb4ff`, metal `#9aa0b0`.

**Mecánica propia:** **polaridad** (+/−) y desviar trayectorias.

- **R2 — Pulso** · 0,5 s · 0,15 s · bola magnética: 9 de daño; alterna
  polaridad en cada disparo (roja/azul) y aplica esa marca 3 s.
  `ai: poke`.
- **L2 — Atracción / repulsión** · 6 s · activa las marcas: dos enemigos con
  polaridad **opuesta** se atraen y chocan (12 de daño y 1 s de aturdimiento a
  ambos); con la **misma**, se repelen con fuerza (empotrables). En 1v1 actúa
  entre el enemigo marcado y tú (te acercas o lo alejas). `ai: cc`.
- **A — Levitación** · 9 s · salto magnético de 100 px; si apuntas a un pilar,
  te "pegas" a él y saltas al lado opuesto. `ai: escape`.
- **X — Campo desviador** · 13 s · zona (r 45, 3 s) que **curva** los
  proyectiles enemigos que la cruzan hacia fuera. `ai: defend`.
- **Y — Imán absorbente** · 12 s · 1,5 s: los proyectiles enemigos en 60 px se
  desvían hacia ti y son **absorbidos** (cada uno te da 6 de escudo y 5 de
  energía). `ai: defend`.
- **B — Tormenta magnética** · definitiva · zona grande (r 70) a los 0,6 s:
  levanta por los aires 1 s a los enemigos, les quita los escudos y los
  silencia 1,5 s. `ai: ult`.

### 2.8 Bombi — Granadera (artillería de rebote)
*Robot redondo como una bomba, mecha en la cabeza, cinturón de granadas.*
Paleta: negro azulado `#2a2e44`, naranja mecha `#ff8a2b`, rojo `#ff3b4e`.
Silueta: esférica con piernas cortas.

**Mecánica propia:** **granadas con mecha** que ruedan y rebotan; bombas
pegajosas; barriles que cualquiera puede detonar.

- **R2 — Granada** · 0,8 s · 0,2 s · rueda/rebota y explota a los 1 s o al tocar
  un enemigo: 12 de daño en r 18. `ai: poke`.
- **L2 — Bomba lapa** · 8 s · 0,3 s · se **pega** al enemigo y explota a los 2 s
  (22 de daño, r 26); si el portador toca a otro enemigo, salta a él.
  `ai: cc`.
- **A — Salto explosivo** · 9 s · explosión bajo sus pies que la lanza 100 px
  (intocable en el aire); 8 de daño al despegar. `ai: escape`.
- **X — Minas saltarinas** · 2 cargas, 7 s · mina que salta hacia el enemigo
  que pase a 35 px: 14 de daño. `ai: zone`.
- **Y — Barril explosivo** · 12 s · coloca un barril (Prop, 20 HP) que explota
  al romperse (30 de daño, r 40) — **cualquier equipo** puede detonarlo
  disparándole. `ai: zone`.
- **B — Mini nuke** · definitiva · 0,4 s · bomba que tarda 2,5 s en estallar
  (aviso enorme con cuenta atrás): 45 de daño en r 60 y deja suelo radiactivo
  3 s (5/s). `ai: ult`.

### 2.9 Resonix — Soporte sónico (ritmo)
*Robot con altavoces en los hombros, auriculares y una guitarra-teclado.*
Paleta: violeta `#7a3aff`, rosa neón `#ff3b9e`, dorado `#ffd23f`.

**Mecánica propia:** **ritmo**. Los disparos hechos en el pulso de la música
(±90 ms) hacen +50%; el HUD muestra un metrónomo. Primer campeón que conecta la
música con el gameplay.

- **R2 — Nota** · 0,5 s · 0,1 s · onda de sonido: 9 de daño a enemigos **o** 8
  de curación a aliados (como la semilla de Florak); en el pulso, +50% y deja
  un eco que repite el efecto a los 0,5 s. `ai: poke`.
- **L2 — Altavoz** · 12 s · 0,3 s · coloca un altavoz (Prop, 35 HP, 7 s) que
  **repite tus notas** desde su posición hacia el enemigo más cercano.
  `ai: zone`.
- **A — Onda expansiva** · 9 s · dash de 80 px; empuja 30 px a los enemigos
  junto al punto de salida. `ai: escape`.
- **X — Canción de vida** · 14 s · canal 2 s · aura (r 60): aliados +10/s y
  −20% de daño recibido. `ai: heal`.
- **Y — Grito sónico** · 11 s · 0,2 s · cono (90 px): empuja 50 px y silencia
  1 s. `ai: cc`.
- **B — Concierto final** · definitiva · 4 s: aliados en 120 px ganan +25%
  velocidad y −40% recargas; enemigos en 120 px quedan **mareados**
  (controles invertidos) 1,5 s al empezar. `ai: ult`.

### 2.10 Golemax — Gólem agarrador (cuerpo a cuerpo)
*Robot enorme de piedra y hierro, brazos larguísimos, núcleo de lava en el
pecho.* Paleta: piedra `#7a7068`, hierro `#4a4f66`, lava `#ff8a2b`. Silueta:
ocupa más ancho que los demás (cuerpo de ~18 columnas).

**Mecánica propia:** **agarrar y lanzar**, crear terreno y levantar por los
aires.

- **R2 — Puñetazo** · 0,6 s · 0,15 s · golpe en arco (alcance 26): 13 de daño.
  `ai: melee`.
- **L2 — Agarre** · 9 s · 0,25 s · coge al enemigo de delante (alcance 30) y lo
  lleva encima 1,5 s (no actúa). **Pulsar de nuevo L2 lo lanza** hacia la mira
  (120 px): 14 de daño y, si choca contra pilar o muro, aturdido 1,2 s
  (reutiliza `slam`). `ai: melee`.
- **A — Carga imparable** · 10 s · carga de 110 px sin que la paren
  aturdimientos ni empujones; arrolla (10 de daño, aparta). `ai: gap`.
- **X — Pilar de roca** · 13 s · 0,3 s · levanta un pilar temporal (Prop, 80 HP,
  6 s) en el punto marcado: bloquea todo y sirve para empotrar. `ai: zone`.
- **Y — Terremoto** · 10 s · 0,4 s · grieta en línea (120 px): 14 de daño y
  **por los aires** 0,8 s. `ai: cc`.
- **B — Puño del titán** · definitiva · salta al punto marcado (150 px): al caer,
  30 de daño en r 50 y por los aires 1 s; deja la grieta 3 s (−30% velocidad).
  `ai: ult`.

---

## 3. Mapas: layouts de columnas y palancas con trampas

No se diseñan arenas nuevas: se reaprovechan las 3 actuales (y las temáticas
`scrap` y `core` de `tiles.ts`, que ya existen sin usar) cambiando **la
disposición de columnas** y añadiendo **palancas** que activan una trampa propia
de cada arena.

### 3.1 Cambios técnicos

1. `PILLARS` deja de ser global: `ARENAS[i].layouts: Layout[]`, con
   `Layout = { name, pillars: Pillar[], levers: Lever[] }`. El layout se elige en
   la sala (botón "Layout: …" junto a Arena, o aleatorio) y viaja en
   `WorldOpts` → `World.pillars`.
2. Sustituir los usos de `PILLARS` en `world.ts` (`moveTo`, proyectiles,
   `clearLine`), `ai.ts` (indirectamente vía `clearLine`) y `renderer.ts` por
   `w.pillars` / `snap.layout`. Añadir `layout: number` al `Snap` y a los
   mensajes de sala (`mode`) en `protocol.ts` y `server.ts`.
3. `Pillar` admite `r` variable y `kind` (`"pillar" | "crate" | "post"`): las
   cajas (`crate`) tienen HP y se rompen (reutilizar la entidad Prop de la
   sección 1). El horneado de pilares en `tiles.ts` (`bakePillar`) ya recibe el
   radio; generar uno por tamaño.
4. Simetría obligatoria: todo layout debe ser simétrico respecto a x = 0 (un
   equipo por lado) para que sea justo. Validarlo con un test en
   `tools/sim-test.ts` (comparar victorias del lado azul y rojo).

### 3.2 Layouts propuestos (coordenadas de mundo, arena 290×165)

| Layout | Columnas | Idea |
|---|---|---|
| **Clásico** (actual) | (±115, ±78) r 11 | Equilibrado, cuatro esquinas. |
| **Rombo** | (0, ±95) r 13 · (±150, 0) r 11 | Centro abierto para el orbe, cobertura delante de cada salida. |
| **Pasillos** | (±70, ±55) r 9 · (±70, 0) r 9 | Dos "pasillos" centrales: premia skills en línea y empotrar. |
| **Corona** | 6 columnas pequeñas r 8 en círculo de radio 90 alrededor del orbe | Pelea por el centro, rebotes (Boomera, Prisma). |
| **Desguace** (tema `scrap`) | (±110, ±70) r 11 + 4 cajas rompibles (±40, ±110) | Cobertura que se destruye durante la ronda. |
| **Núcleo** (tema `core`) | ninguna columna fija; 2 columnas que suben del suelo a los 30 s en (±80, 0) | Arena abierta que cambia a mitad de ronda. |

### 3.3 Palancas y trampas

**Palanca:** entidad nueva `Lever { x, y, cd, t, prog }`. Se activa
**quedándose encima 1 s** (barra de progreso como el antiguo altar de
Survivors) **o golpeándola** con cualquier ataque. Después, recarga de 25 s (se
ve apagada). Una palanca por lado, simétricas (p. ej. en (±200, ±120)). Al
activarse: cartel ("¡TRAMPA DE LA FÁBRICA!"), sonido y aviso en el suelo de
~1 s antes de que la trampa haga nada (regla de oro: que se vea venir).

**Las trampas dañan a todos por igual** (no distinguen equipos): la gracia es
activarla cuando el rival está en mala posición. La IA debe conocerlas: evitar
las zonas avisadas (añadir a la esquiva de `ai.ts`) y activar la palanca si un
enemigo está dentro de la zona de la trampa y ella no.

| Arena | Trampa | Efecto |
|---|---|---|
| **Parque Robattle** | **Géiseres de los aspersores** | 5 círculos (r 18) repartidos por la mitad rival se marcan 1 s y lanzan por los aires 0,8 s a quien esté encima (8 de daño). Usa el estado "por los aires". |
| **Fábrica Omega** | **Prensa hidráulica** + **cintas** | Una prensa cae en la franja central (x ∈ [−25, 25]) tras 1,2 s de aviso: 35 de daño y aturdido 1 s. Variante del layout "Pasillos": las cintas transportadoras de las franjas de peligro empujan 20 px/s mientras la palanca esté activa 6 s. |
| **Ciudad Neón** | **Rejilla láser** | 3 láseres horizontales (y = −80, 0, 80) se avisan 1 s y barren la arena de izquierda a derecha en 1,5 s: 20 de daño y −40% velocidad. Saltos y niebla los esquivan. |
| **Desguace** | **Grúa electroimán** | Un imán recorre la arena 3 s y atrae robots y proyectiles de metal (todos) hacia su sombra; al soltar, deja caer chatarra (r 25, 25 de daño). |
| **Núcleo** | **Pulso de medalla** | El orbe central emite un anillo que se expande: hay que saltarlo, cruzarlo intocable o estar detrás de una columna. 18 de daño. |

### 3.4 Arte de mapas
- Palanca: sprite de 8×12 en tres estados (apagada / cargando / activada), con
  los colores del muro de cada temática (`WALLS` en `tiles.ts`).
- Avisos de trampa: reutilizar el estilo de `firestorm`/`lob` (aro que
  parpadea y se rellena) para que el lenguaje visual sea coherente.
- Columnas de distintos radios: `bakePillar(theme, r)` ya sirve; cachear por r.
- Cajas rompibles: sprite de 3 estados de daño.

---

## 4. Orden de trabajo recomendado

1. Layouts por arena (sección 3.1–3.2) + elección en la sala. Es independiente y
   mejora la variedad enseguida.
2. Entidad `Prop` con vida (la usan cajas, barricadas, espejos, altavoces,
   barriles y pilares de roca).
3. Palancas + 1 trampa (empezar por la prensa de la Fábrica), luego el resto.
4. Mecánicas de proyectil: vuelta, rebote, mecha (Boomera, Bombi, Prisma).
5. Campeones en tandas de 3–4, con su robot, iconos y equilibrio en cada tanda:
   - Tanda 1: Arquibot, Gatlinga, Boomera (carga, calor, vuelta/rebote).
   - Tanda 2: Sniperix, Ignis, Bombi.
   - Tanda 3: Prisma, Magnetra, Resonix, Golemax.
6. Sala: con 20 campeones, el selector de la sala necesita una rejilla de
   retratos (2 filas de 10) en lugar de la fila de botones, y la ficha debe
   seguir cabiendo sin scroll en 1080p.
7. Tras cada tanda: `bun run check`, `bun run sim 10`, revisar en el
   navegador con `?play=<campeón>,<rival>&full` y commit.
