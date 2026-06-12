// Шаблон новой модели. Файл с префиксом '_' игнорируется автозагрузчиком.
// Скопируйте в <name>.ts и заполните. Поддерживаются два формата экспорта:
//   1. export default new Schema({ ... }, { ... });
//   2. export default [ { /* поля */ }, { /* опции */ } ];
const template: [Record<string, unknown>, Record<string, unknown>] = [
    // Структура
    {},

    // Настройки
    { versionKey: false },
];

export default template;
