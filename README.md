# Skill Lab

**Un laboratorio isométrico en el panel de VS Code donde ves trabajar a Claude Code.** Cada skill es un muñeco que duerme en su litera y, cuando Claude la usa, va andando al puesto del proyecto en el que estás trabajando. Las sesiones de Claude aparecen como robots que te cuentan qué están haciendo.

![El laboratorio de día, con puestos de ejemplo](images/day.png)

## Qué hace

- **Una skill, un muñeco.** Cuando una sesión usa una skill, el muñeco sale de las literas, va al puesto de ese proyecto y, al terminar el turno, vuelve a dormir.
- **Un puesto por proyecto.** Cada carpeta de proyecto puede tener su puesto, con su tema: laboratorio, gimnasio, cafetería, biblioteca, arcade, cuartel o zona de fumadores. Las sesiones abiertas en esa carpeta trabajan allí.
- **Sesiones en directo.** Cada sesión de Claude Code es un robot con un bocadillo que indica si está pensando, escribiendo, leyendo, ejecutando, delegando o esperando tu respuesta. Los subagentes también salen.
- **Avisos.** Suena un aviso cuando Claude termina un turno o se queda esperando un permiso.
- **Día y noche.** La luz cambia según la hora real; si lo prefieres, puedes dejarlo siempre de día o siempre de noche.
- **Detalles para curiosear.** Gatos con nombre, muñecos que se pueden arrastrar, una papelera y medallas escondidas para quien las encuentre.

![El mismo laboratorio de noche](images/night.png)

## Instalación

1. Descarga `skill-lab-0.9.1.vsix` de la última [release](https://github.com/AlvaroMDX/skill-lab/releases/latest).
2. En VS Code: **Extensiones → ··· → Install from VSIX…** y elige el fichero.
   También desde un terminal: `code --install-extension skill-lab-0.9.1.vsix`.
3. Recarga la ventana (**Developer: Reload Window**).

Para compilarla desde el código:

```bash
npm install
npx esbuild@0.24.0 src/extension.ts --bundle --platform=node --format=cjs --external:vscode --outfile=dist/extension.js
npx @vscode/vsce@3.2.1 package
```

## Cómo se usa

1. Abre la pestaña **Skill Lab** del panel inferior.
2. La primera vez, un asistente te pide la carpeta donde guardas tus proyectos y crea un puesto por cada subcarpeta que marques.
3. Trabaja con Claude Code como siempre: el laboratorio se mueve solo.
4. Usa estos controles:
   - **Rueda** o **+ / −**: zoom. **Arrastrar el fondo**: desplazar el mapa.
   - **Clic en un muñeco**: ver su nombre. **Doble clic**: abrir su ficha.
   - **+ Agent**: lanzar una sesión nueva de Claude Code en una carpeta.
   - **Layout**: crear, quitar o reordenar puestos, cambiar el tema, el ancho y la fila, y fijar skills a un puesto concreto.

![El cajón Layout para organizar puestos y skills](images/layout.png)

## Configuración

Casi todo se ajusta desde el propio panel, en **Layout** y **Settings**. Además, en los ajustes de VS Code (`skillLab.*`) puedes cambiar:

| Ajuste | Para qué sirve |
| --- | --- |
| `skillLab.sound` | Activar o quitar el aviso sonoro de fin de turno y de permisos. |
| `skillLab.watchAllSessions` | Ver las sesiones de cualquier carpeta o solo las del workspace abierto. |
| `skillLab.showPet` / `skillLab.cats` | Mostrar los gatos, con su nombre y su pelaje. |
| `skillLab.clockMode` | Ciclo de día y noche automático, siempre de día o siempre de noche. |
| `skillLab.claudeCommand` | Ejecutable de Claude Code para **+ Agent** (vacío: el de la extensión de Claude Code). |
| `skillLab.skipPermissions` | Lanzar los agentes sin pedir permisos. Úsalo solo si aceptas el riesgo. |

La distribución de puestos se guarda en `~/.claude/skill-lab/config.json`.

## Requisitos

- VS Code 1.90 o posterior.
- Claude Code (CLI o extensión de VS Code) usándose en la misma máquina.

## Privacidad

Skill Lab lee las transcripciones locales de Claude Code (`~/.claude/projects`) para saber qué skills se usan y qué hace cada sesión. Todo se procesa en tu equipo: no envía nada a ningún servidor.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `Skill Lab: Redibujar` | Vuelve a pintar el laboratorio. |
| `Skill Lab: Lanzar Claude Code (+ Agent)` | Abre una sesión nueva en la carpeta que elijas. |
| `Skill Lab: Editar layout (labs y skills)` | Abre el cajón para organizar puestos y skills. |

---

Autor: **Alvaro Martos Diez** · Las capturas usan puestos y skills de ejemplo.
