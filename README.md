# Analizador WhatsApp — Respuestas y tiempos por ticket

App **separada** de Sestel, sin dependencias. Analiza el `.txt` exportado de un grupo de
WhatsApp y reporta por **ticket/código**: quién solicita, quién responde, en cuánto tiempo
y qué quedó pendiente.

Todo se procesa **en tu navegador, 100% local**. El archivo nunca se sube a ningún servidor.

## Uso

1. En WhatsApp: Grupo → Nombre del grupo → **Exportar chat → Sin archivos** → obtienes un `.txt`.
2. Abre la app publicada en GitHub Pages (ver despliegue abajo) o `index.html` en local.
3. Arrastra el `.txt` o usa **Ver ejemplo** para probar con datos ficticios.
4. Ajusta la **ventana de respuesta** (4h / 8h / 24h / 7d) y el filtro
   **Solo contar respuesta del equipo de soporte** + el roster sugerido.
5. Filtra por estado/confianza/búsqueda, abre el **detalle** de cada ticket y
   **exporta CSV/JSON** para Excel o reportes.

## Qué es un ticket

- 8–9 dígitos que empiezan con `15` o `16` (ej. `15159299`, `16265379`).
- Normaliza prefijos `00` y `GTM-`: `GTM-0015174351` → `15174351`.
- Los seriales de equipo (`73…`, `83…`, de 10 dígitos) **no** cuentan como ticket.

## Cómo se detecta la respuesta

- **Solicitud** = primer mensaje que menciona el código. El autor es el **solicitante**.
- **Respuesta** = primer mensaje posterior de **otro autor** dentro de la ventana que:
  - repite el mismo código → confianza **alta**, o
  - parece confirmación/gestión (`listo`, `ok`, `quedó`, `te apoyo`, `qué error…`, `ca/cm/bbi/mta…` + números) → confianza **alta/media**.
- Los mensajes que abren **otro ticket distinto** se omiten (son otra solicitud, no tu respuesta).
- **Pendiente** = nadie respondió dentro de la ventana.

> En grupos muy activos la atribución secuencial puede confundir tickets cruzados.
> Revisa la columna **Conf.** y el detalle con la línea de tiempo antes de reportar.

## Despliegue (GitHub Pages)

No requiere compilación. Una vez subido a GitHub:

1. Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main` → carpeta `/ (root)` → Save.
2. La app queda en `https://<usuario>.github.io/whatsapp-analyzer/`.

## Desarrollo local

```powershell
# opción 1: abrir directo (funciona con file://)
start index.html

# opción 2: servidor local
npx serve .
```

## Archivos

| Archivo      | Qué hace                                                     |
| ------------ | ------------------------------------------------------------ |
| `index.html` | Estructura + dashboard                                       |
| `styles.css` | Tema oscuro                                                  |
| `parser.js`  | Parser + análisis (reutilizable en Node: `require('./parser.js')`) |
| `app.js`     | UI, filtros, gráfica, CSV/JSON                               |

## Limitaciones conocidas

- WhatsApp Cloud API **no** puede leer grupos existentes, por eso este analizador es por export `.txt`.
- Tiempos con resolución de **minuto** (el export no trae segundos): una respuesta dentro
  del mismo minuto se muestra como **< 1 min**; el resto es aproximado ±1 min.
- Mensajes `Se eliminó / Se editó` se excluyen.
