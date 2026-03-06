import type {
  ChangeEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  ReactElement,
} from "react";

import { useStore } from "../../../src";
import {
  addTodo,
  clearCompletedTodos,
  remainingCountState,
  removeTodo,
  setDraftTitle,
  todoState,
  toggleTodo,
} from "./todo-state";
import "./styles.css";

const readTodoId = (todoIdText: string | undefined): number | null => {
  if (!todoIdText) return null;

  const parsedTodoId = Number.parseInt(todoIdText, 10);
  return Number.isNaN(parsedTodoId) ? null : parsedTodoId;
};

const handleTitleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
  setDraftTitle(event.currentTarget.value);
};

const handleTitleKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  addTodo();
};

const handleToggleTodo: ChangeEventHandler<HTMLInputElement> = (event) => {
  const todoId = readTodoId(event.currentTarget.dataset.todoId);
  if (todoId === null) return;
  toggleTodo(todoId);
};

const handleRemoveTodoClick: MouseEventHandler<HTMLButtonElement> = (event) => {
  const todoId = readTodoId(event.currentTarget.dataset.todoId);
  if (todoId === null) return;
  removeTodo(todoId);
};

const App = (): ReactElement => {
  const draftTitle = useStore(todoState, (snapshot) => snapshot.draftTitle);
  const todos = useStore(todoState, (snapshot) => snapshot.todos);
  const remainingCount = useStore(remainingCountState);

  return (
    <main className="todo-app">
      <section className="todo-card">
        <header className="todo-header">
          <h1>mut-state todo list</h1>
          <p>Simple Vite example using create + useStore + derive.</p>
        </header>

        <div className="todo-form">
          <input
            aria-label="Todo title"
            onChange={handleTitleChange}
            onKeyDown={handleTitleKeyDown}
            placeholder="Add a task"
            type="text"
            value={draftTitle}
          />
          <button onClick={addTodo} type="button">
            Add
          </button>
        </div>

        <ul className="todo-list">
          {todos.map((todo) => (
            <li className="todo-item" key={todo.id}>
              <label>
                <input
                  checked={todo.isDone}
                  data-todo-id={todo.id}
                  onChange={handleToggleTodo}
                  type="checkbox"
                />
                <span
                  className={todo.isDone ? "todo-title done" : "todo-title"}
                >
                  {todo.title}
                </span>
              </label>
              <button
                className="remove-button"
                data-todo-id={todo.id}
                onClick={handleRemoveTodoClick}
                type="button"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <footer className="todo-footer">
          <span>{remainingCount} remaining</span>
          <button onClick={clearCompletedTodos} type="button">
            Clear completed
          </button>
        </footer>
      </section>
    </main>
  );
};

export default App;
