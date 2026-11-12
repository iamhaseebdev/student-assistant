import React, { useState, useEffect } from 'react';
import apiClient from '../api/apiClient';
import styles from './TodoSection.module.css';

const TodoSection = () => {
  const [todos, setTodos] = useState([]);
  const [taskTitle, setTaskTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [loading, setLoading] = useState(false);

  // AI Syllabus Generator States
  const [showAiModal, setShowAiModal] = useState(false);
  const [subject, setSubject] = useState('');
  const [syllabusText, setSyllabusText] = useState('');
  const [prepDays, setPrepDays] = useState(7);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    fetchTodos();
  }, []);

  const fetchTodos = async () => {
    try {
      const res = await apiClient.get('/assistant/todos');
      setTodos(res.data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddTodo = async (e) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    setLoading(true);
    try {
      const res = await apiClient.post('/assistant/todos', { title: taskTitle, priority });
      setTodos([res.data.data, ...todos]);
      setTaskTitle('');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAiPlan = async (e) => {
    e.preventDefault();
    if (!syllabusText.trim()) return;

    setAiLoading(true);
    try {
      const res = await apiClient.post('/assistant/todos/generate-ai-plan', {
        subject,
        syllabusText,
        days: prepDays
      });

      const newTasks = res.data.data || [];
      setTodos([...newTasks, ...todos]);
      setSyllabusText('');
      setSubject('');
      setShowAiModal(false);
    } catch (err) {
      console.error('AI Plan Error:', err);
      alert('Failed to generate AI plan. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleToggle = async (id) => {
    try {
      const res = await apiClient.put(`/assistant/todos/${id}`);
      setTodos(todos.map((t) => (t._id === id ? res.data.data : t)));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(`/assistant/todos/${id}`);
      setTodos(todos.filter((t) => t._id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className={styles.todoCard}>
      <div className={styles.sectionHeader}>
        <div>
          <h3>📝 TASKS & ASSIGNMENTS</h3>
          <p>Manage your daily goals and track completion</p>
        </div>

        {/* AI Plan Toggle Button */}
        <button
          type="button"
          className={styles.aiToggleBtn}
          onClick={() => setShowAiModal(!showAiModal)}
        >
          {showAiModal ? '✖ Close Generator' : '⚡ AI Study Plan Generator'}
        </button>
      </div>

      {/* AI Syllabus Input Card */}
      {showAiModal && (
        <form onSubmit={handleGenerateAiPlan} className={styles.aiFormCard}>
          <h4 className={styles.aiFormTitle}>🤖 Create Day-by-Day Plan from Syllabus</h4>
          
          <div className={styles.inputGroup}>
            <input
              type="text"
              placeholder="Subject Name (e.g. Physics, Data Structures)"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={styles.inputField}
              required
            />
            <input
              type="number"
              min="1"
              max="30"
              placeholder="Days left for exam"
              value={prepDays}
              onChange={(e) => setPrepDays(e.target.value)}
              className={styles.daysInput}
              required
            />
          </div>

          <textarea
            placeholder="Paste syllabus topics or chapter list here..."
            value={syllabusText}
            onChange={(e) => setSyllabusText(e.target.value)}
            className={styles.textareaField}
            rows="4"
            required
          />

          <button type="submit" className={styles.generateBtn} disabled={aiLoading}>
            {aiLoading ? 'AI Generating Daily Tasks...' : '✨ Generate & Add Daily Tasks'}
          </button>
        </form>
      )}

      {/* Manual Task Add Form */}
      <form onSubmit={handleAddTodo} className={styles.addForm}>
        <input
          type="text"
          className={styles.inputField}
          placeholder="What's your task for today?"
          value={taskTitle}
          onChange={(e) => setTaskTitle(e.target.value)}
          required
        />
        <select
          className={styles.selectPriority}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="low">Low Priority</option>
          <option value="medium">Medium Priority</option>
          <option value="high">High Priority</option>
        </select>
        <button type="submit" className={styles.addBtn} disabled={loading}>
          {loading ? 'Adding...' : '+ Add Task'}
        </button>
      </form>

      {/* Todo List Display */}
      <div className={styles.todoList}>
        {todos.length > 0 ? (
          todos.map((todo) => (
            <div key={todo._id} className={styles.todoItem}>
              <div className={styles.todoLeft}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={todo.completed}
                  onChange={() => handleToggle(todo._id)}
                />
                <span className={`${styles.todoTitle} ${todo.completed ? styles.completedText : ''}`}>
                  {todo.title}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span className={`${styles.priorityBadge} ${styles[todo.priority]}`}>
                  {todo.priority}
                </span>
                <button
                  type="button"
                  className={styles.delBtn}
                  onClick={() => handleDelete(todo._id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        ) : (
          <p style={{ textAlign: 'center', color: '#64748b', marginTop: '20px' }}>
            No tasks found. Create one above or use AI generator!
          </p>
        )}
      </div>
    </div>
  );
};

// Separate Export at Bottom
export default TodoSection;