# Robattle Arena

Battle arena **1v1 y 2v2** por rondas al estilo *Battlerite*, con los robots y
la estética pixel art de **Robattle Survivors**. Todas las skills se apuntan
(skill shots), el movimiento es pausado y cada campeón tiene **6 skills**.
Bun + HTML + CSS + TypeScript, Canvas 2D y todo el arte y el sonido generados
en código.

## Jugar

```bash
bun install
bun run dev        # http://localhost:3000 (recarga en caliente)
bun run start      # modo producción
bun run build      # ejecutable en dist/robattle-arena
```

- **Jugar (1v1 / 2v2)**: sala local. Cada mando pulsa **A / ✕** para unirse y el
  teclado con **Intro**. Los huecos vacíos los ocupan bots (Fácil, Normal o
  Difícil), así que sirve para solitario contra la CPU, sofá en versus o
  cooperativo contra bots.
- **Multijugador LAN**: el servidor muestra las IPs de tu red; los demás abren
  esa dirección, entran con el código de 4 letras de la sala y eligen hueco y
  campeón. Los huecos libres son bots: el anfitrión elige su campeón (◀ ▶ o 🎲)
  y su dificultad desde el propio hueco.

## Controles

| Acción | Teclado + ratón | Mando |
|---|---|---|
| Moverse | WASD | Stick izquierdo / cruceta |
| Apuntar | Ratón | Stick derecho (cuanto más lo empujas, más lejos) |
| Ataque básico (mantener) | Clic izquierdo | **RT / R2** |
| Skill secundaria | Clic derecho | **LT / L2** |
| Movilidad | ESPACIO | **A / ✕** |
| Skill 1 | Q | **X / ▢** |
| Skill 2 | E | **Y / △** |
| Definitiva (energía llena) | R o F | **B / ○** (o RB) |
| Pausa | ESC / P | Start |

Con mando hay una ayuda a la puntería suave (desactivable en Opciones). Si no
tocas el stick derecho, se apunta hacia donde caminas.

## Reglas

- Gana la ronda el equipo que deja al otro fuera de combate; la partida, el
  primero en llegar a las rondas elegidas (3 por defecto).
- Lanzar una skill con tiempo de lanzamiento te frena: hay que elegir bien.
- La **energía** se carga haciendo daño o curando y se conserva entre rondas;
  con la barra llena se puede usar la definitiva.
- A los 18 s salen **cápsulas de reparación** arriba y abajo; a los 40 s, el
  **Orbe Medalla** en el centro (el equipo que lo rompe se cura y gana
  energía); a los 80 s empieza la **muerte súbita** y la arena se cierra.
- Los pilares bloquean el paso y los proyectiles.

## Campeones

| | Rol | Kit |
|---|---|---|
| **Beetlix** | Luchador | Cuernazo en combo, golpe sísmico que ralentiza, embestida, caparazón que bloquea de frente, grito de guerra con escudo y *Meteoro escarabajo* (salto que aturde). |
| **Coltron** | Tirador | Revólver, tiro certero cargado, salto de pólvora, cepo, disparo aturdidor que silencia y *Ráfaga explosiva*. |
| **Merlix** | Mago | Bola de fuego, tormenta ígnea telegrafiada, teletransporte, muro de fuego que frena balas, puño fundido y *Rayo infernal*. |
| **Florak** | Soporte | Semilla que daña o cura, flor sanadora, rodar, burbuja de savia (escudo), polen somnífero y *Jardín ancestral*. |
| **Nekobot** | Asesina | Zarpazos rápidos, garfio que atrae, salto felino, sigilo, contraataque *Siete vidas* y *Frenesí*. |
| **Sawkuwa** | Espadachín | Tajo doble, corte lunar que atraviesa, paso fantasma, *Guardia espejo* que devuelve los proyectiles, pinza que lanza al enemigo a tu espalda y *Mil cortes* (torbellino). |
| **Tanker** | Artillero | Ametralladora, obús en parábola, orugas que arrollan, blindaje, bala de cañón que aturde si empotra contra un muro y *Bombardeo*. |
| **Vladbot** | Vampiro | Murciélagos que roban vida, *Drenar* canalizado, forma de niebla, enjambre, mirada que asusta y *Luna de sangre*. |
| **Nexus** | Tecnomante | Descarga, torreta automática, propulsores, cúpula que frena las balas enemigas, rayo en cadena y *Singularidad* que atrae. |
| **Shinobot** | Ninja | Shurikens, abanico de kunais, sustitución con tronco, kunai que te lleva a la espalda del enemigo, bomba de humo que vuelve invisibles a los aliados y *Danza de las sombras*. |

La ficha completa de cada skill (daño, recarga, tiempo de lanzamiento) está en
el menú **Campeones** y en la sala.

## Estructura

```
server.ts               servidor Bun: cliente, salas LAN y simulación a 60 Hz (30 instantáneas/s)
src/shared/data.ts      arena, rondas y campeones (todos los números de equilibrio)
src/shared/skills.ts    comportamiento de cada skill
src/shared/world.ts     simulación: movimiento, proyectiles, zonas, estados, rondas
src/shared/ai.ts        bots
src/client/main.ts      menús, sala local/LAN, bucle de partida, HUD
src/client/renderer.ts  dibujo en canvas de baja resolución escalado a enteros
src/client/tiles.ts     arena horneada (suelo temático, muro, gradas con público)
src/client/input.ts     teclado+ratón y cada mando por separado
tools/sim-test.ts       partidas bot contra bot para el equilibrio
```
