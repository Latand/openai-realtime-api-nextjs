# Спецификация: Память разговоров (Conversation Memory)

## Задача
Реализовать систему сохранения контекста разговоров между сессиями.

## Как это работает

### 1. При завершении сессии (stopSession)
Когда пользователь говорит "стоп" или вызывается `stopSession`:
- Собрать всю историю сообщений текущей сессии
- Вызвать LLM для компактификации в ~500 символов
- Сохранить результат в localStorage или файл

### 2. Формат компакта
```json
{
  "timestamp": "2024-12-21T15:30:00Z",
  "summary": "Краткое содержание разговора на 500 символов...",
  "topics": ["wake-word", "claude-cli", "spotify"],
  "lastAction": "Добавили звук для запроса к Claude"
}
```

### 3. При старте новой сессии
- Загрузить последние 3-5 компактов
- Добавить в системный промпт секцию "Предыдущие разговоры"
- LLM будет знать контекст прошлых сессий

## Файлы для изменения

### hooks/use-webrtc.ts
- Добавить массив `conversationHistory` для накопления сообщений
- При получении ответа от LLM - добавлять в историю
- При function_call тоже логировать

### hooks/use-tools.ts → stopSession()
```typescript
const stopSession = async () => {
  // 1. Получить историю из useWebRTC
  const history = getConversationHistory();

  // 2. Вызвать API для компактификации
  const compact = await fetch('/api/compact', {
    method: 'POST',
    body: JSON.stringify({ messages: history })
  });

  // 3. Сохранить в localStorage
  const compacts = JSON.parse(localStorage.getItem('conversationCompacts') || '[]');
  compacts.push(await compact.json());
  if (compacts.length > 5) compacts.shift();
  localStorage.setItem('conversationCompacts', JSON.stringify(compacts));

  // 4. Закрыть сессию
  return { success: true };
};
```

### app/api/compact/route.ts (новый файл)
```typescript
export async function POST(request: NextRequest) {
  const { messages } = await request.json();

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-5.1-chat-latest',
      messages: [{
        role: 'system',
        content: 'Сожми этот разговор в 500 символов. Выдели ключевые темы и действия.'
      }, {
        role: 'user',
        content: JSON.stringify(messages)
      }]
    })
  });

  return NextResponse.json({ summary: data.choices[0].message.content });
}
```

### app/api/session/route.ts
В instructions добавить загрузку компактов:
```typescript
const compacts = loadPreviousCompacts(); // из headers или body
const memorySection = compacts.length
  ? `\n\nПредыдущие разговоры:\n${compacts.map(c => c.summary).join('\n---\n')}`
  : '';

instructions: baseInstructions + memorySection
```

## Важно
- Компакт делать через дешёвую модель (gpt-4o-mini)
- Хранить максимум 5 последних компактов
- При ошибке компактификации - не блокировать закрытие сессии
- Добавить тул `recallPreviousConversations` для явного запроса памяти

## Тестирование
1. Провести разговор → сказать "стоп"
2. Проверить localStorage на наличие компакта
3. Начать новую сессию → спросить "что мы обсуждали раньше?"
4. LLM должен ответить на основе компакта
