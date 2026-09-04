# Карточка товара: варианты, доступность и мобильная компоновка — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Показывать в карточке все опубликованные цветовые варианты, корректно связывать каждый цвет со своими остатками и сделать цвет/размер видимыми сразу на мобильном экране.

**Architecture:** Источником доступности остаются опубликованные товары и их `variants` из API. В `app.js` группировка будет включать все опубликованные варианты одной `groupId`, а состояние выбранного цвета будет синхронизироваться с открытым вариантом. Разметка передаст количество размеров в CSS-модификатор, чтобы один размер занимал всю строку, а несколько раскладывались по три.

**Tech Stack:** Статический JavaScript без фреймворка, CSS Grid, Node.js test runner, Supabase Edge catalog API.

**Spec:** Визуальный эталон пользователя — прикреплённое изображение `2026-09-03 11.40.37.jpg`; текстовые требования — сообщение пользователя от 03.09.2026.

## Global Constraints

- Не добавлять фреймворк, сборщик, сервер или npm-зависимости.
- Заказывать можно только вариант с `enabled !== false` и `stock > 0`.
- Товар со статусом `published` показывается даже при нулевых остатках, но его варианты недоступны к заказу.
- Минимальная область нажатия интерактивных элементов — 44 × 44 px.
- После изменения кода обновить README, ARCHITECTURE и CHANGELOG.
- Перед публикацией пройти все JS-тесты, `git diff --check`, локальный HTTP smoke-check и проверить GitHub Actions/опубликованные assets.

### Task 1: Воспроизводимый тест группировки опубликованных цветов

**Files:**
- Modify: `tg-app/tests/app-smoke.test.js`
- Modify: `tg-app/app.js`

**Interfaces:**
- `getProductGroup(product)` возвращает все опубликованные товары с тем же `groupId`, включая товары, у которых все варианты имеют `stock: 0`.
- Кнопка цвета остаётся видимой и кликабельной для просмотра; недоступный цвет получает `aria-disabled="true"` и визуальный класс `is-unavailable`, но не HTML-атрибут `disabled`, чтобы пользователь мог открыть его карточку. Заказ такого цвета блокируется отдельно.

- [ ] **Step 1: Write the failing test** — добавить fixture с двумя опубликованными товарами одной группы: у первого остаток есть, у второго все остатки нулевые; после открытия первого проверить, что HTML содержит оба названия цвета и недоступная кнопка помечена `aria-disabled="true"`.
- [ ] **Step 2: Run test to verify it fails** — `node --test --test-name-pattern='опубликованные цвета без остатка остаются видимыми' tg-app/tests/app-smoke.test.js`; ожидается FAIL, потому что текущий `getProductGroup` фильтрует группу по `stock > 0`.
- [ ] **Step 3: Write minimal implementation** — убрать из `getProductGroup` фильтр по наличию остатка; в `renderProduct` вычислять доступность каждого grouped option по его активным вариантам и добавлять `aria-disabled` и визуальный класс `is-unavailable`, сохранив кликабельность. В обработчике `selectProductOption` позволять открыть недоступный цвет для просмотра, а заказ блокировать отдельной проверкой остатка.
- [ ] **Step 4: Run test to verify it passes** — повторить команду из шага 2 и затем `node --test tg-app/tests/app-smoke.test.js`.
- [ ] **Step 5: Commit** — `git add tg-app/app.js tg-app/tests/app-smoke.test.js && git commit -m "fix: keep published out-of-stock colors visible"`.

### Task 2: Надёжное отображение остатков и переключение между карточками цвета

**Files:**
- Modify: `tg-app/app.js`
- Modify: `tg-app/tests/app-smoke.test.js`
- Modify: `tg-app/tests/core.test.js` (если для чистой логики потребуется отдельная проверка)

**Interfaces:**
- У каждой цветовой карточки используется её собственный `productId`, `colorId` и набор `variants`.
- При переключении на доступный цвет открывается соответствующий товар/изображения и сбрасывается выбранный размер.
- При переключении на цвет без остатка цвет и размеры отображаются, но кнопки заказа блокируются понятным сообщением.

- [ ] **Step 1: Write the failing tests** — проверить: (а) после переключения на второй цвет `state.params.productId` меняется на его `productId`; (б) цвет без остатка не приводит к добавлению в корзину; (в) опубликованный товар с нулевыми остатками не исчезает из `getPublishedProducts`.
- [ ] **Step 2: Run tests to verify the boundary** — `node --test --test-name-pattern='переключение цвета сохраняет вариант|опубликованный товар без остатка виден' tg-app/tests/app-smoke.test.js tg-app/tests/core.test.js`; зафиксировать текущий результат до реализации.
- [ ] **Step 3: Implement** — сделать единый helper доступности варианта/товара, использовать его в цветовых кнопках, размерах, `addSelectedProduct` и текстах статуса; не дублировать условия `stock` в нескольких местах.
- [ ] **Step 4: Run targeted and full tests** — targeted-команда из шага 2, затем `node --test tg-app/tests/*.test.js`.
- [ ] **Step 5: Commit** — `git add tg-app/app.js tg-app/tests/app-smoke.test.js tg-app/tests/core.test.js && git commit -m "fix: bind product color choices to variant stock"`.

### Task 3: Мобильная компоновка цветов, размеров и первого экрана

**Files:**
- Modify: `tg-app/app.js`
- Modify: `tg-app/styles.css`
- Modify: `tg-app/tests/app-smoke.test.js`

**Interfaces:**
- Цвета на ширинах 320–430 px: ровно три колонки; длинные названия переносятся без горизонтальной прокрутки.
- Размеры: один размер получает класс `choice-grid--single` и ширину всей строки; два и более используют `choice-grid--compact` с тремя колонками.
- Заголовок товара остаётся уменьшенным; блок выбора цвета располагается ближе к названию и помещается в видимую область вместе с размером без прокрутки страницы в сторону.
- Нижняя фиксированная панель действий не перекрывает последний ряд размеров: нижний padding экрана должен учитывать её реальную высоту.

- [ ] **Step 1: Write failing markup/CSS regression tests** — проверить наличие класса количества размеров, правила `repeat(3, minmax(0, 1fr))`, правила одиночного размера и увеличенного нижнего отступа под fixed actions.
- [ ] **Step 2: Run tests to verify failure** — `node --test --test-name-pattern='один размер занимает строку|цвета и размеры используют мобильную сетку' tg-app/tests/app-smoke.test.js`.
- [ ] **Step 3: Implement** — в `renderProduct` назначить классы сетке размеров по `sizes.length`; в CSS задать три колонки для цветов/нескольких размеров, `grid-column: 1 / -1` для одного размера, безопасные переносы текста и padding-bottom экрана не меньше высоты `.product-actions` плюс safe area; сохранить текущий уменьшенный `h1` и поднять `choice-section` только в рамках карточки товара.
- [ ] **Step 4: Run tests and local layout checks** — `node --test tg-app/tests/*.test.js`; запустить `python3 -m http.server 4173 --directory tg-app` и проверить HTTP 200, затем вручную ширины 320, 375 и 430 px, светлую/тёмную темы и отсутствие горизонтальной прокрутки. При отсутствии браузера пометить визуальную проверку незавершённой.
- [ ] **Step 5: Commit** — `git add tg-app/app.js tg-app/styles.css tg-app/tests/app-smoke.test.js && git commit -m "fix: fit product choices on mobile"`.

### Task 4: Документация, итоговая проверка и публикация

**Files:**
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `CHANGELOG.md`
- Modify: `tg-app/index.html` (только cache-busting, если изменились CSS/JS)

**Interfaces:**
- Документация описывает: published без остатка виден, unavailable-вариант не заказывается, все цвета группы видны, размеры зависят от остатков и мобильной сетки.

- [ ] **Step 1: Update docs** — синхронизировать разделы поведения каталога, seller/admin preview и release notes с фактическим кодом.
- [ ] **Step 2: Run verification** — `node --check tg-app/data.js && node --check tg-app/core.js && node --check tg-app/ui.js && node --check tg-app/api.js && node --check tg-app/app.js`; `node --test tg-app/tests/*.test.js`; `git diff --check`.
- [ ] **Step 3: Inspect runtime assets** — локально проверить `curl -I http://localhost:4173/`, наличие актуальных `styles.css?v=...` и `app.js?v=...`; убедиться, что текст «Доставка, обмен и возврат» отсутствует.
- [ ] **Step 4: Commit** — `git add README.md ARCHITECTURE.md CHANGELOG.md tg-app/index.html && git commit -m "docs: describe product card variant behavior"`.
- [ ] **Step 5: Publish only after explicit approval** — `git push origin main`; сверить SHA через `git ls-remote origin refs/heads/main`, дождаться успешного `deploy-tg-app.yml`, затем проверить live URL и опубликованные `app.js`/`styles.css`.

## Self-review checklist

- [ ] Все опубликованные цвета, включая out-of-stock, остаются видимыми.
- [ ] Заказ разрешён только при положительном остатке конкретного варианта.
- [ ] Один размер — одна широкая ячейка; несколько размеров — три в ряд.
- [ ] Цвета — по три в ряд на мобильном экране, без горизонтального overflow.
- [ ] Название уменьшено, выбор цвета/размера поднят, fixed actions не закрывают размеры.
- [ ] README, ARCHITECTURE и CHANGELOG соответствуют runtime-коду.
- [ ] Визуальная проверка Telegram iOS/Android отдельно отмечена как выполненная или непроверенная.
