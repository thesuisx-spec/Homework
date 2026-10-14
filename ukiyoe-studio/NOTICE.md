# Ukiyo-e Studio: лицензии и благодарности

Приложение некоммерческое. Сторонние компоненты распространяются по своим лицензиям:

| Компонент | Лицензия | Где лежит |
|---|---|---|
| Electron и Chromium | MIT и лицензии Chromium | встроены в сборку (`LICENSES.chromium.html`) |
| mp4-muxer © Vanilagy | MIT | `renderer/vendor/mp4-muxer.js` |
| Shippori Mincho © FONTDASU | SIL Open Font License 1.1 | `renderer/fonts/OFL-shipporimincho.txt` |
| Yuji Syuku © Kinuta Font Factory | SIL Open Font License 1.1 | `renderer/fonts/OFL-yujisyuku.txt` |
| PT Serif © ParaType | SIL Open Font License 1.1 | `renderer/fonts/OFL-ptserif.txt` |

Источники вдохновения:

- **Стиль гравюры** (палитра, правила печати, движения камеры, звуковая палитра) взят из описания стиля
  `ukiyoe` проекта [Lemo Opuscar](https://github.com/lemomo-ai/lemo-opuscar) от LemoLab (MIT). Его код не используется.
- **Принцип «одного дубля»** (без склеек, сквозной персонаж, неравные сцены) взят из описания
  [OneTake](https://github.com/feitangyuan/onetake). Его код не используется.

Весь код движка печати, гравюр, путника, музыки и экспорта написан для этого приложения.
Музыка синтезируется на лету: в приложении нет сэмплов и записей.
