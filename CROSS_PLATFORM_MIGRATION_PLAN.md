# План кроссплатформенной миграции OpenAI Realtime API

> **Дата создания**: Январь 2025
> **Статус**: Планирование
> **Целевые платформы**: Windows, macOS, Linux

---

## Оглавление

1. [Текущее состояние](#текущее-состояние)
2. [Матрица совместимости](#матрица-совместимости)
3. [Фазы миграции](#фазы-миграции)
4. [Детальные планы по задачам](#детальные-планы-по-задачам)
5. [Распределение задач по уровням](#распределение-задач-по-уровням)
6. [Рекомендуемые библиотеки и инструменты](#рекомендуемые-библиотеки-и-инструменты)
7. [Чек-лист готовности к релизу](#чек-лист-готовности-к-релизу)

---

## Текущее состояние

### Работает на всех платформах
- Electron UI и окна
- WebRTC и аудио (через Chromium)
- Picovoice Wake Word (WebAssembly)
- Глобальные горячие клавиши (`CommandOrControl`)
- Буфер обмена (Electron API)
- Хранение данных (`app.getPath("userData")`)
- MCP сервис
- Все UI-библиотеки

### Работает только на Linux
- Симуляция клавиатуры (`xdotool`)
- Управление системной громкостью (`wpctl`)
- Запуск Spotify (`spawn("spotify")`)
- Управление Spotify через D-Bus (`dbus-send`)

### Критические проблемы на macOS
- Отсутствует App Menu (Copy/Paste не работает через Cmd+C/V)

### Отсутствует на всех платформах
- Системный трей
- Автозапуск приложения
- Иконки приложения
- Code signing
- Система автообновлений

---

## Матрица совместимости

| Компонент | Windows | macOS | Linux | Приоритет |
|-----------|---------|-------|-------|-----------|
| App Menu | Работает (нет меню) | **СЛОМАНО** | Работает (нет меню) | P0 |
| Симуляция клавиш | Не работает | Не работает | Работает | P1 |
| Системная громкость | Не работает | Не работает | Работает | P1 |
| Spotify control | Не работает | Не работает | Работает | P2 |
| Путь к Claude CLI | Не работает | Работает | Работает | P1 |
| Системный трей | Отсутствует | Отсутствует | Отсутствует | P2 |
| Автозапуск | Отсутствует | Отсутствует | Отсутствует | P3 |
| Иконки | Отсутствует | Отсутствует | Отсутствует | P2 |

**Приоритеты**: P0 = Критический, P1 = Высокий, P2 = Средний, P3 = Низкий

---

## Фазы миграции

### Фаза 1: Критические исправления (P0)
**Цель**: Сделать приложение работоспособным на macOS

1. Добавить App Menu с обязательными пунктами
2. Исправить путь к Claude CLI для Windows

### Фаза 2: Кроссплатформенная функциональность (P1)
**Цель**: Обеспечить работу основных функций на всех платформах

1. Реализовать кроссплатформенную симуляцию клавиатуры
2. Реализовать кроссплатформенное управление громкостью
3. Создать архитектуру платформо-зависимых модулей

### Фаза 3: Улучшения UX (P2)
**Цель**: Полноценный desktop experience

1. Добавить системный трей
2. Создать иконки для всех платформ
3. Реализовать кроссплатформенное управление Spotify

### Фаза 4: Production-ready (P3)
**Цель**: Готовность к публичному релизу

1. Настроить автозапуск
2. Настроить code signing
3. Реализовать автообновления
4. Добавить поддержку ARM64

---

## Детальные планы по задачам

### 1. App Menu (P0 - Критический)

**Проблема**: На macOS без Edit Menu не работают Cmd+C/V/X/A

**Решение**: Создать кроссплатформенное меню с использованием ролей Electron

**Источники**:
- [Electron Menu API](https://www.electronjs.org/docs/latest/api/menu)
- [Electron MenuItem Roles](https://www.electronjs.org/docs/latest/api/menu-item#roles)

**Шаги выполнения**:

| # | Задача | Уровень | Детали |
|---|--------|---------|--------|
| 1.1 | Изучить структуру существующего main/index.ts | Junior | Понять текущую архитектуру |
| 1.2 | Создать файл main/menu.ts | Junior | Вынести логику меню в отдельный модуль |
| 1.3 | Реализовать шаблон меню для macOS | Middle | Включить App Menu, Edit, Window, Help |
| 1.4 | Реализовать шаблон меню для Windows/Linux | Middle | Убрать App Menu, адаптировать Edit |
| 1.5 | Интегрировать меню в app.whenReady() | Middle | Добавить Menu.setApplicationMenu() |
| 1.6 | Протестировать на всех платформах | Junior | Проверить Cmd+C/V на Mac |

**Обязательные пункты меню для macOS**:
- App Menu: About, Services, Hide, Hide Others, Unhide, Quit
- Edit Menu: Undo, Redo, Cut, Copy, Paste, Select All
- Window Menu: Minimize, Zoom, Front

---

### 2. Путь к Claude CLI (P1)

**Проблема**: `process.env.HOME` не существует на Windows

**Текущий код** (main/index.ts:682):
```typescript
const claudePath = `${process.env.HOME}/.bun/bin/claude`;
```

**Решение**: Использовать `app.getPath('home')` или кроссплатформенную логику

**Шаги выполнения**:

| # | Задача | Уровень | Детали |
|---|--------|---------|--------|
| 2.1 | Найти все использования process.env.HOME | Junior | Grep по кодовой базе |
| 2.2 | Заменить на app.getPath('home') | Junior | Одна строка кода |
| 2.3 | Добавить .exe для Windows | Junior | Условная логика для win32 |
| 2.4 | Протестировать на Windows | Junior | Проверить доступность claude |

---

### 3. Симуляция клавиатуры (P1)

**Проблема**: xdotool работает только на Linux (X11)

**Рекомендуемое решение**: `@nut-tree/nut-js` (2025)

**Источники**:
- [nut.js Official Site](https://nutjs.dev/)
- [@nut-tree/nut-js npm](https://www.npmjs.com/package/@nut-tree/nut-js)

**Альтернативы**:
- `@jitsi/robotjs` - форк robotjs с prebuilt бинарниками
- Нативные команды через child_process (osascript для macOS)

**Шаги выполнения**:

| # | Задача | Уровень | Детали |
|---|--------|---------|--------|
| 3.1 | Создать структуру main/platform/ | Senior | Архитектура абстракции |
| 3.2 | Создать интерфейс KeyboardSimulator | Senior | Определить контракт |
| 3.3 | Реализовать LinuxKeyboardSimulator | Middle | Использовать xdotool |
| 3.4 | Реализовать MacKeyboardSimulator | Middle | Использовать @nut-tree/nut-js или osascript |
| 3.5 | Реализовать WindowsKeyboardSimulator | Middle | Использовать @nut-tree/nut-js |
| 3.6 | Создать фабрику createKeyboardSimulator() | Middle | Выбор по process.platform |
| 3.7 | Заменить вызовы в main/index.ts | Middle | Использовать новую абстракцию |
| 3.8 | Настроить electron-rebuild | Junior | Добавить в postinstall скрипт |
| 3.9 | Документировать требования macOS | Junior | Accessibility permissions |

**Важно для macOS**:
- Требуется разрешение в System Preferences > Privacy & Security > Accessibility
- Приложение должно быть подписано для сохранения разрешений между сборками

---

### 4. Управление системной громкостью (P1)

**Проблема**: wpctl работает только на Linux (PipeWire)

**Рекомендуемое решение**: Нативные команды через child_process

**Источники**:
- [WirePlumber wpctl](https://pipewire.pages.freedesktop.org/wireplumber/tools/wpctl.html)
- [osascript volume control](https://davidwalsh.name/mac-change-volume)
- [AudioDeviceCmdlets PowerShell](https://github.com/frgnca/AudioDeviceCmdlets)

**Команды по платформам**:
- **Linux**: `wpctl set-volume @DEFAULT_AUDIO_SINK@ 75%`
- **macOS**: `osascript -e 'set volume output volume 75'`
- **Windows**: PowerShell с AudioDeviceCmdlets или nircmd

**Шаги выполнения**:

| # | Задача | Уровень | Детали |
|---|--------|---------|--------|
| 4.1 | Создать интерфейс VolumeController | Senior | Определить getVolume, setVolume, setMuted |
| 4.2 | Реализовать LinuxVolumeController | Middle | wpctl с fallback на pactl |
| 4.3 | Реализовать MacVolumeController | Middle | osascript |
| 4.4 | Реализовать WindowsVolumeController | Middle | PowerShell или nircmd |
| 4.5 | Создать фабрику createVolumeController() | Middle | Выбор по process.platform |
| 4.6 | Заменить вызовы в main/index.ts | Middle | Использовать новую абстракцию |
| 4.7 | Добавить graceful degradation | Senior | Обработка ошибок если утилита недоступна |

---

### 5. Системный трей (P2)

**Проблема**: Трей не реализован

**Решение**: Electron Tray API

**Источники**:
- [Electron Tray API](https://www.electronjs.org/docs/latest/api/tray)
- [Tray Tutorial](https://www.electronjs.org/docs/latest/tutorial/tray)

**Требования к иконкам**:
- **Windows**: `.ico` (16x16, 32x32, 48x48, 256x256)
- **macOS**: `iconTemplate.png` + `iconTemplate@2x.png` (16x16, 32x32)
- **Linux**: `.png` (32x32)

**Шаги выполнения**:

| # | Задача | Уровень | Детали |
|---|--------|---------|--------|
| 5.1 | Создать папку resources/icons/ | Junior | Структура для иконок |
| 5.2 | Создать иконки для всех платформ | Junior | Можно использовать генератор |
| 5.3 | Создать файл main/tray.ts | Middle | Модуль для трея |
| 5.4 | Реализовать createTray() | Middle | С контекстным меню |
| 5.5 | Добавить Template images для macOS | Middle | Черно-белые с альфа-каналом |
| 5.6 | Интегрировать с главным окном | Middle | Показать/скрыть при клике |
| 5.7 | Добавить индикацию состояния | Senior | Разные иконки для recording/muted |

---

### 6. Управление Spotify (P2)

**Проблема**: D-Bus работает только на Linux

**Рекомендуемое решение**: Spotify Web API (универсально)

**Источники**:
- [Spotify Web API](https://developer.spotify.com/documentation/web-api)
- [spotify-web-api-node](https://github.com/thelinmichael/spotify-web-api-node)
- [spotify-mcp](https://github.com/varunneal/spotify-mcp)

**Важно**: Требуется Spotify Premium для управления воспроизведением

**Шаги выполнения**:

| # | Задача | Уровень | Детали |
|---|--------|---------|--------|
| 6.1 | Оценить текущее использование Spotify | Senior | Определить необходимые функции |
| 6.2 | Создать Spotify Developer App | Junior | На developer.spotify.com |
| 6.3 | Реализовать OAuth PKCE flow | Senior | Для получения токенов |
| 6.4 | Создать SpotifyController класс | Middle | Обертка над Web API |
| 6.5 | Добавить fallback для macOS | Middle | AppleScript как запасной вариант |
| 6.6 | Заменить D-Bus вызовы | Middle | Использовать новый контроллер |
| 6.7 | Добавить UI для авторизации | Middle | Окно OAuth или системный браузер |
| 6.8 | Обработать отсутствие Premium | Junior | Graceful degradation |

**Альтернатива**: Использовать существующий MCP-сервис spotify-mcp (уже интегрирован)

---

### 7. Автозапуск (P3)

**Решение**: `app.setLoginItemSettings()` + особая обработка для Linux

**Источники**:
- [Electron app API](https://www.electronjs.org/docs/latest/api/app)
- [auto-launch npm](https://www.npmjs.com/package/auto-launch)

**Шаги выполнения**:

| # | Задача | Уровень | Детали |
|---|--------|---------|--------|
| 7.1 | Создать файл main/autolaunch.ts | Middle | Модуль для автозапуска |
| 7.2 | Реализовать для macOS | Junior | app.setLoginItemSettings() |
| 7.3 | Реализовать для Windows | Middle | С поддержкой Squirrel |
| 7.4 | Реализовать для Linux | Middle | Создание .desktop файла |
| 7.5 | Добавить UI toggle | Junior | Чекбокс в настройках или трее |
| 7.6 | Сохранять состояние | Junior | В app-settings.json |

---

### 8. Иконки приложения (P2)

**Проблема**: Папка resources/ не существует

**Требования electron-builder**:
- `icon.ico` - Windows (256x256 минимум)
- `icon.icns` - macOS
- `icon.png` - Linux (512x512)

**Шаги выполнения**:

| # | Задача | Уровень | Детали |
|---|--------|---------|--------|
| 8.1 | Создать дизайн иконки | Junior | SVG или PNG 1024x1024 |
| 8.2 | Сгенерировать icon.ico | Junior | Использовать png2ico или electron-icon-maker |
| 8.3 | Сгенерировать icon.icns | Junior | Использовать iconutil или electron-icon-maker |
| 8.4 | Создать icon.png 512x512 | Junior | Для Linux |
| 8.5 | Обновить electron-builder.yml | Junior | Указать пути к иконкам |
| 8.6 | Создать иконки для трея | Junior | Отдельные от основных |

---

### 9. Code Signing (P3)

**macOS**: Требуется для распространения вне App Store

**Windows**: Убирает SmartScreen предупреждение

**Шаги выполнения**:

| # | Задача | Уровень | Детали |
|---|--------|---------|--------|
| 9.1 | Получить Apple Developer сертификат | Senior | $99/год |
| 9.2 | Получить Windows Code Signing сертификат | Senior | От доверенного CA |
| 9.3 | Настроить переменные окружения для CI | Senior | CSC_LINK, CSC_KEY_PASSWORD |
| 9.4 | Обновить electron-builder.yml | Middle | Добавить настройки подписи |
| 9.5 | Настроить macOS Notarization | Senior | Для обхода Gatekeeper |
| 9.6 | Протестировать подписанные сборки | Junior | На чистых системах |

---

### 10. Автообновления (P3)

**Решение**: electron-updater

**Источники**:
- [electron-updater](https://www.electron.build/auto-update)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github)

**Шаги выполнения**:

| # | Задача | Уровень | Детали |
|---|--------|---------|--------|
| 10.1 | Установить electron-updater | Junior | npm install electron-updater |
| 10.2 | Настроить publish в electron-builder.yml | Middle | GitHub provider |
| 10.3 | Добавить проверку обновлений | Middle | autoUpdater.checkForUpdatesAndNotify() |
| 10.4 | Создать UI уведомления | Junior | Диалог о новой версии |
| 10.5 | Настроить GitHub Actions для релизов | Senior | Автоматическая публикация |
| 10.6 | Протестировать процесс обновления | Junior | На всех платформах |

---

## Распределение задач по уровням

### Senior Developer
- Проектирование архитектуры платформо-зависимых модулей
- OAuth PKCE flow для Spotify
- Настройка code signing и notarization
- Настройка CI/CD для релизов
- Graceful degradation и обработка edge cases
- Ревью и финальное тестирование

### Middle Developer
- Реализация кроссплатформенных контроллеров (keyboard, volume, spotify)
- Создание App Menu с платформо-специфичной логикой
- Реализация системного трея
- Интеграция автозапуска
- Обновление electron-builder конфигурации
- Unit-тесты для новых модулей

### Junior Developer
- Создание структуры папок и файлов
- Генерация иконок
- Простые замены (пути к файлам)
- Тестирование на разных платформах
- Документирование процедур установки
- Обновление README

---

## Рекомендуемые библиотеки и инструменты

### Симуляция клавиатуры
| Библиотека | Рекомендация | Примечание |
|------------|--------------|------------|
| **@nut-tree/nut-js** | Рекомендуется | Активная поддержка, Apple Silicon |
| @jitsi/robotjs | Альтернатива | Prebuilt бинарники |
| osascript (macOS) | Fallback | Без зависимостей |

### Управление громкостью
| Подход | Рекомендация | Примечание |
|--------|--------------|------------|
| **Нативные команды** | Рекомендуется | Надежно, без зависимостей |
| easy-volume | Альтернатива | Готовое решение для Electron |
| loudness | Не рекомендуется | Не поддерживает PipeWire |

### Spotify
| Подход | Рекомендация | Примечание |
|--------|--------------|------------|
| **spotify-web-api-node** | Рекомендуется | Кроссплатформенно |
| MCP spotify-mcp | Уже есть | Интеграция через MCP |
| AppleScript (macOS) | Fallback | Без OAuth |

### Автозапуск
| Подход | Рекомендация | Примечание |
|--------|--------------|------------|
| **app.setLoginItemSettings()** | Рекомендуется | Встроено в Electron |
| auto-launch | Альтернатива | Лучше для Squirrel.Windows |

---

## Чек-лист готовности к релизу

### Фаза 1 (P0) - Минимально работоспособное
- [ ] App Menu добавлено и работает на macOS
- [ ] Cmd+C/V/X/A работают на macOS
- [ ] Путь к Claude исправлен для Windows

### Фаза 2 (P1) - Основная функциональность
- [ ] Симуляция клавиатуры работает на Windows
- [ ] Симуляция клавиатуры работает на macOS
- [ ] Управление громкостью работает на Windows
- [ ] Управление громкостью работает на macOS
- [ ] Архитектура platform/ создана и документирована

### Фаза 3 (P2) - Полноценный UX
- [ ] Системный трей работает на всех платформах
- [ ] Иконки приложения созданы
- [ ] Spotify управление работает кроссплатформенно (или отключено gracefully)

### Фаза 4 (P3) - Production
- [ ] Автозапуск работает на всех платформах
- [ ] Code signing настроен для macOS
- [ ] Code signing настроен для Windows
- [ ] Автообновления работают
- [ ] Документация обновлена
- [ ] CI/CD настроен для релизов

---

## Примерная структура после миграции

```
main/
├── index.ts                 # Главный файл (упрощенный)
├── menu.ts                  # App Menu
├── tray.ts                  # Системный трей
├── autolaunch.ts            # Автозапуск
├── preload.ts               # Preload скрипт
├── mcp-service.ts           # MCP сервис
└── platform/
    ├── index.ts             # Экспорт и фабрики
    ├── types.ts             # Интерфейсы
    ├── keyboard/
    │   ├── index.ts         # Фабрика
    │   ├── linux.ts         # xdotool
    │   ├── darwin.ts        # nut.js/osascript
    │   └── win32.ts         # nut.js
    ├── volume/
    │   ├── index.ts         # Фабрика
    │   ├── linux.ts         # wpctl/pactl
    │   ├── darwin.ts        # osascript
    │   └── win32.ts         # PowerShell
    └── spotify/
        ├── index.ts         # Фабрика
        ├── web-api.ts       # Spotify Web API (универсально)
        └── darwin.ts        # AppleScript fallback

resources/
├── icons/
│   ├── icon.ico             # Windows app icon
│   ├── icon.icns            # macOS app icon
│   ├── icon.png             # Linux app icon (512x512)
│   ├── tray-icon.ico        # Windows tray
│   ├── iconTemplate.png     # macOS tray (16x16)
│   ├── iconTemplate@2x.png  # macOS tray Retina (32x32)
│   └── tray-icon.png        # Linux tray (32x32)
```

---

## Заключение

Проект требует значительной работы для полной кроссплатформенности. Приоритетом должно быть:

1. **Немедленно**: Добавить App Menu для работоспособности на macOS
2. **Краткосрочно**: Создать абстракции для platform-specific функций
3. **Среднесрочно**: Реализовать полноценный desktop experience (трей, автозапуск)
4. **Долгосрочно**: Production-ready с подписью и автообновлениями

Рекомендуемый подход - итеративный, с выпуском промежуточных версий после каждой фазы.
