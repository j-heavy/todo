import { useEffect, useState, useMemo, useRef } from 'preact/hooks'
import { supabase } from './supabase'

const priorities = ['low', 'medium', 'high']

const isOverdue = (todo) =>
  todo.deadline && !todo.done && todo.deadline < new Date().toISOString().slice(0, 10)

export function App() {
  const [todos, setTodos] = useState([])

  const [text, setText] = useState('')
  const [category, setCategory] = useState('')
  const [deadline, setDeadline] = useState('')
  const [priority, setPriority] = useState('medium')

  const [dragId, setDragId] = useState(null)
  const [draggedTodo, setDraggedTodo] = useState(null)

  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')

  const [glowEnabled, setGlowEnabled] = useState(() => {
    const saved = localStorage.getItem('glow')
    return saved ? JSON.parse(saved) : true
  })

  const categoryRef = useRef(null)

const existingCategories = useMemo(() => {
  const set = new Set()
  for (const t of todos) {
    const c = (t.category || '').trim()
    if (c && c !== 'Без категории') set.add(c)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}, [todos])

const pickCategory = (c) => {
  setCategory(c)
  categoryRef.current?.focus()
}

  useEffect(() => {
    localStorage.setItem('glow', JSON.stringify(glowEnabled))
  }, [glowEnabled])

  useEffect(() => {
    loadTodos()
  }, [])

  const loadTodos = async () => {
    const { data, error } = await supabase
      .from('todos')
      .select('*')
      .order('position', { ascending: true })

    if (!error && data) setTodos(data)
  }

  const addTodo = async () => {
    if (!text.trim()) return

    const newPosition = (todos.at(-1)?.position ?? -1) + 1

    const { data, error } = await supabase
      .from('todos')
      .insert({
        text,
        category: category || 'Без категории',
        deadline: deadline || null,
        priority,
        done: false,
        position: newPosition,
      })
      .select()
      .single()

    if (!error && data) {
      setTodos([...todos, data])
    }

    setText('')
    setCategory('')
    setDeadline('')
    setPriority('medium')
  }

  const startEdit = (todo) => {
    setEditingId(todo.id)
    setEditText(todo.text)
  }

  const saveEdit = async (id) => {
    if (!editText.trim()) {
      setEditingId(null)
      return
    }

    // оптимистично
    setTodos(todos.map((t) => (t.id === id ? { ...t, text: editText } : t)))
    setEditingId(null)

    await supabase.from('todos').update({ text: editText }).eq('id', id)
  }

  const toggleDone = async (todo) => {
    const nextDone = !todo.done

    // оптимистично
    setTodos(todos.map((t) => (t.id === todo.id ? { ...t, done: nextDone } : t)))

    await supabase.from('todos').update({ done: nextDone }).eq('id', todo.id)
  }

  const removeTodo = async (todo) => {
    setTodos(todos.filter((t) => t.id !== todo.id))
    await supabase.from('todos').delete().eq('id', todo.id)
  }

  const onDragStart = (todo) => {
    setDraggedTodo(todo)
    setDragId(todo.id)
  }

  const onDropCategory = async (cat) => {
    if (!draggedTodo) return

    setTodos(
      todos.map((t) => (t.id === draggedTodo.id ? { ...t, category: cat } : t))
    )

    await supabase.from('todos').update({ category: cat }).eq('id', draggedTodo.id)

    setDraggedTodo(null)
    setDragId(null)
  }

  const persistPositions = async (list) => {
  // обновляем только position, без upsert
  const updates = list.map((t) =>
    supabase.from('todos').update({ position: t.position }).eq('id', t.id)
  )

  const results = await Promise.all(updates)
  const bad = results.find(r => r.error)
  if (bad?.error) console.error('persistPositions error:', bad.error)
}


  const onDrop = async (id) => {
    if (dragId === null || dragId === id) return

    const from = todos.findIndex((t) => t.id === dragId)
    const to = todos.findIndex((t) => t.id === id)
    if (from === -1 || to === -1) return

    const updated = [...todos]
    const [moved] = updated.splice(from, 1)
    updated.splice(to, 0, moved)

    const withPos = updated.map((t, idx) => ({ ...t, position: idx }))

    setTodos(withPos)
    setDragId(null)
    setDraggedTodo(null)

    await persistPositions(withPos)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || e.target.tagName === 'INPUT')) {
      addTodo()
    }
  }

  // сортируем для отображения (overdue/priority/deadline),
  // но группировка остаётся поверх этого порядка
  // показываем в порядке position (это и меняет drag&drop)
const orderedTodos = [...todos].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

const grouped = orderedTodos.reduce((acc, todo) => {
  acc[todo.category] ||= []
  acc[todo.category].push(todo)
  return acc
}, {})

  return (
    <div class={`todo-app ${glowEnabled ? 'glow-on' : 'glow-off'}`} onKeyDown={onKeyDown}>
      <h1 class="glow">ВОРКАЕМ</h1>

      <div class="glow-toggle">
        <span>Неон</span>
        <button
          class={`toggle ${glowEnabled ? 'on' : 'off'}`}
          onClick={() => setGlowEnabled(!glowEnabled)}
          aria-label="Переключить неон"
        >
          <span class="dot" />
        </button>
      </div>

      <div class="todo-form">
        <label class="field">
          <span>Задача</span>
          <input
            value={text}
            onInput={(e) => setText(e.target.value)}
            placeholder="Что нужно сделать?"
          />
        </label>

        <label class="field">
          <span>Категория</span>
          <input
            ref={categoryRef}
            value={category}
            onInput={(e) => setCategory(e.target.value)}
            placeholder="Например: покупки или работа по дому"
          />
          {existingCategories.length > 0 && (
  <div class="category-chips">
    {existingCategories.map((c) => (
      <button
        type="button"
        class="category-chip"
        onClick={() => pickCategory(c)}
        title="Подставить категорию"
      >
        {c}
      </button>
    ))}
  </div>
)}
        </label>

        <label class="field">
          <span>
            Дедлайн <em>(необязательно)</em>
          </span>
          <input type="date" value={deadline} onInput={(e) => setDeadline(e.target.value)} />
        </label>

        <label class="field">
          <span>Приоритет</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">Низкий</option>
            <option value="medium">Средний</option>
            <option value="high">Высокий</option>
          </select>
        </label>

        <button onClick={addTodo}>Добавить</button>
      </div>

      {Object.entries(grouped).map(([cat, items]) => (
        <div
          class="todo-group"
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => onDropCategory(cat)}
        >
          <h3>#{cat}</h3>

          <ul class="todo-list">
            {items.map((todo) => (
              <li
                key={todo.id}
                draggable
                onDragStart={() => onDragStart(todo)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(todo.id)}
                class={`todo-item priority-${todo.priority} ${isOverdue(todo) ? 'срочный' : ''}`}
              >
                <div>
                  {editingId === todo.id ? (
                    <input
                      class="todo-edit"
                      value={editText}
                      autoFocus
                      onInput={(e) => setEditText(e.target.value)}
                      onBlur={() => saveEdit(todo.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(todo.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                    />
                  ) : (
                    <span
                      class={`todo-text ${todo.done ? 'done' : ''}`}
                      onClick={() => toggleDone(todo)}
                      onDblClick={() => startEdit(todo)}
                      title="Двойной клик — редактировать"
                    >
                      {todo.text}
                    </span>
                  )}

                  <div class="todo-meta">
                    {todo.deadline && <span>⏰ {todo.deadline}</span>}
                    {isOverdue(todo) && <span class="overdue-text">СРОЧНО</span>}
                  </div>
                </div>

                <button class="todo-remove" onClick={() => removeTodo(todo)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
