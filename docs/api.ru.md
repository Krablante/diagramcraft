# Node API

[English](./api.md) · [Русский](./api.ru.md) · [Главная](../README.ru.md)

Библиотека — основной интерфейс Dorpie; CLI лишь добавляет к ней разбор аргументов и файловый ввод-вывод. Пакет — чистый ESM, поэтому используйте `import`:

```js
import { render } from "dorpie";
```

Установка из релизного tarball или прямо из репозитория:

```sh
npm install https://github.com/Krablante/dorpie/releases/download/v0.5.0/dorpie-0.5.0.tgz
# или, следя за main:
npm install github:Krablante/dorpie
```

## render

```js
import { render } from "dorpie";

const { svg, png, ascii } = await render(spec, {
  theme: "paper",                 // id встроенной темы, путь к файлу темы или раскрытый объект темы
  formats: ["svg", "png", "ascii"],
  scale: 2,
  transparent: false,
  systemFonts: false,
  charset: "unicode",
});
```

`render(input, options)` принимает объект спеки или JSON-строку и возвращает Promise. На диск ничего не пишет. Для сохранённых диаграмм, версий исходников и экспортов используйте `createLibrary` из `dorpie` или лёгкого входа `dorpie/library`; см. [library.ru.md](./library.ru.md).

| Опция | Тип | По умолчанию | Смысл |
| --- | --- | --- | --- |
| `theme` | string или object | `theme` из спеки | Id встроенной темы, путь к файлу или объект темы с `id` и `title`; пропущенные токены берутся из основы. |
| `formats` | array | `output.formats` из спеки, затем `["svg"]` | Какие форматы получить; пустой массив тоже откатывается к значению по умолчанию. |
| `scale` | number | `output.scale` из спеки, затем `2` | Множитель масштаба PNG. |
| `transparent` | boolean | `output.transparent` из спеки, затем `false` | Убрать фон холста в SVG и PNG. |
| `systemFonts` | boolean | `false` | Разрешить системные шрифты при растрировании PNG. |
| `charset` | `unicode` или `ascii` | `output.charset` из спеки, затем `unicode` | Набор символов для ASCII-вывода. |

Результат содержит:

| Поле | Тип | Примечание |
| --- | --- | --- |
| `spec` | Spec | Нормализованная спека с подставленными значениями по умолчанию. |
| `theme` | Theme | Раскрытая тема с учётом переопределений `spec.style`. |
| `model` | Model | Геометрия раскладки: позиции и размеры узлов, маршруты связей, зоны и границы холста. |
| `svg` | string | Строка создаётся всегда, даже если запрошены только PNG или ASCII. |
| `png` | Buffer | Есть, когда `formats` включает `png`. |
| `ascii` | string | Есть, когда `formats` включает `ascii`. |

```js
import { render } from "dorpie";

const result = await render(
  {
    title: "Деплой",
    nodes: [
      { id: "start", kind: "terminal", label: "Пуш в main" },
      { id: "ship", kind: "terminal", label: "Выкатка" },
    ],
    edges: [{ from: "start", to: "ship" }],
  },
  { theme: "paper", formats: ["svg", "png"], scale: 2 },
);

result.svg;  // string
result.png;  // Buffer
```

## parseSpec и SpecError

`parseSpec(raw)` проверяет и нормализует объект спеки без рендера. Он бросает `SpecError` с массивом `issues`; у каждой проблемы есть JSON-путь `path` и понятное `message`:

```js
import { parseSpec, SpecError } from "dorpie";

try {
  const spec = parseSpec(JSON.parse(text));
  // spec.nodes, spec.edges, spec.groups, spec.output, ...
} catch (error) {
  if (error instanceof SpecError) {
    for (const { path, message } of error.issues) {
      console.error(`${path}: ${message}`);
    }
  }
  throw error;
}
```

Если JSON-строка передана сразу в `render`, некорректный JSON выбросит `SyntaxError` из `JSON.parse` до валидации; используйте `parseSpec(JSON.parse(text))`, если хотите обработать оба случая.

## Темы в коде

```js
import { listThemes, getTheme, loadThemeFile, ThemeError } from "dorpie";

listThemes();
// [{ id, title, description, tags, order }, ...] в порядке отображения

const theme = getTheme("light");                  // раскрытая встроенная тема
const custom = loadThemeFile("./my-theme.json");  // раскрытая своя тема поверх базовых значений
```

`getTheme` возвращает общий кешированный объект: считайте его read-only или клонируйте перед изменением токенов (`structuredClone(getTheme("paper"))`). `loadThemeFile` разрешает относительные пути от `process.cwd()`. Оба бросают `ThemeError` при неизвестном id, отсутствующем файле или некорректном JSON темы.

Для точечных правок предпочитайте `spec.style` — он глубоко сливается с раскрытой темой и не требует файла:

```js
await render({ ...spec, style: { fonts: { title: { color: "#4338ca" } } } });
```

## Экспорты нижнего уровня

Большинству достаточно `render`, но весь конвейер публичен и его можно запускать по шагам.

| Экспорт | Сигнатура | Назначение |
| --- | --- | --- |
| `parseSpec` | `(raw) => Spec` | Проверить и нормализовать спеку; бросает `SpecError`. |
| `layoutSpec` | `async (spec, theme, options?) => Model` | Посчитать геометрию слоистым движком раскладки. |
| `renderSvg` | `(model, theme, spec, options?) => string` | Отрендерить геометрию в SVG; `options.transparent` убирает фон. |
| `renderAscii` | `async (spec, theme, options?) => string` | Отрендерить в символьную сетку; `options.charset` — `unicode` или `ascii`. |
| `svgToPng` | `(svg, options?) => Buffer` | Растрировать SVG; `options`: `scale`, `systemFonts`, `fontFiles`. |
| `bundledFontFiles` | `() => string[]` | Абсолютные пути встроенных OFL-шрифтов. |
| `listThemes`, `getTheme`, `loadThemeFile`, `ThemeError` | помощники тем | См. выше. |

```js
import { parseSpec, getTheme, layoutSpec, renderSvg, svgToPng } from "dorpie";

const spec = parseSpec(rawSpec);
const theme = getTheme("blueprint");
const model = await layoutSpec(spec, theme);
const svg = renderSvg(model, theme, spec, { transparent: true });
const png = svgToPng(svg, { scale: 3 });
```

`renderAscii` заново раскладывает диаграмму в символьном пространстве, поэтому его модель отличается от пиксельной, хотя обе строятся из одной спеки.

## Побочные эффекты и детерминизм

`render` никогда не пишет файлы, не открывает браузер и не делает сетевых запросов. Одна и та же спека с одной темой даёт одну и ту же SVG-строку; PNG и ASCII тоже детерминированы, потому что PNG использует встроенные шрифты, а не системные. Единственный доступ к файлам — чтение тем, метрик и встроенных шрифтов.

Параметры проверяются до раскладки: неизвестный формат, неположительный масштаб, неверный набор символов и небулевы переключатели дают `SpecError`. Загрузка темы проверяет размеры шрифтов и основные отступы, необходимые раскладке; непригодные значения дают `ThemeError`.

Затраты PNG растут с площадью холста: удвоение `scale` даёт вчетверо больше пикселей, а тени и текстуры добавляют свою стоимость. Для больших диаграмм выбирайте SVG, для превью PNG — масштаб 1. `render` всегда создаёт пиксельную геометрию и SVG; запрос ASCII добавляет ещё одну раскладку ELK и символьную сетку. Если при встраивании нужен только ASCII, вызывайте `renderAscii(parseSpec(raw), getTheme("mono"))` напрямую. Его стоимость растёт с площадью ограничивающего прямоугольника сетки, включая пустые ячейки.
