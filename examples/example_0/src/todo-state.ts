import { create, derive } from "../../../src";

interface TodoItem {
  id: number;
  isDone: boolean;
  title: string;
}

interface TodoState {
  draftTitle: string;
  todos: TodoItem[];
}

let nextTodoId = 2;

const createTodoId = (): number => {
  nextTodoId += 1;
  return nextTodoId;
};

export const todoState = create<TodoState>({
  draftTitle: "",
  todos: [
    {
      id: 1,
      isDone: false,
      title: "Read mut-state docs",
    },
    {
      id: 2,
      isDone: true,
      title: "Build first todo",
    },
  ],
});

export const remainingCountState = derive(todoState, (snapshot) => {
  let remainingCount = 0;
  for (const todo of snapshot.todos) {
    if (todo.isDone) continue;
    remainingCount += 1;
  }

  return remainingCount;
});

export const setDraftTitle = (nextTitle: string): void => {
  todoState.set((draft) => {
    draft.draftTitle = nextTitle;
  });
};

export const addTodo = (): void => {
  const trimmedTitle = todoState.get().draftTitle.trim();
  if (trimmedTitle.length === 0) return;

  todoState.set((draft) => {
    draft.todos.push({
      id: createTodoId(),
      isDone: false,
      title: trimmedTitle,
    });
    draft.draftTitle = "";
  });
};

export const toggleTodo = (todoId: number): void => {
  todoState.set((draft) => {
    const targetTodo = draft.todos.find((todo) => todo.id === todoId);
    if (!targetTodo) return;
    targetTodo.isDone = !targetTodo.isDone;
  });
};

export const removeTodo = (todoId: number): void => {
  todoState.set((draft) => {
    const nextTodos = draft.todos.filter((todo) => todo.id !== todoId);
    draft.todos = nextTodos;
  });
};

export const clearCompletedTodos = (): void => {
  todoState.set((draft) => {
    draft.todos = draft.todos.filter((todo) => !todo.isDone);
  });
};
