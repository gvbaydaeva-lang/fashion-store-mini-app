# Fashion Store Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать внутри существующего статического Telegram Mini App законченную демонстрационную админ-панель для управления товарами, черновиками, публикацией, остатками и сборкой одного локального заказа.

**Architecture:** Приложение остаётся без фреймворков, сборщика, сервера и новых зависимостей. Чистая административная бизнес-логика добавляется в `core.js`, интерфейс и события — в `app.js`, демонстрационные изменения каталога сохраняются в отдельном ключе `localStorage`, а покупатель видит только опубликованные позиции. Реальная авторизация, база данных, Storage и платёжные callback не имитируются и остаются будущим production-этапом.

**Tech Stack:** HTML5, CSS, vanilla JavaScript, Telegram Mini Apps SDK, `localStorage`, Node.js `node:test`.

**Spec:** `brief.md`, раздел 15 «Пошаговый план доработки админ-панели».

## Global Constraints

- Интерфейс полностью на русском языке.
- Минимальная область нажатия — 44 × 44 px.
- Целевые ширины — 320, 375 и 430 px без горизонтальной прокрутки.
- Сохраняются текущие светлая и тёмная темы, safe areas, `BackButton` и `prefers-reduced-motion`.
- Используются текущие `Cormorant`, `Manrope`, винный акцент и локальные fashion-изображения.
- Нельзя использовать `initDataUnsafe` как настоящую авторизацию.
- Нельзя называть локальные товары, остатки, заказы и доступ production-функциями.
- Без отдельного согласования не добавляются backend, Supabase, npm-зависимости, фреймворк и сборщик.
- До пользовательского просмотра нельзя выполнять commit или push.

---

### Task 1: Чистая бизнес-логика административного каталога

**Files:**
- Modify: `tg-app/core.js`
- Modify: `tg-app/tests/core.test.js`

**Interfaces:**
- Produces: `createAdminCatalog(products)`, `getPublishedProducts(products)`, `filterAdminProducts(products, query, status)`, `buildProductVariants(colors, sizes, previousVariants)`, `validateAdminProduct(product, step)`, `duplicateAdminProduct(product, id)`, `getAdminProductStatus(product)`.
- Consumes: существующая форма товара из `data.js`.

- [ ] **Step 1: Написать падающие тесты каталога и фильтрации**

```js
test('покупатель получает только опубликованные товары', () => {
  const products = [
    { id: 'one', adminStatus: 'published' },
    { id: 'two', adminStatus: 'draft' },
  ];
  assert.deepEqual(getPublishedProducts(products).map(({ id }) => id), ['one']);
});

test('админский поиск не зависит от регистра и фильтрует черновики', () => {
  const products = [
    { id: 'one', name: 'Платье Миди', adminStatus: 'published', variants: [] },
    { id: 'two', name: 'Жакет Софт', adminStatus: 'draft', variants: [] },
  ];
  assert.deepEqual(filterAdminProducts(products, 'ЖАКЕТ', 'draft').map(({ id }) => id), ['two']);
});
```

- [ ] **Step 2: Запустить тест и подтвердить RED**

Run: `node --test tg-app/tests/core.test.js`

Expected: FAIL, потому что административные функции ещё не экспортируются.

- [ ] **Step 3: Реализовать создание каталога, публикацию и фильтрацию**

```js
function createAdminCatalog(products) {
  return products.map((product) => ({ ...product, adminStatus: 'published' }));
}

function getPublishedProducts(products) {
  return products.filter(({ adminStatus }) => adminStatus === 'published');
}
```

`filterAdminProducts` фильтрует по нормализованному названию и одному из значений `all`, `published`, `draft`, `out`.

- [ ] **Step 4: Написать падающие тесты матрицы вариантов**

```js
test('матрица создаёт все сочетания и сохраняет прежний остаток', () => {
  const result = buildProductVariants(
    [{ id: 'black', name: 'Чёрный', hex: '#242424' }],
    ['S', 'M'],
    [{ colorId: 'black', size: 'S', stock: 3 }],
  );
  assert.deepEqual(result, [
    { colorId: 'black', size: 'S', stock: 3, enabled: true },
    { colorId: 'black', size: 'M', stock: 0, enabled: true },
  ]);
});
```

- [ ] **Step 5: Запустить тест и подтвердить RED**

Run: `node --test tg-app/tests/core.test.js`

Expected: FAIL на отсутствующей `buildProductVariants`.

- [ ] **Step 6: Реализовать матрицу вариантов**

Функция строит декартово произведение `colors × sizes`, сохраняет существующий целый остаток, создаёт новый остаток `0` и не мутирует входные массивы.

- [ ] **Step 7: Написать падающие тесты валидации и копирования**

```js
test('публикация требует фото, название, цену, размер и вариант', () => {
  assert.deepEqual(validateAdminProduct({ images: [], name: '', price: 0, colors: [], sizes: [], variants: [] }, 4), {
    images: 'Загрузи хотя бы одно фото',
    name: 'Добавь название товара',
    price: 'Добавь цену',
    colors: 'Укажи хотя бы один цвет',
    sizes: 'Укажи хотя бы один размер',
  });
});

test('похожий товар становится черновиком и не переносит остатки', () => {
  const copy = duplicateAdminProduct({
    id: 'old', name: 'Платье', adminStatus: 'published',
    variants: [{ colorId: 'black', size: 'S', stock: 4 }],
  }, 'new');
  assert.equal(copy.id, 'new');
  assert.equal(copy.adminStatus, 'draft');
  assert.equal(copy.variants[0].stock, 0);
});
```

- [ ] **Step 8: Запустить тест и подтвердить RED**

Run: `node --test tg-app/tests/core.test.js`

Expected: FAIL на отсутствующих функциях.

- [ ] **Step 9: Реализовать валидацию, копирование и вычисление статуса**

`validateAdminProduct` возвращает объект ошибок по полям. `duplicateAdminProduct` создаёт независимые вложенные массивы, добавляет «Копия» к названию, сбрасывает остатки и ставит `draft`. `getAdminProductStatus` возвращает `draft`, `out` или `published`.

- [ ] **Step 10: Запустить полный набор тестов**

Run: `node --test tg-app/tests/*.test.js`

Expected: PASS, 0 failures.

---

### Task 2: Локальное состояние и связь с покупательским каталогом

**Files:**
- Modify: `tg-app/app.js`
- Modify: `tg-app/tests/core.test.js`

**Interfaces:**
- Consumes: функции Task 1.
- Produces: состояние `state.adminProducts`, `state.adminDraft`, ключ `fashion-store-admin-products-v1`, функции `getCatalogProducts()`, `saveAdminProducts()`, `startAdminDraft(product)`.

- [ ] **Step 1: Добавить тест нормализации исходного каталога**

Тест подтверждает, что `createAdminCatalog` создаёт независимые вложенные массивы и не изменяет `Data.PRODUCTS`.

- [ ] **Step 2: Запустить тест и подтвердить RED**

Run: `node --test tg-app/tests/core.test.js`

Expected: FAIL, если вложенные массивы разделяют ссылки.

- [ ] **Step 3: Исправить нормализацию минимальным клонированием**

Клонировать `images`, `colors`, `variants` и `measurements`.

- [ ] **Step 4: Добавить административное состояние в `app.js`**

При запуске читать только массив корректных товаров из `fashion-store-admin-products-v1`, иначе создавать административный каталог из `Data.PRODUCTS`. Ошибка `localStorage` не должна ломать запуск.

- [ ] **Step 5: Перевести покупательские чтения на опубликованный каталог**

`getProduct`, главная, каталог, фильтры и карточки используют `getCatalogProducts()`. Черновик не появляется у покупателя, опубликованный локальный товар появляется сразу после публикации.

- [ ] **Step 6: Запустить полный набор тестов и синтаксическую проверку**

Run:

```bash
node --check tg-app/app.js
node --test tg-app/tests/*.test.js
```

Expected: PASS, 0 failures.

---

### Task 3: Вход и мобильная оболочка админ-панели

**Files:**
- Modify: `tg-app/app.js`
- Modify: `tg-app/styles.css`
- Modify: `tg-app/ui.js`
- Modify: `tg-app/tests/ui.test.js`

**Interfaces:**
- Produces: экраны `seller-access`, `seller-products`, `seller-orders`, общая функция `sellerShell(section, content)` и действия навигации.

- [ ] **Step 1: Написать падающий тест новых SVG-иконок**

```js
test('админ-панель использует SVG для поиска, камеры и меню', () => {
  for (const name of ['search', 'camera', 'image', 'more', 'edit', 'copy']) {
    assert.match(icon(name), /^<svg /);
  }
});
```

- [ ] **Step 2: Запустить тест и подтвердить RED**

Run: `node --test tg-app/tests/ui.test.js`

Expected: FAIL, потому что новых иконок ещё нет.

- [ ] **Step 3: Добавить SVG-пути и пройти GREEN**

Run: `node --test tg-app/tests/ui.test.js`

Expected: PASS.

- [ ] **Step 4: Реализовать честный экран demo-доступа**

Экран показывает, что серверной авторизации нет, и предлагает **«Открыть демо-панель»** или **«Вернуться в магазин»**. Он не изображает успешную серверную проверку.

- [ ] **Step 5: Реализовать общую оболочку**

Верхняя часть: `Демо-управление`, заголовок, кнопка выхода. Ниже: переключатель **«Товары / Заказы»** с областями нажатия 44 px. Покупательская нижняя навигация скрыта.

- [ ] **Step 6: Проверить синтаксис и существующие тесты**

Run:

```bash
node --check tg-app/ui.js
node --check tg-app/app.js
node --test tg-app/tests/*.test.js
```

Expected: PASS, 0 failures.

---

### Task 4: Список товаров, поиск, фильтры и меню товара

**Files:**
- Modify: `tg-app/app.js`
- Modify: `tg-app/styles.css`

**Interfaces:**
- Consumes: `filterAdminProducts`, `getAdminProductStatus`.
- Produces: `renderSellerProducts()`, `renderAdminProductRow(product)`, `openAdminProductMenu(productId)`.

- [ ] **Step 1: Реализовать экран товаров**

Добавить крупную кнопку **«Добавить товар»**, строку поиска, чипы **«Все»**, **«Опубликованы»**, **«Черновики»**, **«Нет в наличии»**, карточки-строки 64 × 80 px и пустое состояние.

- [ ] **Step 2: Реализовать действия списка**

Тап по карточке открывает редактор. Поиск обновляется по `input`. Чип меняет фильтр. Кнопка `⋯` открывает нижнюю панель.

- [ ] **Step 3: Реализовать меню товара**

Действия: **«Редактировать»**, **«Как увидит покупатель»**, **«Создать похожий»**, **«Отмена»**. Копия сразу открывается на шаге 1 как несохранённый черновик.

- [ ] **Step 4: Проверить keyboard focus и области нажатия**

Каждая строка и кнопка имеют `:focus-visible`, а высота интерактивных элементов не меньше 44 px.

- [ ] **Step 5: Запустить синтаксис и тесты**

Run:

```bash
node --check tg-app/app.js
node --test tg-app/tests/*.test.js
```

Expected: PASS, 0 failures.

---

### Task 5: Четырёхшаговый редактор товара

**Files:**
- Modify: `tg-app/app.js`
- Modify: `tg-app/styles.css`

**Interfaces:**
- Consumes: `buildProductVariants`, `validateAdminProduct`.
- Produces: экран `seller-product-edit`, `renderAdminEditor()`, `saveAdminFormFields(form)`, `saveAdminDraft(status)`, обработчики фото и вариантов.

- [ ] **Step 1: Реализовать фирменную ленту прогресса**

Показывать **«Шаг N из 4»**, названия четырёх шагов и винную линию прогресса. На экране остаётся одна главная нижняя кнопка.

- [ ] **Step 2: Реализовать шаг 1 «Фото и название»**

Поля: локальное фото, название, категория. Поддержать камеру/галерею через `accept="image/*"`, `capture="environment"`, максимум 4 изображения и размер одного файла до 800 КБ. Ошибка не очищает форму.

- [ ] **Step 3: Реализовать шаг 2 «Цена и описание»**

Поля: цена, старая цена, описание, состав, посадка, уход. Для цен использовать `inputmode="numeric"`.

- [ ] **Step 4: Реализовать шаг 3 «Цвета, размеры и остатки»**

Доступные цвета задаются подписанными чипами с hex-значениями, размеры — `XS–XL`. Матрица автоматически перестраивается, сохраняет введённые остатки, группируется по цвету и не использует широкую таблицу.

- [ ] **Step 5: Реализовать шаг 4 «Проверка»**

Показать настоящую покупательскую карточку из данных черновика и список конкретных ошибок. Действия: **«Исправить»**, **«Сохранить черновик»**, **«Опубликовать»**.

- [ ] **Step 6: Реализовать черновик и публикацию**

Черновик разрешает неполные данные, но сохраняет безопасные значения. Публикация выполняется только без ошибок. После сохранения обновляется `state.adminProducts`, `localStorage`, список товаров и покупательский каталог.

- [ ] **Step 7: Реализовать защиту от потери данных**

BackButton между шагами возвращает на предыдущий шаг. Выход с изменённым черновиком открывает подтверждение. Во время сохранения главная кнопка блокируется.

- [ ] **Step 8: Запустить синтаксис и полный набор тестов**

Run:

```bash
node --check tg-app/app.js
node --test tg-app/tests/*.test.js
```

Expected: PASS, 0 failures.

---

### Task 6: Заказы в общей административной оболочке

**Files:**
- Modify: `tg-app/app.js`
- Modify: `tg-app/styles.css`
- Modify: `tg-app/tests/core.test.js`

**Interfaces:**
- Consumes: существующие `createDemoOrder`, `markOrderReady`.
- Produces: обновлённые `renderSellerOrders()`, `renderSellerOrder()`, подтверждение **«Да, заказ собран»**.

- [ ] **Step 1: Добавить тест идемпотентности готового заказа**

Тест повторно вызывает `markOrderReady` для `ready` и подтверждает, что статус остаётся `ready`, а входной объект не мутирует.

- [ ] **Step 2: Запустить тест и подтвердить его смысл**

Run: `node --test tg-app/tests/core.test.js`

Expected: PASS как характеристика уже существующей чистой функции; этот тест защищает интеграцию от будущей регрессии, а не вводит новое поведение.

- [ ] **Step 3: Перенести список заказов в общую оболочку**

Сохранить вкладки **«Собрать»** и **«Готовы»**, добавить счётчики, номер, время, покупателя, сумму и способ получения.

- [ ] **Step 4: Доработать карточку и подтверждение**

Показать состав, контакт, получение, итог и одно действие **«Заказ собран»**. Подтверждение использует текст **«Да, заказ собран»**. После успеха заказ перемещается в **«Готовы»**, повторная кнопка отсутствует.

- [ ] **Step 5: Запустить полный набор тестов**

Run: `node --test tg-app/tests/*.test.js`

Expected: PASS, 0 failures.

---

### Task 7: Документация, автоматическая и визуальная проверка

**Files:**
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Create: `CHANGELOG.md`
- Verify only: `.env.example`
- Verify: `tg-app/index.html`, `tg-app/styles.css`, `tg-app/data.js`, `tg-app/core.js`, `tg-app/ui.js`, `tg-app/app.js`

**Interfaces:**
- Consumes: все предыдущие задачи.
- Produces: проверяемое описание реально работающего demo-MVP и ссылка на предпросмотр.

- [ ] **Step 1: Синхронизировать документацию**

README описывает новые демонстрационные возможности и точный путь проверки. ARCHITECTURE описывает административное состояние, ключ `localStorage` и границу безопасности. CHANGELOG содержит только новую запись `Unreleased`. `.env.example` остаётся без новых ключей, потому что статический модуль не использует env.

- [ ] **Step 2: Запустить полный автоматический gate**

Run:

```bash
node --check tg-app/data.js
node --check tg-app/core.js
node --check tg-app/ui.js
node --check tg-app/app.js
node --test tg-app/tests/*.test.js
git diff --check
```

Expected: PASS, 0 failures, 0 whitespace errors.

- [ ] **Step 3: Запустить локальный сервер**

Run: `python3 -m http.server 4173 --directory tg-app`

Expected: `http://localhost:4173/` возвращает HTTP 200.

- [ ] **Step 4: Выполнить визуальный чек-лист в браузере**

Проверить 320, 375 и 430 px; отсутствие горизонтальной прокрутки; светлую и тёмную темы; каталог → админка → новый черновик → публикация → покупательский товар; создание похожего; demo-заказ → **«Заказ собран»**; BackButton; клавиатуру; ошибки в консоли; `prefers-reduced-motion`.

- [ ] **Step 5: Подготовить ссылку для пользовательского просмотра**

Сначала предоставить локальную или preview-ссылку. Не выполнять commit и push до явного подтверждения пользователя после просмотра.

---

## Финальный самопроверочный чек-лист

### Статус проверки 28 августа 2026 года

- [x] Чистая административная бизнес-логика реализована через RED → GREEN тесты.
- [x] Реальный `app.js` загружается и рендерит вход, список товаров и редактор в DOM-smoke-тесте.
- [x] Все 34 автоматических теста проходят.
- [x] Четыре JavaScript-файла проходят `node --check`.
- [x] `git diff --check` не находит ошибок пробелов.
- [x] Локальный сервер возвращает HTTP 200 через `localhost` и локальный Wi‑Fi IP.
- [x] `brief.md`, `research.md` и `.env.example` не изменены.
- [x] Commit и push не выполнялись.
- [ ] Визуально проверить 320, 375 и 430 px — встроенный браузер в текущей сессии недоступен.
- [ ] Проверить светлую и тёмную темы в настоящем браузере.
- [ ] Пройти полный сценарий кликами по предоставленной ссылке.
- [ ] Проверить внутри Telegram на физических устройствах iOS и Android.
- [ ] Получить пользовательское подтверждение перед commit и push.

### Функциональность

- [ ] Демо-вход честно предупреждает об отсутствии серверной авторизации.
- [ ] Есть две зоны: **«Товары»** и **«Заказы»**.
- [ ] Поиск и четыре фильтра товаров работают.
- [ ] Карточка товара показывает фото, название, цену, цвета, остаток и статус.
- [ ] Четыре шага редактора сохраняют введённые данные.
- [ ] Фото загружается с телефона или из галереи в рамках demo-лимитов.
- [ ] Матрица `цвет × размер` строится автоматически.
- [ ] Черновик не виден покупателю.
- [ ] Опубликованный товар виден покупателю сразу.
- [ ] Предпросмотр совпадает с покупательской карточкой по данным.
- [ ] **«Создать похожий»** не переносит остатки и не публикует копию.
- [ ] Очередь показывает оплаченный demo-заказ только в **«Собрать»**.
- [ ] **«Заказ собран»** переносит заказ в **«Готовы»** один раз.

### Интерфейс и доступность

- [ ] Весь пользовательский текст на русском языке.
- [ ] Все интерактивные области не меньше 44 × 44 px.
- [ ] Нет горизонтальной прокрутки на 320, 375 и 430 px.
- [ ] Админка выглядит частью «Фэшн стор», а не desktop-сайтом.
- [ ] Светлая и тёмная темы читаемы.
- [ ] Safe areas и закреплённые действия не перекрывают контент.
- [ ] BackButton и видимая кнопка назад ведут предсказуемо.
- [ ] Видимый `:focus-visible` сохранён.
- [ ] `prefers-reduced-motion` отключает необязательное движение.
- [ ] Пустые, ошибочные и загрузочные состояния понятны.

### Безопасность и честность

- [ ] В коде нет токенов, паролей и персональных данных.
- [ ] `initDataUnsafe` не используется как авторизация.
- [ ] Демо-доступ не называется защищённым.
- [ ] Локальные товары, остатки и заказы не называются production-данными.
- [ ] Настоящая оплата, backend и синхронизация не заявлены реализованными.
- [ ] `.env.example` не содержит выдуманных или неиспользуемых переменных.

### Проверки

- [ ] Все четыре `node --check` завершились с кодом 0.
- [ ] Все тесты завершились без ошибок.
- [ ] `git diff --check` не нашёл проблем.
- [ ] В консоли браузера нет ошибок.
- [ ] Полный покупательский и административный путь пройден вручную.
- [ ] Пользователю выдана ссылка до commit/push.
- [ ] Commit/push не выполнялись без отдельного подтверждения пользователя.
