import React from "react";
import { Category, Word } from "./types";
import { getWordNextReviewTimeMs } from "./utils";

/**
 * Render category options for <select> dropdowns, disabling parent categories that have subcategories
 */
export function renderCategoryOptions(categories: Category[]) {
  const topCategories = categories.filter(c => !c.parentId && !c.archived);
  const options: React.ReactNode[] = [];

  topCategories.forEach(parent => {
    const subCategories = categories.filter(c => c.parentId === parent.id && !c.archived);
    const hasSubs = subCategories.length > 0;

    options.push(
      React.createElement("option", {
        key: parent.id,
        value: parent.id,
        style: { fontWeight: "bold" }
      }, `${parent.icon || "📁"} ${parent.name}`)
    );

    if (hasSubs) {
      subCategories.forEach(sub => {
        options.push(
          React.createElement("option", {
            key: sub.id,
            value: sub.id
          }, `\u00A0\u00A0\u00A0\u00A0└─ ${sub.icon || "📖"} ${sub.name}`)
        );
      });
    }
  });

  return options;
}

/**
 * Return valid category ID or fallback to cat_base
 */
export function getValidCategoryId(catId: string, categories: Category[]): string {
  if (!catId) return "cat_base";
  const found = categories.find(c => c.id === catId && !c.archived);
  if (found) return found.id;
  return "cat_base";
}


export const DEFAULT_TOP_CATEGORIES = [
  { id: "cat_main", name: "Основной словарь", icon: "📁", parentId: null },
  { id: "cat_books", name: "Книги с сайта", icon: "📚", parentId: null },
  { id: "cat_movie_8", name: "Фильм «Омерзительная восьмёрка»", icon: "🎬", parentId: null },
  { id: "cat_tutor", name: "Занятия с репетитором", icon: "👨‍🏫", parentId: null },
];

export const DEFAULT_SUB_CATEGORIES = [
  { id: "cat_base", name: "Базовые слова", icon: "📌", parentId: "cat_main" },
  { id: "cat_phrases", name: "Разговорные фразы", icon: "💬", parentId: "cat_main" },
  { id: "cat_books_a1", name: "Уровень A1", icon: "📖", parentId: "cat_books" },
  { id: "cat_books_a2", name: "Уровень A2", icon: "📖", parentId: "cat_books" },
  { id: "cat_books_b1", name: "Уровень B1", icon: "📖", parentId: "cat_books" },
  { id: "cat_books_b2", name: "Уровень B2", icon: "📖", parentId: "cat_books" },
  { id: "cat_books_c1", name: "Уровень C1", icon: "📖", parentId: "cat_books" },
  { id: "cat_books_c2", name: "Уровень C2", icon: "📖", parentId: "cat_books" },
  { id: "cat_movie_8_ep1", name: "1 серия", icon: "🎞️", parentId: "cat_movie_8" },
  { id: "cat_movie_8_ep2", name: "2 серия", icon: "🎞️", parentId: "cat_movie_8" },
  { id: "cat_movie_8_ep3", name: "3 серия", icon: "🎞️", parentId: "cat_movie_8" },
  { id: "cat_tutor_lesson1", name: "Урок 1", icon: "📖", parentId: "cat_tutor" },
  { id: "cat_tutor_lesson2", name: "Урок 2", icon: "📖", parentId: "cat_tutor" },
];

export function ensureBookCategories(userCategories: Category[] | undefined | null, userId: string): Category[] {
  const current = (userCategories && userCategories.length > 0) ? userCategories : getDefaultCategories(userId);
  const existingIds = new Set(current.map(c => c.id));
  const now = new Date().toISOString();

  const toAdd: Category[] = [];

  if (!existingIds.has("cat_books") && !current.some(c => c.name === "Книги с сайта")) {
    toAdd.push({
      id: "cat_books",
      userId,
      name: "Книги с сайта",
      icon: "📚",
      parentId: null,
      archived: false,
      created: now,
    });
  }

  const bookSubCatsDefaults = [
    { id: "cat_books_a1", name: "Уровень A1" },
    { id: "cat_books_a2", name: "Уровень A2" },
    { id: "cat_books_b1", name: "Уровень B1" },
    { id: "cat_books_b2", name: "Уровень B2" },
    { id: "cat_books_c1", name: "Уровень C1" },
    { id: "cat_books_c2", name: "Уровень C2" },
  ];

  bookSubCatsDefaults.forEach(sc => {
    if (!existingIds.has(sc.id)) {
      toAdd.push({
        id: sc.id,
        userId,
        name: sc.name,
        icon: "📖",
        parentId: "cat_books",
        archived: false,
        created: now,
      });
    }
  });

  if (toAdd.length === 0) return current;
  return [...current, ...toAdd];
}

export function getDefaultCategories(userId: string): Category[] {
  const now = new Date().toISOString();
  return [
    ...DEFAULT_TOP_CATEGORIES.map(c => ({
      id: c.id,
      userId,
      name: c.name,
      parentId: c.parentId,
      icon: c.icon,
      archived: false,
      created: now,
    })),
    ...DEFAULT_SUB_CATEGORIES.map(c => ({
      id: c.id,
      userId,
      name: c.name,
      parentId: c.parentId,
      icon: c.icon,
      archived: false,
      created: now,
    })),
  ];
}

/**
  Recursively find all category IDs included in a parent category (including self and subfolders).
 */
export function getAllSubcategoryIds(categoryId: string | null | undefined, categories: Category[]): string[] {
  if (!categoryId) return [];
  const result: string[] = [categoryId];

  function findChildren(pId: string) {
    const children = categories.filter(c => c.parentId === pId && !c.archived);
    for (const child of children) {
      result.push(child.id);
      findChildren(child.id);
    }
  }

  findChildren(categoryId);
  return result;
}

/**
  Get path of category names for breadcrumbs, e.g. ["Фильм «Омерзительная восьмёрка»", "1 серия"]
 */
export function getCategoryPath(categoryId: string | null | undefined, categories: Category[]): Category[] {
  if (!categoryId) return [];
  const path: Category[] = [];
  let current = categories.find(c => c.id === categoryId);

  while (current) {
    path.unshift(current);
    if (!current.parentId) break;
    current = categories.find(c => c.id === current?.parentId);
  }

  return path;
}

/**
  Filter words belonging to a category or any of its subcategories.
  If categoryId is null or "all", returns all words.
 */
export function getWordsForCategory(words: Word[], categoryId: string | null | undefined, categories: Category[]): Word[] {
  if (!categoryId || categoryId === "all") return words;
  
  // "Основной словарь" (cat_main) contains ALL words automatically across all categories/subcategories
  if (categoryId === "cat_main") {
    return words;
  }

  const existingCatIds = new Set(categories.map(c => c.id));
  const targetIds = new Set(getAllSubcategoryIds(categoryId, categories));

  return words.filter(w => {
    // If word has an explicit categoryId
    if (w.categoryId) {
      if (targetIds.has(w.categoryId)) return true;
      // If the word's categoryId does NOT exist in active categories, fall back to cat_base
      if (!existingCatIds.has(w.categoryId) && categoryId === "cat_base") {
        return true;
      }
      return false;
    }
    // Fallback: if category is 'cat_base', include uncategorized words
    if (categoryId === "cat_base") {
      return true;
    }
    return false;
  });
}

/**
 * Check if a category or any of its parent categories is paused
 */
export function isCategoryPaused(categoryId: string, categories: Category[]): boolean {
  let currId: string | null = categoryId;
  const visited = new Set<string>();

  while (currId && !visited.has(currId)) {
    visited.add(currId);
    const cat = categories.find(c => c.id === currId);
    if (!cat) break;
    if (cat.paused) return true;
    currId = cat.parentId;
  }
  return false;
}

/**
  Calculate stats for a category (and its subcategories)
 */
export function getCategoryStats(words: Word[], categoryId: string, categories: Category[]) {
  const catWords = getWordsForCategory(words, categoryId, categories);
  const total = catWords.length;
  const learned = catWords.filter(w => w.learned).length;
  const unlearned = total - learned;

  const paused = isCategoryPaused(categoryId, categories);

  const dueForReview = paused ? 0 : catWords.filter(w => {
    if (!w.learned) return false;
    return getWordNextReviewTimeMs(w) <= Date.now();
  }).length;

  const percent = total > 0 ? Math.round((learned / total) * 100) : 0;

  return {
    total,
    learned,
    unlearned,
    dueForReview,
    percent,
    paused,
    catWords
  };
}
