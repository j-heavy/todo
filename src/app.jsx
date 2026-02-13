import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { supabase } from './supabase'

const isOverdue = (todo) =>
  todo.deadline && !todo.done && todo.deadline < new Date().toISOString().slice(0, 10)

export function App() {
  // --- TODOS ---
  const [todos, setTodos] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [text, setText] = useState('')
  const [category, setCategory] = useState('')
  const [deadline, setDeadline] = useState('')
  const [priority, setPriority] = useState('medium')

  const [dragId, setDragId] = useState(null)
  const [draggedTodo, setDraggedTodo] = useState(null)

  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')

  // --- UI prefs ---
  const [glowEnabled, setGlowEnabled] = useState(() => {
    const saved = localStorage.getItem('glow')
    return saved ? JSON.parse(saved) : true
  })

  // --- Categories chips ---
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

  // --- Load todos ---
  useEffect(() => {
    loadTodos()
  }, [])

  const loadTodos = async () => {
    setLoading(true)
    setLoadError('')

    try {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .order('position', { ascending: true })

      if (error) throw error
      setTodos(data ?? [])
    } catch (e) {
      console.error('loadTodos error:', e)
      setLoadError(e?.message || 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
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

    if (error) {
      console.error('addTodo error:', error)
      return
    }

    if (data) setTodos([...todos, data])

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

    setTodos(todos.map((t) => (t.id === id ? { ...t, text: editText } : t)))
    setEditingId(null)

    const { error } = await supabase.from('todos').update({ text: editText }).eq('id', id)
    if (error) console.error('saveEdit error:', error)
  }

  const toggleDone = async (todo) => {
    const nextDone = !todo.done
    setTodos(todos.map((t) => (t.id === todo.id ? { ...t, done: nextDone } : t)))

    const { error } = await supabase.from('todos').update({ done: nextDone }).eq('id', todo.id)
    if (error) console.error('toggleDone error:', error)
  }

  const removeTodo = async (todo) => {
    setTodos(todos.filter((t) => t.id !== todo.id))
    const { error } = await supabase.from('todos').delete().eq('id', todo.id)
    if (error) console.error('removeTodo error:', error)
  }

  const onDragStart = (todo) => {
    setDraggedTodo(todo)
    setDragId(todo.id)
  }

  const onDropCategory = async (cat) => {
    if (!draggedTodo) return

    setTodos(todos.map((t) => (t.id === draggedTodo.id ? { ...t, category: cat } : t)))

    const { error } = await supabase
      .from('todos')
      .update({ category: cat })
      .eq('id', draggedTodo.id)

    if (error) console.error('onDropCategory error:', error)

    setDraggedTodo(null)
    setDragId(null)
  }

  const persistPositions = async (list) => {
    const results = await Promise.all(
      list.map((t) => supabase.from('todos').update({ position: t.position }).eq('id', t.id))
    )
    const firstError = results.find((r) => r.error)?.error
    if (firstError) console.error('persistPositions error:', firstError)
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

  const orderedTodos = [...todos].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  const grouped = orderedTodos.reduce((acc, todo) => {
    acc[todo.category] ||= []
    acc[todo.category].push(todo)
    return acc
  }, {})

  // --- NOTES (chat-like, collapsible, no page-jump) ---
  const [notesOpen, setNotesOpen] = useState(false) // свернуто по умолчанию
  const [notes, setNotes] = useState([])
  const [noteText, setNoteText] = useState('')
  const [notesLoading, setNotesLoading] = useState(true)
  const [notesError, setNotesError] = useState('')

  const notesListRef = useRef(null)
  const stickToBottomRef = useRef(true)

  const syncStickToBottom = () => {
    const el = notesListRef.current
    if (!el) return
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight
    stickToBottomRef.current = gap < 24
  }

  const scrollNotesToBottom = () => {
    const el = notesListRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }

  useEffect(() => {
    loadNotes()
  }, [])

  useEffect(() => {
    if (!notesOpen) return
    if (stickToBottomRef.current) {
      requestAnimationFrame(scrollNotesToBottom)
    }
  }, [notesOpen, notes])

  const loadNotes = async () => {
    setNotesLoading(true)
    setNotesError('')

    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .order('inserted_at', { ascending: true })

      if (error) throw error
      setNotes(data ?? [])
    } catch (e) {
      console.error('loadNotes error:', e)
      setNotesError(e?.message || 'Ошибка загрузки заметок')
    } finally {
      setNotesLoading(false)
    }
  }

  const addNote = async () => {
    const value = noteText.trim()
    if (!value) return

    setNotesError('')

    const { data, error } = await supabase.from('notes').insert({ text: value }).select().single()

    if (error) {
      console.error('addNote error:', error)
      setNotesError(error.message)
      return
    }

    if (data) setNotes([...notes, data])
    setNoteText('')
  }

  const deleteNote = async (id) => {
    setNotes(notes.filter((n) => n.id !== id))
    const { error } = await supabase.from('notes').delete().eq('id', id)
    if (error) console.error('deleteNote error:', error)
  }

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
      {/* NOTES (вверху, сворачиваемые) */}
      <div class={`notes-chat ${notesOpen ? 'open' : 'closed'}`}>
        <div
          class="notes-header"
          onClick={() => {
            setNotesOpen((v) => {
              const next = !v
              if (next) requestAnimationFrame(scrollNotesToBottom)
              return next
            })
          }}
        >
          <h2 class="notes-title">Заметки</h2>
          <span class="notes-toggle">{notesOpen ? '▾' : '▸'}</span>
        </div>

        {notesOpen && (
          <>
            {notesLoading && <div class="loading">Загрузка заметок…</div>}
            {notesError && <div class="error">Ошибка: {notesError}</div>}

            <div class="notes-list" ref={notesListRef} onScroll={syncStickToBottom}>
              {notes.map((n) => (
                <div class="note-bubble" key={n.id}>
                  <div class="note-text">{n.text}</div>
                  <div class="note-meta">
                    <span>{new Date(n.inserted_at).toLocaleString()}</span>
                    <button
                      class="note-del"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteNote(n.id)
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div class="notes-input" onClick={(e) => e.stopPropagation()}>
              <input
                value={noteText}
                onInput={(e) => setNoteText(e.target.value)}
                placeholder="Напиши заметку…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    addNote()
                  }
                }}
              />
              <button type="button" onClick={addNote}>
                Отправить
              </button>
            </div>
          </>
        )}
      </div>

      {loading && <div class="loading">Загрузка…</div>}
      {loadError && <div class="error">Ошибка: {loadError}</div>}

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
